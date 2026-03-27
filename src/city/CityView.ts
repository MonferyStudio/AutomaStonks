import { Container } from 'pixi.js';
import { CityRenderer } from './CityRenderer';
import type { CityLayout } from './CityLayoutData';
import type { CitySlot } from './CitySlot';
import { CameraController } from '@/rendering/CameraController';
import type { FleetManager } from '@/transport/FleetManager';
import type { PolyominoRegistry } from '@/simulation/PolyominoRegistry';
import type { CityTypeDefinition } from '@/world/CityType';
import type { Wallet } from '@/economy/Wallet';
import type { TickEngine } from '@/core/TickEngine';
import { CELL_SIZE_PX } from '@/utils/Constants';
import { loadCityLayout } from './CityLayoutLoader';
import { PurchaseTooltip } from '@/ui/PurchaseTooltip';
import { TruckTooltip } from '@/ui/TruckTooltip';
import type { ResourceRegistry } from '@/simulation/Resource';

export class CityView {
  readonly container: Container;
  readonly camera: CameraController;
  readonly renderer: CityRenderer;
  readonly layout: CityLayout;
  fleetManager: FleetManager | null = null;
  tickEngine: TickEngine | null = null;
  private wallet: Wallet;
  private worldContainer: Container;
  private polyRegistry: PolyominoRegistry;
  private purchaseTooltip: PurchaseTooltip;
  private truckTooltip: TruckTooltip;
  private screenWidth = 0;
  private screenHeight = 0;

  onSlotClicked: ((slot: CitySlot) => void) | null = null;
  onStorageClicked: ((slot: CitySlot) => void) | null = null;
  onShopClicked: ((slot: CitySlot) => void) | null = null;
  onBuildingClicked: ((buildingId: string) => void) | null = null;

  private _hoveredSlotKey: string | null = null;

  /** Building selection mode: when set, clicks on purchased buildings call this instead of normal handlers */
  buildingSelectionCallback: ((slot: CitySlot) => void) | null = null;
  /** Called after a slot is purchased */
  onSlotPurchased: ((slot: CitySlot) => void) | null = null;

  constructor(
    cityId: string,
    cityType: CityTypeDefinition,
    polyRegistry: PolyominoRegistry,
    wallet: Wallet,
    resourceRegistry: ResourceRegistry,
    seed?: number,
    unlockCost: number = 0,
    forceGenerate: boolean = false,
  ) {
    this.wallet = wallet;
    this.polyRegistry = polyRegistry;
    this.container = new Container();

    this.worldContainer = new Container();
    this.container.addChild(this.worldContainer);
    this.camera = new CameraController(this.worldContainer);

    const loaded = loadCityLayout(cityId, cityType, polyRegistry, seed, unlockCost, forceGenerate);
    this.layout = loaded.layout;

    const bgColor = loaded.bgColor ?? cityType.bgColor;
    this.renderer = new CityRenderer(polyRegistry, bgColor);
    this.renderer.setCityId(cityId);
    this.worldContainer.addChild(this.renderer.container);

    // Apply camera settings from layout
    if (this.layout.cameraBounds) {
      this.camera.bounds = this.layout.cameraBounds;
    }
    if (this.layout.zoomLimits) {
      this.camera.setZoomLimits(this.layout.zoomLimits.min, this.layout.zoomLimits.max);
    }

    this.purchaseTooltip = new PurchaseTooltip();
    this.container.addChild(this.purchaseTooltip.container);

    this.truckTooltip = new TruckTooltip(resourceRegistry);
    this.container.addChild(this.truckTooltip.container);

    // Wire hover detection for building labels
    this.camera.onHoverMove = (sx, sy) => this.handleHoverMove(sx, sy);
  }

  purchaseSlot(slot: CitySlot): boolean {
    if (slot.purchased) return false;
    if (slot.slotType !== 'factory' && slot.slotType !== 'storage') return false;
    if (!this.wallet.spendCoins(slot.cost)) return false;
    slot.purchased = true;
    this.renderer.markDirty();
    this.onSlotPurchased?.(slot);
    return true;
  }

