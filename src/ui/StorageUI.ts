import { formatNumber } from '@/utils/formatNumber';
import { formatMoney } from '@/utils/currency';
import type { Storage } from '@/simulation/Storage';
import type { ResourceRegistry, ResourceDefinition } from '@/simulation/Resource';
import type { Market } from '@/economy/Market';
import type { Wallet } from '@/economy/Wallet';
import { eventBus } from '@/core/EventBus';
import { makeItemVisual } from './itemVisual';
import { getXPManager } from '@/economy/XPManager';
import { makeCloseButton } from './closeButton';
import { InputPopup } from './InputPopup';
import { isMobile } from '@/utils/platform';

const PANEL_WIDTH = 420;
const CART_PANEL_WIDTH = 720;

interface CartItem {
  resourceId: string;
  quantity: number;
  unitPrice: number;
}

/**
 * HTML-based Storage panel — centered on screen.
 * Shows inventory, capacity, buy resources (cart system), upgrade, and editable name.
 */
export class StorageUI {
  /** Pixi container stub — kept for API compat with UIManager */
  readonly container = { visible: false, addChild() {}, position: { set() {} } } as any;

  private panel: HTMLDivElement;
  private headerTitle: HTMLSpanElement;
  private contentDiv: HTMLDivElement;

  private storage: Storage | null = null;
  private resourceRegistry: ResourceRegistry;
  private market: Market;
  private wallet: Wallet;
  private visible = false;

  private nameGetter: (() => string) | null = null;
  private nameSetter: ((name: string) => void) | null = null;

  // Cart state
  private cartPanel: HTMLDivElement | null = null;
  private cart: CartItem[] = [];
  private searchQuery = '';

  private inputPopup = new InputPopup();
  private unsub: (() => void) | null = null;

