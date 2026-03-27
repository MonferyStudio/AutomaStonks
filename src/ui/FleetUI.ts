import type { FleetManager } from '@/transport/FleetManager';
import type { Truck } from '@/transport/Truck';
import type { TruckRoute, RouteEndpointType } from '@/transport/TruckRoute';
import type { CitySlot } from '@/city/CitySlot';
import type { CityLayout } from '@/city/CityLayoutData';
import type { RoadNetwork } from '@/city/RoadNetwork';
import type { ResourceRegistry } from '@/simulation/Resource';
import type { Storage } from '@/simulation/Storage';
import type { CityShop } from '@/economy/CityShop';
import { ItemPickerUI } from './ItemPickerUI';
import { InputPopup } from './InputPopup';
import { formatNumber } from '@/utils/formatNumber';
import { formatMoney } from '@/utils/currency';
import { TRUCK_COLORS, getTruckColor } from '@/data/truckColors';
import { makeCloseButton } from './closeButton';

/** Pending route data while the user is building a route interactively */
interface PendingRoute {
  fromType?: RouteEndpointType;
  fromSlotKey?: string;
  fromSlot?: CitySlot;
  toType?: RouteEndpointType;
  toSlotKey?: string;
  toSlot?: CitySlot;
  itemFilter: string[];
}

/**
 * HTML-based fleet management panel for the city view.
 * Uses interactive building selection mode instead of dropdowns.
 */
export class FleetUI {
  private panel: HTMLDivElement;
  private contentDiv: HTMLDivElement;
  private fleetManager: FleetManager;
  private layout: CityLayout | null = null;
  private roadNetwork: RoadNetwork | null = null;
  private resourceRegistry: ResourceRegistry | null = null;
  private getStorageForSlot: ((slotKey: string) => Storage | null) | null = null;
  private getOutputPortItems: ((slotKey: string) => { resourceId: string; qty: number }[]) | null = null;
  private getShopForSlot: ((slotKey: string) => CityShop | null) | null = null;
  private getBuildingName: ((slotKey: string) => string | undefined) | null = null;
  private visible = false;

  /** Per-truck pending route data (while building a route interactively) */
  private pendingRoutes = new Map<string, PendingRoute>();

  /** Building selection mode state */
  private selectionMode: { truckId: string; endpoint: 'from' | 'to' } | null = null;
  private selectionBar: HTMLDivElement | null = null;

  /** Shared item picker */
  private itemPicker: ItemPickerUI;
  private inputPopup = new InputPopup();

  /** Called when the panel changes something that requires a renderer update */
  onDirty: (() => void) | null = null;

  /** Called to enter building selection mode on the city map */
  onStartBuildingSelection: ((callback: (slot: CitySlot) => void) => void) | null = null;
  /** Called to cancel building selection mode */
  onCancelBuildingSelection: (() => void) | null = null;

