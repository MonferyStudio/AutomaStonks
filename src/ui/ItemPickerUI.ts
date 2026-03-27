import type { ResourceDefinition, ResourceRegistry, ResourceMaterial } from '@/simulation/Resource';
import { formatNumber } from '@/utils/formatNumber';
import { formatMoney } from '@/utils/currency';
import { makeItemVisual as makeItemVisualFn } from './itemVisual';
import { makeCloseButton } from './closeButton';
import { isMobile } from '@/utils/platform';

export type ItemPickerMode = 'select' | 'buy';

export interface ItemPickerConfig {
  mode: ItemPickerMode;
  /** Title shown at the top of the picker */
  title?: string;
  /** Resource registry to list items from */
  resourceRegistry: ResourceRegistry;
  /** Optional: only these resource IDs are selectable (others grayed out) */
  availableItems?: string[];
  /** Optional: already-selected items (shown with checkmark) */
  selectedItems?: string[];
  /** Optional: get the sell price for a resource (fleet mode, shop-specific) */
  getSellPrice?: (resourceId: string) => number;
  /** Optional: get the buy price for a resource (storage mode) */
  getBuyPrice?: (resourceId: string) => number;
  /** Optional: filter predicate — only resources passing this are shown */
  filter?: (res: ResourceDefinition) => boolean;
  /** Callback when selection changes */
  onConfirm: (selectedIds: string[]) => void;
  /** Callback when cancelled */
  onCancel: () => void;
}

const MATERIAL_LABELS: Record<ResourceMaterial, string> = {
  wood: 'Wood',
  stone: 'Stone',
  metal: 'Metal',
  food: 'Food',
  fluid: 'Fluid',
  misc: 'Misc',
};

const MATERIAL_COLORS: Record<ResourceMaterial, string> = {
  wood: '#8B5E3C',
  stone: '#A0968C',
  metal: '#9696A0',
  food: '#53d769',
  fluid: '#4dc9f6',
  misc: '#8892a4',
};

export class ItemPickerUI {
  private overlay: HTMLDivElement;
  private panel: HTMLDivElement;
  private contentDiv: HTMLDivElement;
  private selected: Set<string>;
  private config: ItemPickerConfig | null = null;
  private searchQuery = '';
  private activeFilter: ResourceMaterial | null = null;