  constructor(resourceRegistry: ResourceRegistry, market: Market, wallet: Wallet) {
    this.resourceRegistry = resourceRegistry;
    this.market = market;
    this.wallet = wallet;

    // Panel
    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      width: `min(${PANEL_WIDTH}px, calc(100vw - 24px))`, maxHeight: 'min(80vh, calc(100dvh - 48px))',
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
      padding: '10px 14px', borderBottom: '1px solid #2d3548', background: '#0d1525',
      borderRadius: '10px 10px 0 0',
    });

    this.headerTitle = document.createElement('span');
    this.headerTitle.textContent = 'STORAGE';
    this.headerTitle.style.fontWeight = '700';
    this.headerTitle.style.letterSpacing = '2px';

    // Pencil button
    const renameBtn = document.createElement('button');
    renameBtn.textContent = '\u270E'; // ✎
    Object.assign(renameBtn.style, {
      background: 'transparent', border: 'none', color: '#8892a4',
      cursor: 'pointer', fontSize: '14px', fontFamily: 'inherit',
      padding: '0 6px', marginLeft: '4px',
    });
    renameBtn.addEventListener('click', () => this.promptRename());

    const closeBtn = makeCloseButton(() => this.hide());

    const titleRow = document.createElement('div');
    titleRow.style.display = 'flex';
    titleRow.style.alignItems = 'center';
    titleRow.style.gap = '2px';
    titleRow.append(this.headerTitle, renameBtn);

    header.append(titleRow, closeBtn);
    this.panel.appendChild(header);

    // Content
    this.contentDiv = document.createElement('div');
    this.contentDiv.style.padding = '10px 14px';
    this.panel.appendChild(this.contentDiv);

    document.body.appendChild(this.panel);

    this.unsub = eventBus.on('StorageUpdated', () => {
      if (this.visible) this.rebuild();
    });
  }

  show(storage: Storage, getName?: () => string, setName?: (name: string) => void): void {
    this.storage = storage;
    this.nameGetter = getName ?? null;
    this.nameSetter = setName ?? null;
    this.visible = true;
    this.panel.style.display = '';
    this.closeCartPanel();
    this.rebuild();
  }

  hide(): void {
    this.visible = false;
    this.panel.style.display = 'none';
    this.storage = null;
    this.closeCartPanel();
  }

  isVisible(): boolean {
    return this.visible;
  }

  toggle(storage: Storage, getName?: () => string, setName?: (name: string) => void): void {
    if (this.visible && this.storage === storage) {
      this.hide();
    } else {
      this.show(storage, getName, setName);
    }
  }

  private promptRename(): void {
    const current = this.nameGetter?.() ?? '';
    this.inputPopup.show({
      title: 'RENAME STORAGE',
      placeholder: 'Enter a name...',
      value: current,
      maxLength: 20,
      confirmLabel: 'Rename',
      onConfirm: (value) => {
        if (this.nameSetter) {
          this.nameSetter(value.trim().slice(0, 20));
          this.rebuild();
        }
      },
    });
  }

  private closeCartPanel(): void {
    this.cart = [];
    this.searchQuery = '';
    if (this.cartPanel) {
      this.cartPanel.remove();
      this.cartPanel = null;
    }
  }

  // --- Helpers ---

  private el(tag: string, styles: Partial<CSSStyleDeclaration> = {}, text?: string): HTMLElement {
    const e = document.createElement(tag);
    Object.assign(e.style, styles);
    if (text !== undefined) e.textContent = text;
    return e;
  }

  private btn(text: string, color: string, onClick: () => void, disabled = false): HTMLElement {
    const b = this.el('button', {
      display: 'block', width: '100%', padding: '7px 0',
      background: disabled ? 'rgba(255,255,255,0.04)' : color,
      border: 'none', borderRadius: '6px', color: disabled ? '#8892a4' : '#e8e8e8',
      fontFamily: 'JetBrains Mono, monospace', fontSize: '11px',
      cursor: disabled ? 'default' : 'pointer', marginTop: '6px',
    }, text);
    if (!disabled) b.addEventListener('click', onClick);
    return b;
  }

  // --- Main rebuild ---

  private rebuild(): void {
    this.contentDiv.innerHTML = '';
    if (!this.storage) return;
    const storage = this.storage;

    // Title
    const displayName = this.nameGetter?.() || 'STORAGE';
    this.headerTitle.textContent = displayName;

    // Capacity row
    const capRow = this.el('div', { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' });
    capRow.appendChild(this.el('span', { color: '#f5c842', fontWeight: '600' }, `${formatNumber(storage.totalUsed)} / ${formatNumber(storage.maxCapacity)}`));
    if (storage.upgradeLevel > 0) {
      capRow.appendChild(this.el('span', { color: '#8B5E3C', fontSize: '10px' }, `Lv.${storage.upgradeLevel}`));
    }
    this.contentDiv.appendChild(capRow);

    // Capacity bar
    const barOuter = this.el('div', { height: '4px', background: 'rgba(74,85,104,0.5)', borderRadius: '2px', marginBottom: '10px' });
    const fillRatio = storage.maxCapacity > 0 ? storage.totalUsed / storage.maxCapacity : 0;
    if (fillRatio > 0) {
      const barFill = this.el('div', { height: '100%', width: `${Math.min(100, fillRatio * 100)}%`, background: '#8B5E3C', borderRadius: '2px' });
      barOuter.appendChild(barFill);
    }
    this.contentDiv.appendChild(barOuter);

    // Inventory
    const inventory = storage.getInventory();
    if (inventory.size === 0) {
      this.contentDiv.appendChild(this.el('div', { color: '#8892a4', padding: '8px 0' }, 'Empty'));
    } else {
      for (const [resourceId, qty] of inventory) {
        const def = this.resourceRegistry.get(resourceId);
        if (!def) continue;
        this.contentDiv.appendChild(this.createItemRow(def, qty));
      }
    }

    // Separator
    this.contentDiv.appendChild(this.el('hr', { border: 'none', borderTop: '1px solid rgba(136,146,164,0.15)', margin: '10px 0' }));

    // Buy button
    this.contentDiv.appendChild(this.btn('Buy Resources', 'rgba(83,215,105,0.25)', () => {
      if (this.cartPanel) this.closeCartPanel();
      else this.openCartPanel();
    }));

    // Upgrade button (infinite, +5 capacity each)
    const upgradeCost = storage.getUpgradeCost();
    const canAfford = this.wallet.canAfford(upgradeCost);
    const nextLvl = storage.upgradeLevel + 1;
    this.contentDiv.appendChild(this.btn(
      `Upgrade Lv.${nextLvl} +5 cap (${formatNumber(upgradeCost)})`,
      canAfford ? 'rgba(168,85,247,0.35)' : 'rgba(168,85,247,0.1)',
      () => { storage.upgrade(this.wallet); },
      !canAfford,
    ));
  }

  private createItemRow(def: ResourceDefinition, qty: number): HTMLElement {
    const row = this.el('div', {
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '6px 8px', marginBottom: '4px',
      background: 'rgba(28,37,65,0.8)', borderRadius: '6px',
    });

    const visual = makeItemVisual(def, 32);
    visual.style.flexShrink = '0';
    row.appendChild(visual);

    const info = this.el('div', { flex: '1', minWidth: '0' });
    info.appendChild(this.el('div', { fontSize: '11px', fontFamily: 'Inter, sans-serif' }, def.name));
    info.appendChild(this.el('div', { fontSize: '9px', color: '#8892a4', fontFamily: 'Inter, sans-serif' }, def.category));
    row.appendChild(info);

    row.appendChild(this.el('span', { color: '#f5c842', fontWeight: '600', flexShrink: '0' }, formatNumber(qty)));

    // Delete button
    const delBtn = this.el('button', {
      background: 'transparent', border: '1px solid rgba(233,69,96,0.3)',
      borderRadius: '4px', color: '#e94560',
      cursor: 'pointer', fontSize: '10px', fontWeight: '700',
      fontFamily: 'inherit', padding: '2px 6px', flexShrink: '0',
    }, '\u2212'); // − minus sign
    delBtn.addEventListener('pointerenter', () => { delBtn.style.background = 'rgba(233,69,96,0.15)'; });
    delBtn.addEventListener('pointerleave', () => { delBtn.style.background = 'transparent'; });
    delBtn.addEventListener('click', () => this.promptDeleteItem(def, qty));
    row.appendChild(delBtn);

    return row;
  }

  private promptDeleteItem(def: ResourceDefinition, currentQty: number): void {
    this.inputPopup.show({
      title: `DELETE ${def.name.toUpperCase()}`,
      placeholder: 'Quantity to delete...',
      value: '',
      inputType: 'number',
      quickActions: [
        { label: 'All', value: String(currentQty) },
        { label: 'Half', value: String(Math.ceil(currentQty / 2)) },
      ],
      confirmLabel: 'Delete',
      onConfirm: (value) => {
        const amount = parseInt(value);
        if (!this.storage || isNaN(amount) || amount <= 0) return;
        this.storage.withdraw(def.id, Math.min(amount, currentQty));
        eventBus.emit('StorageUpdated', { storageId: this.storage.id });
        this.rebuild();
      },
    });
  }

  // --- Cart-based buy panel ---

  private openCartPanel(): void {
    this.cart = [];
    this.searchQuery = '';

    this.cartPanel = document.createElement('div');
    Object.assign(this.cartPanel.style, {
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      width: `min(${CART_PANEL_WIDTH}px, calc(100vw - 24px))`, maxHeight: 'min(85vh, calc(100dvh - 48px))',
      background: '#16213e', border: '1px solid #2d3548',
      borderRadius: '10px', color: '#e8e8e8',
      fontFamily: 'Inter, sans-serif', fontSize: '12px',
      zIndex: '962', display: 'flex', flexDirection: 'column',
      boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
    });

    this.rebuildCartPanel();
    document.body.appendChild(this.cartPanel);
  }

  private rebuildCartPanel(): void {
    if (!this.cartPanel) return;
    this.cartPanel.innerHTML = '';
    const mobile = isMobile();

    // Adjust panel width for stacked vs side-by-side layout
    this.cartPanel.style.width = mobile
      ? `min(${PANEL_WIDTH}px, calc(100vw - 24px))`
      : `min(${CART_PANEL_WIDTH}px, calc(100vw - 24px))`;

    // Header
    const header = this.el('div', {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 14px', borderBottom: '1px solid #2d3548', background: '#0d1525',
      borderRadius: '10px 10px 0 0', flexShrink: '0',
    });
    header.appendChild(this.el('span', { fontWeight: '700', letterSpacing: '2px' }, 'BUY RESOURCES'));
    header.appendChild(makeCloseButton(() => this.closeCartPanel()));
    this.cartPanel.appendChild(header);

    // Search bar
    const searchRow = this.el('div', { padding: '8px 14px', flexShrink: '0' });
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search resources...';
    searchInput.value = this.searchQuery;
    Object.assign(searchInput.style, {
      width: '100%', padding: '6px 10px', background: '#0d1525',
      border: '1px solid #2d3548', borderRadius: '6px', color: '#e8e8e8',
      fontFamily: 'inherit', fontSize: '11px', outline: 'none',
      boxSizing: 'border-box',
    });
    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value;
      this.rebuildCartPanel();
    });
    searchRow.appendChild(searchInput);
    this.cartPanel.appendChild(searchRow);

    if (mobile) {
      // --- Stacked layout: items on top, cart at bottom ---

      // Item list (scrollable)
      const itemSection = this.el('div', {
        overflowY: 'auto', padding: '8px 14px',
        maxHeight: '35vh', borderBottom: '1px solid #2d3548',
      });
      this.buildItemGrid(itemSection);
      this.cartPanel.appendChild(itemSection);

      // Cart section at the bottom
      const cartSection = this.el('div', {
        display: 'flex', flexDirection: 'column',
        maxHeight: '30vh', overflow: 'hidden',
      });
      this.buildCartSidebar(cartSection);
      this.cartPanel.appendChild(cartSection);

    } else {
      // --- Desktop: side-by-side layout ---
      const body = this.el('div', {
        display: 'flex', flex: '1', overflow: 'hidden', minHeight: '0',
      });

      // Left: item grid
      const leftCol = this.el('div', {
        flex: '1', overflowY: 'auto', padding: '8px 14px',
        borderRight: '1px solid #2d3548',
      });
      this.buildItemGrid(leftCol);
      body.appendChild(leftCol);

      // Right: cart sidebar
      const rightCol = this.el('div', {
        width: '260px', flexShrink: '0', display: 'flex',
        flexDirection: 'column', overflow: 'hidden',
      });
      this.buildCartSidebar(rightCol);
      body.appendChild(rightCol);

      this.cartPanel.appendChild(body);
    }

    // Focus search on desktop only
    if (!mobile) {
      requestAnimationFrame(() => searchInput.focus());
    }
  }

  private buildItemGrid(container: HTMLElement): void {
    const xp = getXPManager();
    const allResources = this.resourceRegistry.getAll().filter(r =>
      r.origin === 'natural' && (!xp || xp.isUnlocked(r.requiredLevel ?? 0))
    );

    let filtered = allResources;
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      filtered = filtered.filter(r => r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
    }
    filtered.sort((a, b) => a.name.localeCompare(b.name));

    if (filtered.length === 0) {
      container.appendChild(this.el('div', { color: '#555', padding: '20px', textAlign: 'center' }, 'No items found'));
      return;
    }

    for (const res of filtered) {
      container.appendChild(this.buildItemCard(res));
    }
  }

  private buildItemCard(res: ResourceDefinition): HTMLElement {
    const unitPrice = this.market.getPrice(res.id);
    const card = this.el('div', {
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '6px 8px', marginBottom: '4px',
      background: 'rgba(28,37,65,0.8)', borderRadius: '6px',
    });

    const visual = makeItemVisual(res, 32);
    visual.style.flexShrink = '0';
    card.appendChild(visual);

    const info = this.el('div', { flex: '1', minWidth: '0' });
    info.appendChild(this.el('div', { fontSize: '11px', fontFamily: 'Inter, sans-serif' }, res.name));
    info.appendChild(this.el('div', { fontSize: '9px', color: '#53d769' }, `${formatMoney(unitPrice)} / unit`));
    card.appendChild(info);

    // Quantity buttons
    const btnRow = this.el('div', { display: 'flex', gap: '2px', flexShrink: '0' });
    for (const amt of [1, 5, 10, 100]) {
      const qb = this.el('button', {
        padding: '2px 5px', background: 'rgba(83,215,105,0.2)',
        border: '1px solid rgba(83,215,105,0.3)', borderRadius: '4px',
        color: '#53d769', cursor: 'pointer', fontSize: '9px',
        fontFamily: 'inherit', fontWeight: '600',
      }, `+${amt}`);
      qb.addEventListener('pointerenter', () => { qb.style.background = 'rgba(83,215,105,0.4)'; });
      qb.addEventListener('pointerleave', () => { qb.style.background = 'rgba(83,215,105,0.2)'; });
      qb.addEventListener('click', () => this.addToCart(res.id, amt, unitPrice));
      btnRow.appendChild(qb);
    }
    card.appendChild(btnRow);

    return card;
  }

  private buildCartSidebar(container: HTMLElement): void {
    // Cart header
    const cartHeader = this.el('div', {
      padding: '8px 12px', borderBottom: '1px solid #2d3548',
      fontWeight: '700', fontSize: '11px', color: '#f5c842',
      flexShrink: '0',
    });
    cartHeader.textContent = `Cart (${this.cart.length})`;
    container.appendChild(cartHeader);

    // Cart items (scrollable)
    const cartList = this.el('div', {
      flex: '1', overflowY: 'auto', padding: '6px 10px',
    });

    if (this.cart.length === 0) {
      cartList.appendChild(this.el('div', { color: '#555', padding: '16px 0', textAlign: 'center', fontSize: '10px' }, 'Empty cart'));
    } else {
      for (let i = 0; i < this.cart.length; i++) {
        cartList.appendChild(this.buildCartRow(i));
      }
    }
    container.appendChild(cartList);

    // Total + confirm
    const footer = this.el('div', {
      padding: '8px 12px', borderTop: '1px solid #2d3548', flexShrink: '0',
    });

    const totalCost = this.getCartTotalCost();
    const canAfford = this.wallet.canAfford(totalCost);
    const totalQty = this.cart.reduce((s, c) => s + c.quantity, 0);
    const hasSpace = (this.storage?.remainingCapacity ?? 0) >= totalQty;
    const canConfirm = this.cart.length > 0 && canAfford && hasSpace;

    footer.appendChild(this.el('div', {
      display: 'flex', justifyContent: 'space-between', marginBottom: '4px',
    }));
    const totalRow = footer.firstChild as HTMLElement;
    totalRow.appendChild(this.el('span', { color: '#8892a4' }, 'Total:'));
    totalRow.appendChild(this.el('span', {
      color: canAfford ? '#f5c842' : '#e94560', fontWeight: '700',
    }, `${formatMoney(totalCost)}`));

    if (!hasSpace && this.cart.length > 0) {
      footer.appendChild(this.el('div', { color: '#e94560', fontSize: '9px', marginBottom: '4px' }, 'Not enough storage space'));
    }

    const confirmBtn = this.el('button', {
      display: 'block', width: '100%', padding: '8px 0',
      background: canConfirm ? 'rgba(83,215,105,0.4)' : 'rgba(83,215,105,0.1)',
      border: 'none', borderRadius: '6px',
      color: canConfirm ? '#e8e8e8' : '#555',
      fontFamily: 'JetBrains Mono, monospace', fontSize: '11px',
      fontWeight: '700', cursor: canConfirm ? 'pointer' : 'default',
    }, `Confirm Purchase (${totalQty} items)`);
    if (canConfirm) {
      confirmBtn.addEventListener('click', () => this.confirmPurchase());
    }
    footer.appendChild(confirmBtn);
    container.appendChild(footer);
  }

  private buildCartRow(index: number): HTMLElement {
    const item = this.cart[index];
    const def = this.resourceRegistry.get(item.resourceId);

    const row = this.el('div', {
      display: 'flex', alignItems: 'center', gap: '6px',
      padding: '4px 6px', marginBottom: '3px',
      background: 'rgba(28,37,65,0.8)', borderRadius: '5px',
    });

    if (def) {
      const visual = makeItemVisual(def, 24);
      visual.style.flexShrink = '0';
      row.appendChild(visual);
    }

    // Name
    row.appendChild(this.el('div', {
      flex: '1', minWidth: '0', fontSize: '10px',
      fontFamily: 'Inter, sans-serif',
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }, def?.name ?? item.resourceId));

    // Editable qty
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.min = '1';
    qtyInput.max = '9999';
    qtyInput.value = String(item.quantity);
    Object.assign(qtyInput.style, {
      width: '48px', padding: '2px 4px', background: '#0d1525',
      border: '1px solid #2d3548', borderRadius: '4px', color: '#f5c842',
      fontFamily: 'inherit', fontSize: '10px', textAlign: 'center',
    });
    qtyInput.addEventListener('change', () => {
      const v = parseInt(qtyInput.value);
      if (v > 0) this.setCartQty(index, v);
      else this.removeFromCart(index);
    });
    row.appendChild(qtyInput);

    // Cost
    row.appendChild(this.el('span', {
      color: '#8892a4', fontSize: '9px', flexShrink: '0',
    }, `${formatMoney(item.unitPrice * item.quantity)}`));

    // Remove button
    const removeBtn = this.el('button', {
      background: 'transparent', border: 'none', color: '#e94560',
      cursor: 'pointer', fontSize: '12px', fontWeight: '700',
      fontFamily: 'inherit', padding: '0 2px', flexShrink: '0',
    }, '\u2715');
    removeBtn.addEventListener('click', () => this.removeFromCart(index));
    row.appendChild(removeBtn);

    return row;
  }

  // --- Cart operations ---

  private addToCart(resourceId: string, quantity: number, unitPrice: number): void {
    const existing = this.cart.find(c => c.resourceId === resourceId);
    if (existing) {
      existing.quantity += quantity;
    } else {
      this.cart.push({ resourceId, quantity, unitPrice });
    }
    this.rebuildCartPanel();
  }

  private setCartQty(index: number, qty: number): void {
    if (index >= 0 && index < this.cart.length) {
      this.cart[index].quantity = qty;
      this.rebuildCartPanel();
    }
  }

  private removeFromCart(index: number): void {
    this.cart.splice(index, 1);
    this.rebuildCartPanel();
  }

  private getCartTotalCost(): number {
    return this.cart.reduce((s, c) => s + c.unitPrice * c.quantity, 0);
  }

  private confirmPurchase(): void {
    if (!this.storage) return;
    const totalCost = this.getCartTotalCost();
    const totalQty = this.cart.reduce((s, c) => s + c.quantity, 0);
    if (!this.wallet.canAfford(totalCost)) return;
    if (this.storage.remainingCapacity < totalQty) return;

    // Execute all purchases
    for (const item of this.cart) {
      const bought = this.market.buy(item.resourceId, item.quantity);
      if (bought) {
        this.storage.deposit(bought.resourceId, bought.quantity);
      }
    }

    // Emit events
    eventBus.emit('StorageUpdated', { storageId: this.storage.id });
    eventBus.emit('ItemBought', { storageId: this.storage.id, itemId: '', cost: totalCost });

    this.closeCartPanel();
    this.rebuild();
  }

  positionAt(_screenWidth: number, _screenHeight: number): void {
    // No-op — HTML panel is always centered via CSS
  }

  destroy(): void {
    this.panel.remove();
    this.cartPanel?.remove();
    this.unsub?.();
  }
}