  handleClick(screenX: number, screenY: number): void {
    // If truck tooltip is open, dismiss it first
    if (this.truckTooltip.isVisible) {
      this.truckTooltip.handleClick(screenX, screenY);
      return;
    }

    // If purchase tooltip is open, let it handle the click first
    if (this.purchaseTooltip.isVisible) {
      this.purchaseTooltip.handleClick(screenX, screenY);
      return;
    }

    const world = this.camera.screenToWorld(screenX, screenY);
    const wx = world.x;
    const wy = world.y;
    const gridX = Math.floor(wx / CELL_SIZE_PX);
    const gridY = Math.floor(wy / CELL_SIZE_PX);

    // Building selection mode — intercept clicks on purchased buildings
    if (this.buildingSelectionCallback) {
      const slot = this.findSlotAtWorld(wx, wy);
      if (slot && slot.purchased) {
        const cb = this.buildingSelectionCallback;
        this.buildingSelectionCallback = null; // One-shot
        cb(slot);
        return;
      }
      // Clicked on empty area or unpurchased slot — ignore
      return;
    }

    // Check trucks first (they render on top)
    if (this.fleetManager) {
      const truck = this.fleetManager.getTruckAtGrid(gridX, gridY);
      if (truck) {
        this.truckTooltip.show(truck, screenX, screenY, this.screenWidth, this.screenHeight);
        return;
      }
    }

    // Check factory slots
    for (const slot of this.layout.factorySlots) {
      if (slot.containsWorldPixel(wx, wy)) {
        if (!slot.purchased) {
          this.showPurchaseTooltip(slot, screenX, screenY);
        } else {
          this.onSlotClicked?.(slot);
        }
        return;
      }
    }

    // Check storage slots
    for (const slot of this.layout.storageSlots) {
      if (slot.containsWorldPixel(wx, wy)) {
        if (!slot.purchased) {
          this.showPurchaseTooltip(slot, screenX, screenY);
        } else {
          this.onStorageClicked?.(slot);
        }
        return;
      }
    }

    // Check shop slots
    for (const slot of this.layout.shopSlots) {
      if (slot.containsWorldPixel(wx, wy)) {
        if (!slot.purchased) {
          this.showPurchaseTooltip(slot, screenX, screenY);
        } else {
          this.onShopClicked?.(slot);
        }
        return;
      }
    }
  }

  private handleHoverMove(screenX: number, screenY: number): void {
    const world = this.camera.screenToWorld(screenX, screenY);
    const slot = this.findSlotAtWorld(world.x, world.y);
    const newKey = slot?.slotKey ?? null;
    if (newKey !== this._hoveredSlotKey) {
      this._hoveredSlotKey = newKey;
      this.renderer.setHoveredSlot(newKey);
    }
  }

  /** Find any slot at world pixel position */
  private findSlotAtWorld(wx: number, wy: number): CitySlot | null {
    const allSlots = [...this.layout.factorySlots, ...this.layout.storageSlots, ...this.layout.shopSlots];
    for (const slot of allSlots) {
      if (slot.containsWorldPixel(wx, wy)) return slot;
    }
    return null;
  }

  private showPurchaseTooltip(slot: CitySlot, screenX: number, screenY: number): void {
    this.purchaseTooltip.show(slot, screenX, screenY, this.screenWidth, this.screenHeight, (s) => {
      this.purchaseSlot(s);
    });
  }

  update(deltaMs: number = 0): void {
    this.renderer.updateFloatingText(deltaMs);

    // Feed truck data to renderer
    if (this.fleetManager) {
      const truckData: { truck: import('@/transport/Truck').Truck; route: import('@/transport/TruckRoute').TruckRoute }[] = [];
      for (const truck of this.fleetManager.getTrucks()) {
        if (!truck.routeId) continue;
        const route = this.fleetManager.getRouteById(truck.routeId);
        if (route) truckData.push({ truck, route });
      }
      const interpAlpha = this.tickEngine?.interpolationAlpha ?? 1;
      this.renderer.setTruckData(truckData, interpAlpha);
    }

    this.renderer.render(this.layout, this.layout.factorySlots, this.layout.shopSlots, this.layout.storageSlots);
  }

  centerCamera(screenWidth: number, screenHeight: number): void {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    this.camera.setScreenSize(screenWidth, screenHeight);
    const centerX = (this.layout.width * CELL_SIZE_PX) / 2;
    const centerY = (this.layout.height * CELL_SIZE_PX) / 2;
    this.camera.centerOn(centerX, centerY, screenWidth, screenHeight);
  }

  resize(screenWidth: number, screenHeight: number): void {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    this.camera.setScreenSize(screenWidth, screenHeight);
  }

  destroy(): void {
    this.renderer.destroy();
    this.container.destroy({ children: true });
  }
}
