import { Container } from 'pixi.js';
import { CityRenderer } from './CityRenderer';
import type { CityLayout } from './CityGenerator';
import type { CitySlot } from './CitySlot';
import { CameraController } from '@/rendering/CameraController';
import type { TransportManager } from '@/transport/TransportManager';
import type { PolyominoRegistry } from '@/simulation/PolyominoRegistry';
import type { CityTypeDefinition } from '@/world/CityType';
import type { Wallet } from '@/economy/Wallet';
import { CELL_SIZE_PX } from '@/utils/Constants';
import { loadCityLayout } from './CityLayoutLoader';
import { PurchaseTooltip } from '@/ui/PurchaseTooltip';

export class CityView {
  readonly container: Container;
  readonly camera: CameraController;
  readonly renderer: CityRenderer;
  readonly layout: CityLayout;
  private transportManager: TransportManager;
  private wallet: Wallet;
  private worldContainer: Container;
  private polyRegistry: PolyominoRegistry;
  private purchaseTooltip: PurchaseTooltip;
  private screenWidth = 0;
  private screenHeight = 0;

  onSlotClicked: ((slot: CitySlot) => void) | null = null;
  onStorageClicked: ((slot: CitySlot) => void) | null = null;
  onBuildingClicked: ((buildingId: string) => void) | null = null;

  constructor(
    cityId: string,
    cityType: CityTypeDefinition,
    polyRegistry: PolyominoRegistry,
    transportManager: TransportManager,
    wallet: Wallet,
    seed?: number,
    unlockCost: number = 0,
    forceGenerate: boolean = false,
  ) {
    this.transportManager = transportManager;
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
    this.worldContainer.addChild(this.renderer.container);

    this.purchaseTooltip = new PurchaseTooltip();
    this.container.addChild(this.purchaseTooltip.container);
  }

  purchaseSlot(slot: CitySlot): boolean {
    if (slot.purchased) return false;
    if (slot.slotType !== 'factory' && slot.slotType !== 'storage') return false;
    if (!this.wallet.spendCoins(slot.cost)) return false;
    slot.purchased = true;
    this.renderer.markDirty();
    return true;
  }

  handleClick(screenX: number, screenY: number): void {
    // If purchase tooltip is open, let it handle the click first
    if (this.purchaseTooltip.isVisible) {
      this.purchaseTooltip.handleClick(screenX, screenY);
      return;
    }

    const world = this.camera.screenToWorld(screenX, screenY);
    const gridX = Math.floor(world.x / CELL_SIZE_PX);
    const gridY = Math.floor(world.y / CELL_SIZE_PX);

    // Check factory slots
    for (const slot of this.layout.factorySlots) {
      const hit = slot.polyomino.cells.some(c =>
        gridX === slot.position.x + c.x && gridY === slot.position.y + c.y
      );
      if (hit) {
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
      const hit = slot.polyomino.cells.some(c =>
        gridX === slot.position.x + c.x && gridY === slot.position.y + c.y
      );
      if (hit) {
        if (!slot.purchased) {
          this.showPurchaseTooltip(slot, screenX, screenY);
        } else {
          this.onStorageClicked?.(slot);
        }
        return;
      }
    }
  }

  private showPurchaseTooltip(slot: CitySlot, screenX: number, screenY: number): void {
    this.purchaseTooltip.show(slot, screenX, screenY, this.screenWidth, this.screenHeight, (s) => {
      this.purchaseSlot(s);
    });
  }

  update(): void {
    const routes = this.transportManager.getRoutes();
    this.renderer.render(this.layout, this.layout.factorySlots, this.layout.shopSlots, this.layout.storageSlots, routes);
  }

  centerCamera(screenWidth: number, screenHeight: number): void {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    const centerX = (this.layout.width * CELL_SIZE_PX) / 2;
    const centerY = (this.layout.height * CELL_SIZE_PX) / 2;
    this.camera.centerOn(centerX, centerY, screenWidth, screenHeight);
  }

  resize(screenWidth: number, screenHeight: number): void {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
  }

  destroy(): void {
    this.renderer.destroy();
    this.container.destroy({ children: true });
  }
}