  constructor() {
    // Backdrop overlay
    this.overlay = document.createElement('div');
    Object.assign(this.overlay.style, {
      position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
      background: 'rgba(0,0,0,0.4)', zIndex: '960', display: 'none',
    });
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.cancel();
    });

    // Panel
    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 'min(500px, calc(100vw - 24px))', maxHeight: 'min(80vh, calc(100dvh - 48px))',
      background: '#16213e', border: '1px solid #2d3548',
      borderRadius: '10px', color: '#e8e8e8',
      fontFamily: 'Inter, sans-serif', fontSize: '12px',
      display: 'flex', flexDirection: 'column',
      boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      zIndex: '961',
    });

    this.contentDiv = document.createElement('div');
    this.panel.appendChild(this.contentDiv);
    this.overlay.appendChild(this.panel);
    document.body.appendChild(this.overlay);
    this.selected = new Set();
  }

  show(config: ItemPickerConfig): void {
    this.config = config;
    this.selected = new Set(config.selectedItems ?? []);
    this.searchQuery = '';
    this.activeFilter = null;
    this.overlay.style.display = 'block';
    this.rebuild();
  }

  hide(): void {
    this.overlay.style.display = 'none';
    this.config = null;
  }

  get isVisible(): boolean {
    return this.overlay.style.display !== 'none';
  }

  private cancel(): void {
    this.config?.onCancel();
    this.hide();
  }

  private confirm(): void {
    this.config?.onConfirm([...this.selected]);
    this.hide();
  }

  private rebuild(): void {
    this.contentDiv.innerHTML = '';
    if (!this.config) return;
    const { resourceRegistry, title, mode } = this.config;

    // Header
    const header = this.el('div', {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 14px', borderBottom: '1px solid #2d3548', background: '#0d1525',
      borderRadius: '10px 10px 0 0',
    });
    header.appendChild(this.el('span', { fontWeight: '700', letterSpacing: '1px' },
      title ?? (mode === 'buy' ? 'BUY RESOURCES' : 'SELECT ITEMS')));
    const closeBtn = makeCloseButton(() => this.cancel());
    header.appendChild(closeBtn);
    this.contentDiv.appendChild(header);

    // Search bar
    const searchRow = this.el('div', { padding: '8px 14px' });
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search...';
    searchInput.value = this.searchQuery;
    Object.assign(searchInput.style, {
      width: '100%', padding: '6px 10px', background: '#0d1525',
      border: '1px solid #2d3548', borderRadius: '6px', color: '#e8e8e8',
      fontFamily: 'inherit', fontSize: '11px', outline: 'none',
      boxSizing: 'border-box',
    });
    searchInput.addEventListener('input', () => {
      this.searchQuery = searchInput.value;
      this.rebuildGrid();
    });
    searchRow.appendChild(searchInput);
    this.contentDiv.appendChild(searchRow);

    // Material filter tabs
    const filterRow = this.el('div', {
      display: 'flex', gap: '4px', padding: '0 14px 8px', flexWrap: 'wrap',
    });
    // "All" tab
    filterRow.appendChild(this.makeFilterTab('All', null));
    for (const mat of Object.keys(MATERIAL_LABELS) as ResourceMaterial[]) {
      filterRow.appendChild(this.makeFilterTab(MATERIAL_LABELS[mat], mat));
    }
    this.contentDiv.appendChild(filterRow);

    // Grid container (scrollable)
    const gridContainer = this.el('div', {
      overflowY: 'auto', maxHeight: '45vh', padding: '0 14px 8px',
    });
    gridContainer.id = 'item-picker-grid';
    this.contentDiv.appendChild(gridContainer);
    this.rebuildGrid();

    // Selected items summary (for select mode)
    if (mode === 'select') {
      const selectedRow = this.el('div', {
        padding: '8px 14px', borderTop: '1px solid #2d3548',
        display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center',
        minHeight: '32px',
      });
      if (this.selected.size === 0) {
        selectedRow.appendChild(this.el('span', { color: '#555', fontSize: '10px' }, 'No filter — all items'));
      } else {
        for (const id of this.selected) {
          const def = resourceRegistry.get(id);
          if (!def) continue;
          const tag = this.el('span', {
            background: '#2d3548', padding: '2px 8px', borderRadius: '4px',
            fontSize: '10px', display: 'inline-flex', alignItems: 'center', gap: '4px',
          });
          tag.appendChild(this.makeColorDot(def, 8));
          tag.appendChild(document.createTextNode(def.name));
          const removeBtn = this.el('span', {
            cursor: 'pointer', color: '#e94560', fontWeight: '700', marginLeft: '2px',
          }, 'x');
          removeBtn.addEventListener('click', () => {
            this.selected.delete(id);
            this.rebuild();
          });
          tag.appendChild(removeBtn);
          selectedRow.appendChild(tag);
        }
      }
      this.contentDiv.appendChild(selectedRow);
    }

    // Footer buttons
    const footer = this.el('div', {
      display: 'flex', gap: '8px', padding: '8px 14px 12px',
      justifyContent: 'flex-end', borderTop: '1px solid #2d3548',
    });
    if (mode === 'select') {
      footer.appendChild(this.makeBtn('Cancel', 'rgba(233,69,96,0.25)', () => this.cancel()));
      footer.appendChild(this.makeBtn('Confirm', 'rgba(83,215,105,0.35)', () => this.confirm()));
    }
    this.contentDiv.appendChild(footer);

    // Focus search after render (skip on mobile to avoid keyboard popup)
    if (!isMobile()) {
      requestAnimationFrame(() => searchInput.focus());
    }
  }

  private rebuildGrid(): void {
    const gridContainer = this.contentDiv.querySelector('#item-picker-grid');
    if (!gridContainer || !this.config) return;
    gridContainer.innerHTML = '';

    const { resourceRegistry, availableItems, mode, getSellPrice, getBuyPrice, filter } = this.config;
    const allResources = resourceRegistry.getAll();

    // Filter
    let filtered = allResources;
    if (filter) {
      filtered = filtered.filter(filter);
    }
    if (this.activeFilter) {
      filtered = filtered.filter(r => r.material === this.activeFilter);
    }
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      filtered = filtered.filter(r => r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q));
    }

    // Sort: available first, then alphabetical
    const availSet = availableItems ? new Set(availableItems) : null;
    filtered.sort((a, b) => {
      if (availSet) {
        const aAvail = availSet.has(a.id) ? 0 : 1;
        const bAvail = availSet.has(b.id) ? 0 : 1;
        if (aAvail !== bAvail) return aAvail - bAvail;
      }
      return a.name.localeCompare(b.name);
    });

    // Grid — smaller cells on mobile so prices are visible
    const colMin = isMobile() ? '90px' : '130px';
    const grid = this.el('div', {
      display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${colMin}, 1fr))`,
      gap: '6px',
    });

    for (const res of filtered) {
      const isAvailable = !availSet || availSet.has(res.id);
      const isSelected = this.selected.has(res.id);
      grid.appendChild(this.makeItemCard(res, isAvailable, isSelected, mode, getSellPrice, getBuyPrice));
    }

    if (filtered.length === 0) {
      grid.appendChild(this.el('div', { color: '#555', padding: '20px', textAlign: 'center', gridColumn: '1 / -1' }, 'No items found'));
    }

    gridContainer.appendChild(grid);
  }

  private makeItemCard(
    res: ResourceDefinition,
    isAvailable: boolean,
    isSelected: boolean,
    mode: ItemPickerMode,
    getSellPrice?: (id: string) => number,
    getBuyPrice?: (id: string) => number,
  ): HTMLElement {
    const card = this.el('div', {
      background: isSelected ? 'rgba(83,215,105,0.15)' : 'rgba(28,37,65,0.8)',
      border: isSelected ? '1px solid rgba(83,215,105,0.5)' : '1px solid transparent',
      borderRadius: '8px', padding: '8px 6px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
      cursor: isAvailable ? 'pointer' : 'default',
      opacity: isAvailable ? '1' : '0.35',
      transition: 'border-color 0.15s, background 0.15s',
    });

    if (isAvailable) {
      card.addEventListener('pointerenter', () => {
        if (!this.selected.has(res.id)) {
          card.style.borderColor = 'rgba(77,201,246,0.4)';
        }
      });
      card.addEventListener('pointerleave', () => {
        card.style.borderColor = this.selected.has(res.id) ? 'rgba(83,215,105,0.5)' : 'transparent';
      });
      card.addEventListener('click', () => {
        if (mode === 'select') {
          if (this.selected.has(res.id)) {
            this.selected.delete(res.id);
          } else {
            this.selected.add(res.id);
          }
          this.rebuild();
        } else if (mode === 'buy') {
          // In buy mode, clicking selects for purchase — callback immediately
          this.config?.onConfirm([res.id]);
          this.hide();
        }
      });
    }

    // Item visual (sprite or colored shape)
    const visualSize = isMobile() ? 32 : 48;
    const visual = this.makeItemVisual(res, visualSize);
    card.appendChild(visual);

    // Name
    card.appendChild(this.el('div', {
      fontSize: '10px', fontFamily: 'Inter, sans-serif',
      textAlign: 'center', lineHeight: '1.2',
      overflow: 'hidden', textOverflow: 'ellipsis',
      whiteSpace: 'nowrap', width: '100%',
    }, res.name));

    // Price line
    if (getSellPrice) {
      const price = getSellPrice(res.id);
      if (price > 0) {
        card.appendChild(this.el('div', {
          fontSize: '9px', color: '#f5c842', fontWeight: '600',
        }, `Sell: ${formatMoney(price)}`));
      }
    }
    if (getBuyPrice) {
      const price = getBuyPrice(res.id);
      if (price > 0) {
        card.appendChild(this.el('div', {
          fontSize: '9px', color: '#53d769', fontWeight: '600',
        }, `Buy: ${formatMoney(price)}`));
      }
    }

    // Selection indicator
    if (mode === 'select' && isSelected) {
      card.appendChild(this.el('div', {
        fontSize: '9px', color: '#53d769', fontWeight: '700',
      }, '\u2713 Selected'));
    }

    return card;
  }

  /** Create a visual representation of a resource item (sprite or canvas shape) */
  makeItemVisual(res: ResourceDefinition, size: number): HTMLElement {
    return makeItemVisualFn(res, size);
  }

  private makeColorDot(res: ResourceDefinition, size: number): HTMLElement {
    const dot = this.el('div', {
      width: `${size}px`, height: `${size}px`, borderRadius: '50%',
      background: '#' + res.color.toString(16).padStart(6, '0'),
      flexShrink: '0',
    });
    return dot;
  }

  private makeFilterTab(label: string, material: ResourceMaterial | null): HTMLElement {
    const active = this.activeFilter === material;
    const color = material ? MATERIAL_COLORS[material] : '#8892a4';
    const tab = this.el('button', {
      padding: '3px 8px', borderRadius: '4px', fontSize: '9px',
      fontFamily: 'inherit', cursor: 'pointer',
      background: active ? color : 'transparent',
      color: active ? '#fff' : color,
      border: `1px solid ${active ? color : 'rgba(136,146,164,0.3)'}`,
      fontWeight: active ? '700' : '400',
      transition: 'all 0.15s',
    }, label);
    tab.addEventListener('click', () => {
      this.activeFilter = material;
      this.rebuild();
    });
    return tab;
  }

  private makeBtn(text: string, bg: string, onClick: () => void): HTMLElement {
    const btn = this.el('button', {
      background: bg, color: '#e8e8e8', border: 'none', borderRadius: '6px',
      padding: '6px 16px', cursor: 'pointer', fontFamily: 'inherit',
      fontSize: '11px', fontWeight: '600',
    }, text);
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
    this.overlay.remove();
  }
}