  constructor(fleetManager: FleetManager) {
    this.fleetManager = fleetManager;

    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 'min(460px, calc(100vw - 24px))', maxHeight: 'min(80vh, calc(100dvh - 48px))',
      background: '#16213e', border: '1px solid #2d3548',
      borderRadius: '10px', color: '#e8e8e8',
      fontFamily: 'Inter, sans-serif', fontSize: '12px',
      overflowY: 'auto', zIndex: '950', display: 'none',
      boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
    });

    // Header
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 12px', borderBottom: '1px solid #2d3548', background: '#0d1525',
      borderRadius: '8px 8px 0 0',
    });
    const title = document.createElement('span');
    title.textContent = 'Truck Management';
    title.style.fontWeight = '700';
    const closeBtn = makeCloseButton(() => this.hide());
    header.append(title, closeBtn);
    this.panel.appendChild(header);

    this.contentDiv = document.createElement('div');
    this.contentDiv.style.padding = '8px';
    this.panel.appendChild(this.contentDiv);

    document.body.appendChild(this.panel);

    this.itemPicker = new ItemPickerUI();
  }

  setCityContext(
    fleetManager: FleetManager,
    layout: CityLayout,
    roadNetwork: RoadNetwork,
    resourceRegistry: ResourceRegistry,
    getStorageForSlot: (slotKey: string) => Storage | null,
    getOutputPortItems?: (slotKey: string) => { resourceId: string; qty: number }[],
    getShopForSlot?: (slotKey: string) => CityShop | null,
    getBuildingName?: (slotKey: string) => string | undefined,
  ): void {
    this.fleetManager = fleetManager;
    this.layout = layout;
    this.roadNetwork = roadNetwork;
    this.resourceRegistry = resourceRegistry;
    this.getStorageForSlot = getStorageForSlot;
    this.getOutputPortItems = getOutputPortItems ?? null;
    this.getShopForSlot = getShopForSlot ?? null;
    this.getBuildingName = getBuildingName ?? null;
  }

  show(): void {
    if (this.selectionMode) return; // Don't show during selection
    this.visible = true;
    this.panel.style.display = 'block';
    this.refresh();
  }

  hide(): void {
    this.visible = false;
    this.panel.style.display = 'none';
  }

  toggle(): void {
    if (this.visible) this.hide(); else this.show();
  }

  get isVisible(): boolean { return this.visible; }

  /** Whether we're currently in building selection mode */
  get isSelecting(): boolean { return this.selectionMode !== null; }

  refresh(): void {
    if (!this.visible) return;
    this.contentDiv.innerHTML = '';

    const trucks = this.fleetManager.getTrucks();
    const routes = this.fleetManager.getRoutes();

    for (const truck of trucks) {
      this.contentDiv.appendChild(this.buildTruckCard(truck, routes));
    }

    // Buy button
    const buyRow = document.createElement('div');
    Object.assign(buyRow.style, {
      padding: '10px', textAlign: 'center', borderTop: '1px solid #2d3548',
      marginTop: '6px',
    });
    const cost = this.fleetManager.getNextTruckCost();
    const buyBtn = this.makeButton(`Buy Truck — ${formatMoney(cost)}`, '#a855f7', () => {
      this.fleetManager.purchaseTruck();
      this.refresh();
    });
    buyRow.appendChild(buyBtn);
    this.contentDiv.appendChild(buyRow);
  }

  // ── Building Selection Mode ──────────────────────────────────────

  private startSelection(truckId: string, endpoint: 'from' | 'to'): void {
    this.selectionMode = { truckId, endpoint };

    // Hide fleet panel temporarily
    this.panel.style.display = 'none';

    // Show instruction bar
    this.showSelectionBar(endpoint);

    // Request city view to enter selection mode
    this.onStartBuildingSelection?.((slot: CitySlot) => {
      this.completeSelection(slot);
    });
  }

  private completeSelection(slot: CitySlot): void {
    if (!this.selectionMode) return;
    const { truckId, endpoint } = this.selectionMode;
    const slotType = slot.slotType as RouteEndpointType;
    const slotKey = slot.slotKey;

    // Get or create pending route for this truck
    let pending = this.pendingRoutes.get(truckId);
    if (!pending) {
      pending = { itemFilter: [] };
      this.pendingRoutes.set(truckId, pending);
    }

    if (endpoint === 'from') {
      pending.fromType = slotType;
      pending.fromSlotKey = slotKey;
      pending.fromSlot = slot;
      // Reset item filter when changing source
      pending.itemFilter = [];
    } else {
      pending.toType = slotType;
      pending.toSlotKey = slotKey;
      pending.toSlot = slot;
    }

    // Clean up selection mode
    this.selectionMode = null;
    this.hideSelectionBar();

    // Reopen fleet panel
    this.panel.style.display = 'block';

    // Auto-create route if both endpoints are set
    if (pending.fromSlotKey && pending.toSlotKey && pending.fromType && pending.toType) {
      // If destination is shop, prompt for item filter first
      if (pending.toType === 'shop') {
        this.openItemFilterPicker(truckId, pending);
      } else {
        this.finalizeRoute(truckId, pending);
      }
    } else {
      this.refresh();
    }
  }

  cancelSelection(): void {
    this.selectionMode = null;
    this.hideSelectionBar();
    this.panel.style.display = 'block';
    this.refresh();
  }

  private showSelectionBar(endpoint: 'from' | 'to'): void {
    this.hideSelectionBar();
    this.selectionBar = document.createElement('div');
    Object.assign(this.selectionBar.style, {
      position: 'fixed', top: '0', left: '0', width: '100%',
      padding: '10px 0', textAlign: 'center',
      background: endpoint === 'from' ? 'rgba(77,201,246,0.9)' : 'rgba(168,85,247,0.9)',
      color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: '13px',
      fontWeight: '700', zIndex: '960',
      boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px',
    });
    const label = endpoint === 'from'
      ? 'Click a building to set as FROM (source)'
      : 'Click a building to set as TO (destination)';
    this.selectionBar.appendChild(document.createTextNode(label));

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    Object.assign(cancelBtn.style, {
      background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '4px',
      padding: '4px 12px', color: '#fff', cursor: 'pointer',
      fontFamily: 'inherit', fontSize: '11px', fontWeight: '600',
    });
    cancelBtn.addEventListener('click', () => {
      this.onCancelBuildingSelection?.();
      this.cancelSelection();
    });
    this.selectionBar.appendChild(cancelBtn);

    document.body.appendChild(this.selectionBar);
  }

  private hideSelectionBar(): void {
    this.selectionBar?.remove();
    this.selectionBar = null;
  }

  // ── Item Filter Picker ───────────────────────────────────────────

  private openItemFilterPicker(truckId: string, pending: PendingRoute): void {
    if (!this.resourceRegistry) return;

    // Determine available items at source
    const availableItems = this.getAvailableItemsAtSource(pending.fromType!, pending.fromSlotKey!);

    // Get sell prices if destination is a shop
    let getSellPrice: ((id: string) => number) | undefined;
    if (pending.toType === 'shop' && pending.toSlotKey && this.getShopForSlot) {
      const shop = this.getShopForSlot(pending.toSlotKey);
      if (shop) {
        getSellPrice = (id) => shop.getSellPrice(id);
      }
    }

    this.itemPicker.show({
      mode: 'select',
      title: 'SELECT ITEMS TO TRANSPORT',
      resourceRegistry: this.resourceRegistry,
      availableItems: availableItems.length > 0 ? availableItems : undefined,
      selectedItems: [...pending.itemFilter],
      getSellPrice,
      onConfirm: (selected) => {
        pending.itemFilter = selected;
        this.finalizeRoute(truckId, pending);
      },
      onCancel: () => {
        // Keep pending route, just refresh
        this.refresh();
      },
    });
  }

  private openEditItemFilter(truckId: string, route: TruckRoute): void {
    if (!this.resourceRegistry) return;

    const availableItems = this.getAvailableItemsAtSource(route.fromType, route.fromSlotKey);

    let getSellPrice: ((id: string) => number) | undefined;
    if (route.toType === 'shop' && this.getShopForSlot) {
      const shop = this.getShopForSlot(route.toSlotKey);
      if (shop) {
        getSellPrice = (id) => shop.getSellPrice(id);
      }
    }

    this.itemPicker.show({
      mode: 'select',
      title: 'EDIT ITEM FILTER',
      resourceRegistry: this.resourceRegistry,
      availableItems: availableItems.length > 0 ? availableItems : undefined,
      selectedItems: [...route.itemFilter],
      getSellPrice,
      onConfirm: (selected) => {
        route.itemFilter = selected;
        this.refresh();
        this.onDirty?.();
      },
      onCancel: () => {},
    });
  }

  private getAvailableItemsAtSource(type: RouteEndpointType, slotKey: string): string[] {
    if (type === 'storage' && this.getStorageForSlot) {
      const storage = this.getStorageForSlot(slotKey);
      if (storage) {
        return [...storage.getInventory().keys()].filter(k => storage.getStock(k) > 0);
      }
    }
    if (type === 'factory' && this.getOutputPortItems) {
      const items = this.getOutputPortItems(slotKey);
      return items.map(i => i.resourceId);
    }
    return [];
  }

  // ── Route Finalization ───────────────────────────────────────────

  private finalizeRoute(truckId: string, pending: PendingRoute): void {
    if (!pending.fromSlot || !pending.toSlot || !pending.fromType || !pending.toType) return;
    if (!this.roadNetwork) return;

    const fromPos = pending.fromSlot.truckStop ?? pending.fromSlot.position;
    const toPos = pending.toSlot.truckStop ?? pending.toSlot.position;
    const route = this.fleetManager.createRoute(
      pending.fromSlotKey!, pending.toSlotKey!,
      fromPos, toPos,
      this.roadNetwork, pending.fromType, pending.toType,
    );
    if (!route) {
      console.warn('[Fleet] Route creation failed — no path found',
        'from:', fromPos.x, fromPos.y, 'to:', toPos.x, toPos.y,
        'fromKey:', pending.fromSlotKey, 'toKey:', pending.toSlotKey);
      this.refresh();
      return;
    }
    console.log('[Fleet] Route created:', route.id, 'path length:', route.path.length,
      'from:', fromPos.x, fromPos.y, 'to:', toPos.x, toPos.y);
    if (pending.itemFilter.length > 0) {
      route.itemFilter = [...pending.itemFilter];
    }
    this.fleetManager.assignTruckToRoute(truckId, route.id);
    this.pendingRoutes.delete(truckId);
    this.refresh();
    this.onDirty?.();
  }

  // ── Truck Card ───────────────────────────────────────────────────

  private buildTruckCard(truck: Truck, routes: readonly TruckRoute[]): HTMLDivElement {
    const card = document.createElement('div');
    Object.assign(card.style, {
      background: '#1c2541', borderRadius: '8px', padding: '10px 12px',
      marginBottom: '6px', border: '1px solid #2d3548',
    });

    // Title row
    const titleRow = this.el('div', {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px',
    });
    const titleLeft = this.el('div', { display: 'flex', alignItems: 'center', gap: '6px' });
    titleLeft.appendChild(this.buildColorSwatch(truck));
    const displayName = truck.name || `Truck #${truck.index + 1}`;
    titleLeft.appendChild(this.el('span', { fontWeight: '700', fontSize: '12px' }, displayName));

    // Pencil button to rename
    const renameBtn = this.el('span', {
      cursor: 'pointer', fontSize: '11px', opacity: '0.5',
      marginLeft: '2px', userSelect: 'none',
    }, '✎');
    renameBtn.title = 'Rename';
    renameBtn.addEventListener('pointerenter', () => { renameBtn.style.opacity = '1'; });
    renameBtn.addEventListener('pointerleave', () => { renameBtn.style.opacity = '0.5'; });
    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.inputPopup.show({
        title: 'RENAME TRUCK',
        placeholder: `Truck #${truck.index + 1}`,
        value: truck.name,
        maxLength: 20,
        confirmLabel: 'Rename',
        onConfirm: (val) => {
          truck.name = val.trim().slice(0, 20);
          this.refresh();
        },
      });
    });
    titleLeft.appendChild(renameBtn);
    titleRow.appendChild(titleLeft);
    titleRow.appendChild(this.el('span', {
      color: this.stateColor(truck), fontSize: '10px', fontWeight: '600',
    }, this.stateLabel(truck)));
    card.appendChild(titleRow);

    // Stats
    const statsRow = this.el('div', { color: '#8892a4', marginBottom: '8px', fontSize: '10px' });
    statsRow.textContent = `Lv.${truck.level} ${truck.tier.name} | Spd ${truck.speed.toFixed(2)} | Cap ${truck.maxCargo} | Load ${truck.loadTicks}t`;
    card.appendChild(statsRow);

    // Route display or route builder
    const route = truck.routeId ? routes.find(r => r.id === truck.routeId) : null;
    if (route) {
      card.appendChild(this.buildRouteDisplay(truck, route));
    } else {
      card.appendChild(this.buildRouteBuilder(truck));
    }

    // Cargo — mini cards with sprites and quantities
    if (truck.cargo.length > 0) {
      const cargoSection = this.el('div', { marginTop: '6px' });
      cargoSection.appendChild(this.el('div', {
        color: '#8892a4', fontSize: '9px', marginBottom: '4px',
      }, 'Cargo:'));
      const cargoCards = this.el('div', {
        display: 'flex', flexWrap: 'wrap', gap: '4px',
      });
      for (const c of truck.cargo) {
        cargoCards.appendChild(this.makeItemMiniCard(c.resourceId, c.quantity));
      }
      cargoSection.appendChild(cargoCards);
      card.appendChild(cargoSection);
    }

    // Upgrade
    card.appendChild(this.buildUpgradeBtn(truck));

    return card;
  }

  private buildRouteDisplay(truck: Truck, route: TruckRoute): HTMLElement {
    const container = this.el('div', { display: 'flex', flexDirection: 'column', gap: '4px' });

    // FROM row
    const fromRow = this.el('div', { display: 'flex', alignItems: 'center', gap: '6px' });
    fromRow.appendChild(this.makeEndpointBadge('FROM', '#4dc9f6'));
    fromRow.appendChild(this.el('span', { fontSize: '10px' }, this.getEndpointLabel(route.fromType, route.fromSlotKey)));
    container.appendChild(fromRow);

    // Arrow
    container.appendChild(this.el('div', {
      textAlign: 'center', color: '#555', fontSize: '10px', lineHeight: '1',
    }, '\u2193'));

    // TO row
    const toRow = this.el('div', { display: 'flex', alignItems: 'center', gap: '6px' });
    toRow.appendChild(this.makeEndpointBadge('TO', '#a855f7'));
    toRow.appendChild(this.el('span', { fontSize: '10px' }, this.getEndpointLabel(route.toType, route.toSlotKey)));
    container.appendChild(toRow);

    // Item filter — mini cards with sprites
    if (route.itemFilter.length > 0) {
      const filterSection = this.el('div', { marginTop: '6px' });
      const filterHeader = this.el('div', {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '4px',
      });
      filterHeader.appendChild(this.el('span', { color: '#8892a4', fontSize: '9px' }, 'Items:'));
      const editBtn = this.el('button', {
        background: 'transparent', border: '1px solid rgba(136,146,164,0.3)',
        borderRadius: '3px', padding: '1px 8px', fontSize: '9px',
        color: '#4dc9f6', cursor: 'pointer', fontFamily: 'inherit',
      }, 'Edit');
      editBtn.addEventListener('click', () => this.openEditItemFilter(truck.id, route));
      filterHeader.appendChild(editBtn);
      filterSection.appendChild(filterHeader);

      const cardsRow = this.el('div', {
        display: 'flex', flexWrap: 'wrap', gap: '4px',
      });
      for (const itemId of route.itemFilter) {
        cardsRow.appendChild(this.makeItemMiniCard(itemId));
      }
      filterSection.appendChild(cardsRow);
      container.appendChild(filterSection);
    }

    // Unassign button
    const btnRow = this.el('div', { marginTop: '6px' });
    btnRow.appendChild(this.makeButton('Unassign Route', 'rgba(233,69,96,0.3)', () => {
      this.fleetManager.unassignTruck(truck.id);
      this.fleetManager.removeRoute(route.id);
      this.refresh();
      this.onDirty?.();
    }));
    container.appendChild(btnRow);

    return container;
  }

  private buildRouteBuilder(truck: Truck): HTMLElement {
    const container = this.el('div', { display: 'flex', flexDirection: 'column', gap: '6px' });
    const pending = this.pendingRoutes.get(truck.id);

    // FROM button
    const fromRow = this.el('div', { display: 'flex', alignItems: 'center', gap: '6px' });
    if (pending?.fromSlotKey && pending?.fromType) {
      fromRow.appendChild(this.makeEndpointBadge('FROM', '#4dc9f6'));
      fromRow.appendChild(this.el('span', { fontSize: '10px', flex: '1' },
        this.getEndpointLabel(pending.fromType, pending.fromSlotKey)));
      const changeBtn = this.el('button', {
        background: 'transparent', border: '1px solid rgba(77,201,246,0.3)',
        borderRadius: '4px', padding: '2px 8px', fontSize: '9px',
        color: '#4dc9f6', cursor: 'pointer', fontFamily: 'inherit',
      }, 'Change');
      changeBtn.addEventListener('click', () => this.startSelection(truck.id, 'from'));
      fromRow.appendChild(changeBtn);
    } else {
      fromRow.appendChild(this.makeSelectionButton('FROM', '#4dc9f6', () => {
        this.startSelection(truck.id, 'from');
      }));
    }
    container.appendChild(fromRow);

    // Arrow
    container.appendChild(this.el('div', {
      textAlign: 'center', color: '#555', fontSize: '10px', lineHeight: '1',
    }, '\u2193'));

    // TO button
    const toRow = this.el('div', { display: 'flex', alignItems: 'center', gap: '6px' });
    if (pending?.toSlotKey && pending?.toType) {
      toRow.appendChild(this.makeEndpointBadge('TO', '#a855f7'));
      toRow.appendChild(this.el('span', { fontSize: '10px', flex: '1' },
        this.getEndpointLabel(pending.toType, pending.toSlotKey)));
      const changeBtn = this.el('button', {
        background: 'transparent', border: '1px solid rgba(168,85,247,0.3)',
        borderRadius: '4px', padding: '2px 8px', fontSize: '9px',
        color: '#a855f7', cursor: 'pointer', fontFamily: 'inherit',
      }, 'Change');
      changeBtn.addEventListener('click', () => this.startSelection(truck.id, 'to'));
      toRow.appendChild(changeBtn);
    } else {
      toRow.appendChild(this.makeSelectionButton('TO', '#a855f7', () => {
        this.startSelection(truck.id, 'to');
      }));
    }
    container.appendChild(toRow);

    // If both are set but not yet finalized (waiting for item selection)
    if (pending?.fromSlotKey && pending?.toSlotKey) {
      const assignRow = this.el('div', { display: 'flex', gap: '6px', marginTop: '4px' });
      // Items button (optional)
      if (pending.toType === 'shop' || pending.toType === 'storage') {
        const itemBtn = this.makeButton(
          pending.itemFilter.length > 0
            ? `Items (${pending.itemFilter.length})`
            : 'Select Items',
          'rgba(245,200,66,0.3)',
          () => this.openItemFilterPicker(truck.id, pending),
        );
        assignRow.appendChild(itemBtn);
      }
      // Assign button
      assignRow.appendChild(this.makeButton('Create Route', 'rgba(83,215,105,0.4)', () => {
        this.finalizeRoute(truck.id, pending);
      }));
      container.appendChild(assignRow);
    }

    return container;
  }

  // ── UI Helpers ───────────────────────────────────────────────────

  /** Create a compact item card with sprite + name (+ optional quantity) */
  private makeItemMiniCard(resourceId: string, quantity?: number): HTMLElement {
    const def = this.resourceRegistry?.get(resourceId);
    const card = this.el('div', {
      display: 'flex', alignItems: 'center', gap: '5px',
      background: '#2d3548', padding: '3px 8px 3px 4px', borderRadius: '5px',
      fontSize: '9px',
    });
    // Sprite visual
    if (def) {
      const visual = this.itemPicker.makeItemVisual(def, 32);
      visual.style.flexShrink = '0';
      card.appendChild(visual);
    }
    // Name
    card.appendChild(this.el('span', {
      fontFamily: 'Inter, sans-serif', whiteSpace: 'nowrap',
    }, def?.name ?? resourceId));
    // Quantity badge
    if (quantity !== undefined) {
      card.appendChild(this.el('span', {
        color: '#f5c842', fontWeight: '600', marginLeft: '2px',
      }, `x${quantity}`));
    }
    return card;
  }

  private makeSelectionButton(label: string, color: string, onClick: () => void): HTMLElement {
    const btn = document.createElement('button');
    Object.assign(btn.style, {
      display: 'flex', alignItems: 'center', gap: '6px',
      width: '100%', padding: '8px 12px',
      background: 'rgba(28,37,65,0.8)',
      border: `1px dashed ${color}`,
      borderRadius: '6px', color,
      cursor: 'pointer', fontFamily: 'inherit', fontSize: '11px',
      fontWeight: '600', transition: 'background 0.15s',
    });
    btn.addEventListener('pointerenter', () => { btn.style.background = 'rgba(28,37,65,1)'; });
    btn.addEventListener('pointerleave', () => { btn.style.background = 'rgba(28,37,65,0.8)'; });
    btn.addEventListener('click', onClick);

    const icon = this.el('span', { fontSize: '14px' }, '\u25CE'); // ◎
    btn.appendChild(icon);
    btn.appendChild(document.createTextNode(`Click to select ${label}`));
    return btn;
  }

  private makeEndpointBadge(label: string, color: string): HTMLElement {
    return this.el('span', {
      background: color, color: '#fff', padding: '1px 6px',
      borderRadius: '3px', fontSize: '9px', fontWeight: '700',
      flexShrink: '0',
    }, label);
  }

  private makeColorDot(color: number, size: number): HTMLElement {
    return this.el('span', {
      display: 'inline-block', width: `${size}px`, height: `${size}px`,
      borderRadius: '50%',
      background: '#' + color.toString(16).padStart(6, '0'),
      flexShrink: '0',
    });
  }

  private getEndpointLabel(type: RouteEndpointType, slotKey: string): string {
    if (type === 'shop') {
      const shopSlot = this.layout?.shopSlots.find(s => s.slotKey === slotKey);
      if (shopSlot?.shopConfig) return shopSlot.shopConfig.name;
      return `Shop @ ${slotKey}`;
    }
    // Use custom building name if available
    const customName = this.getBuildingName?.(slotKey);
    if (customName) return customName;
    const prefix = type === 'storage' ? 'Storage' : 'Factory';
    return `${prefix} @ ${slotKey}`;
  }

  private getResourceName(id: string): string {
    return this.resourceRegistry?.get(id)?.name ?? id;
  }

  private buildUpgradeBtn(truck: Truck): HTMLElement {
    const cost = this.fleetManager.getUpgradeCost(truck);
    const tierUp = truck.nextLevelTier;
    const tierLabel = tierUp ? ` → ${tierUp.name}` : '';
    const text = cost !== null ? `Upgrade Lv.${truck.level + 1}${tierLabel} — ${formatMoney(cost)}` : 'MAX LEVEL';
    const btn = this.makeButton(text, cost !== null ? 'rgba(77,201,246,0.3)' : 'rgba(51,51,51,0.3)', () => {
      if (cost !== null) {
        this.fleetManager.upgradeTruck(truck);
        this.refresh();
      }
    });
    Object.assign(btn.style, {
      fontSize: '10px', padding: '6px 10px', marginTop: '8px', width: '100%',
      textAlign: 'center',
    });
    if (cost === null) btn.style.opacity = '0.5';
    return btn;
  }

  /** Small clickable color swatch that opens a color picker dropdown */
  private buildColorSwatch(truck: Truck): HTMLElement {
    const color = getTruckColor(truck.colorVariant);
    const swatch = document.createElement('div');
    Object.assign(swatch.style, {
      width: '16px', height: '16px', borderRadius: '3px', cursor: 'pointer',
      border: '2px solid #3d4a60', flexShrink: '0',
      background: `linear-gradient(135deg, #${color.dark.toString(16).padStart(6, '0')} 50%, #${color.light.toString(16).padStart(6, '0')} 50%)`,
    });
    swatch.title = `Color: ${color.name}`;
    swatch.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showColorPicker(truck, swatch);
    });
    return swatch;
  }

  /** Show a small dropdown with all color options */
  private showColorPicker(truck: Truck, anchor: HTMLElement): void {
    // Remove any existing picker
    const existing = document.getElementById('truck-color-picker');
    if (existing) existing.remove();

    const picker = document.createElement('div');
    picker.id = 'truck-color-picker';
    Object.assign(picker.style, {
      position: 'absolute', zIndex: '9999',
      background: '#16213e', border: '1px solid #3d4a60', borderRadius: '6px',
      padding: '6px', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px',
    });

    for (const c of TRUCK_COLORS) {
      const opt = document.createElement('div');
      const darkHex = '#' + c.dark.toString(16).padStart(6, '0');
      const lightHex = '#' + c.light.toString(16).padStart(6, '0');
      Object.assign(opt.style, {
        width: '20px', height: '20px', borderRadius: '3px', cursor: 'pointer',
        background: `linear-gradient(135deg, ${darkHex} 50%, ${lightHex} 50%)`,
        border: c.id === truck.colorVariant ? '2px solid #e8e8e8' : '2px solid transparent',
      });
      opt.title = c.name;
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        truck.colorVariant = c.id;
        picker.remove();
        this.refresh();
      });
      picker.appendChild(opt);
    }

    // Position below the anchor
    const rect = anchor.getBoundingClientRect();
    picker.style.left = `${rect.left}px`;
    picker.style.top = `${rect.bottom + 4}px`;
    document.body.appendChild(picker);

    // Close on click outside
    const closeHandler = (ev: MouseEvent) => {
      if (!picker.contains(ev.target as Node)) {
        picker.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
  }

  private stateLabel(truck: Truck): string {
    switch (truck.state) {
      case 'idle': return 'Idle';
      case 'loading': return 'Loading...';
      case 'moving_to_dest': return 'Delivering';
      case 'unloading': return 'Unloading...';
      case 'moving_to_origin': return 'Returning';
    }
  }

  private stateColor(truck: Truck): string {
    switch (truck.state) {
      case 'idle': return '#8892a4';
      case 'loading': return '#f5c842';
      case 'moving_to_dest': return '#53d769';
      case 'unloading': return '#4dc9f6';
      case 'moving_to_origin': return '#a855f7';
    }
  }

  private makeButton(text: string, bg: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = text;
    Object.assign(btn.style, {
      background: bg, color: '#e8e8e8', border: 'none', borderRadius: '4px',
      padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit',
      fontSize: '10px', fontWeight: '600',
    });
    btn.addEventListener('click', onClick);
    return btn;
  }

  private el(tag: string, styles: Partial<CSSStyleDeclaration> = {}, text?: string): HTMLElement {
    const e = document.createElement(tag);
    Object.assign(e.style, styles);
    if (text !== undefined) e.textContent = text;
    return e;
  }

  destroy(): void {
    this.panel.remove();
    this.hideSelectionBar();
    this.itemPicker.destroy();
  }
}
