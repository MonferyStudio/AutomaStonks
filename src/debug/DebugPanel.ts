import type { Game } from '@/core/Game';
import type { CityShop, ShopDefinition } from '@/economy/CityShop';
import { CITY_TYPES } from '@/world/CityType';
import { COLORS, CELL_SIZE_PX as CS } from '@/utils/Constants';
import { Vector2 } from '@/utils/Vector2';
import { Polyomino } from '@/simulation/Polyomino';
import { CitySlot } from '@/city/CitySlot';
import { serializeCityLayout } from '@/city/CityLayoutData';
import { hasCityJson } from '@/city/CityLayoutLoader';

type TabId = 'world' | 'city' | 'factory' | 'general';
type PickMode =
  | 'none'
  | 'place_city' | 'move_city'
  | 'add_road' | 'remove_road'
  | 'place_building'
  | 'paint_building';

interface PaintState {
  buildingType: 'factory' | 'shop' | 'storage';
  cells: Vector2[];
  color: number;
  cost: number;
  /** If editing an existing building, reference to it */
  editingSlot?: CitySlot;
  /** Original cells before editing (for cancel/restore) */
  originalCells?: Vector2[];
  originalPosition?: Vector2;
}

/**
 * Dev-only debug panel. Entirely DOM-based so we get native inputs/selects.
 * Tree-shaken out of production builds via `import.meta.env.DEV` guard.
 */
export class DebugPanel {
  private root: HTMLDivElement;
  private panel: HTMLDivElement;
  private tabContent: HTMLDivElement;
  private activeTab: TabId = 'general';
  private game: Game;
  private isOpen = false;

  // Pick mode state
  private pickMode: PickMode = 'none';
  private pickCityData: { name: string; typeId: string; unlockCost: number } | null = null;
  private movingCityId: string | null = null;
  private placeBuildingData: { type: 'factory' | 'shop' | 'storage'; polyId: string; color: number; cost: number } | null = null;
  private paintState: PaintState | null = null;
  private banner: HTMLDivElement | null = null;
  private pickUpHandler: ((e: MouseEvent) => void) | null = null;
  private pickDownHandler: ((e: MouseEvent) => void) | null = null;
  private escHandler: ((e: KeyboardEvent) => void) | null = null;
  private shopSidePanel: HTMLDivElement | null = null;
  private zoneEditorPopup: HTMLDivElement | null = null;

  constructor(game: Game) {
    this.game = game;

    // Toggle button (top-right)
    const btn = document.createElement('button');
    btn.id = 'debug-toggle';
    btn.textContent = 'DBG';
    Object.assign(btn.style, {
      position: 'fixed', top: '10px', right: '10px', zIndex: '9999',
      width: '42px', height: '28px', border: '1px solid #a855f7',
      borderRadius: '4px', background: '#16213e', color: '#e8e8e8',
      fontFamily: 'monospace', fontSize: '11px', fontWeight: '700',
      cursor: 'pointer', opacity: '0.7',
    } as CSSStyleDeclaration);
    btn.addEventListener('mouseenter', () => btn.style.opacity = '1');
    btn.addEventListener('mouseleave', () => btn.style.opacity = '0.7');
    btn.addEventListener('click', () => this.toggle());
    document.body.appendChild(btn);

    // Root container
    this.root = document.createElement('div');
    this.root.id = 'debug-panel-root';
    Object.assign(this.root.style, {
      position: 'fixed', top: '44px', right: '10px', zIndex: '9998',
      width: '340px', maxHeight: 'calc(100vh - 60px)', display: 'none',
      fontFamily: 'JetBrains Mono, monospace', fontSize: '11px',
      color: '#e8e8e8', borderRadius: '8px', overflow: 'hidden',
      border: '1px solid rgba(168,85,247,0.3)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
    } as CSSStyleDeclaration);
    document.body.appendChild(this.root);

    // Tab bar
    const tabBar = document.createElement('div');
    Object.assign(tabBar.style, {
      display: 'flex', background: '#0d1525', borderBottom: '1px solid #2d3548',
    } as CSSStyleDeclaration);
    this.root.appendChild(tabBar);

    const tabs: { id: TabId; label: string }[] = [
      { id: 'general', label: 'General' },
      { id: 'world', label: 'World' },
      { id: 'city', label: 'City' },
      { id: 'factory', label: 'Factory' },
    ];
    for (const tab of tabs) {
      const t = document.createElement('button');
      t.textContent = tab.label;
      t.dataset.tab = tab.id;
      Object.assign(t.style, {
        flex: '1', padding: '6px 0', border: 'none', cursor: 'pointer',
        background: 'transparent', color: '#8892a4', fontSize: '10px',
        fontFamily: 'inherit', fontWeight: '600', borderBottom: '2px solid transparent',
      } as CSSStyleDeclaration);
      t.addEventListener('click', () => this.switchTab(tab.id));
      tabBar.appendChild(t);
    }

    // Panel body
    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      background: '#16213e', padding: '0', overflowY: 'auto',
      maxHeight: 'calc(100vh - 100px)',
    } as CSSStyleDeclaration);
    this.root.appendChild(this.panel);

    this.tabContent = document.createElement('div');
    Object.assign(this.tabContent.style, { padding: '10px' } as CSSStyleDeclaration);
    this.panel.appendChild(this.tabContent);

    this.switchTab('general');
  }

  private toggle(): void {
    this.isOpen = !this.isOpen;
    this.root.style.display = this.isOpen ? 'block' : 'none';
    // Show/hide debug overlays on the city renderer
    const cityView = this.game.getCurrentCityView?.();
    if (cityView) {
      cityView.renderer.showDebugOverlay = this.isOpen;
      cityView.renderer.markDirty();
    }
    if (this.isOpen) this.refreshTab();
  }

  private switchTab(id: TabId): void {
    this.activeTab = id;
    const buttons = this.root.querySelectorAll('[data-tab]') as NodeListOf<HTMLButtonElement>;
    for (const b of buttons) {
      const active = b.dataset.tab === id;
      b.style.color = active ? '#e8e8e8' : '#8892a4';
      b.style.borderBottomColor = active ? '#a855f7' : 'transparent';
      b.style.background = active ? '#1c2541' : 'transparent';
    }
    this.refreshTab();
  }

  private refreshTab(): void {
    this.tabContent.innerHTML = '';
    switch (this.activeTab) {
      case 'general': this.buildGeneralTab(); break;
      case 'world': this.buildWorldTab(); break;
      case 'city': this.buildCityTab(); break;
      case 'factory': this.buildFactoryTab(); break;
    }
  }

  // ─── Pick Mode (click-on-map) ─────────────────────────────

  private enterPickMode(mode: PickMode, message: string): void {
    this.cancelPickMode();
    this.pickMode = mode;

    // Show banner at top of screen
    this.banner = document.createElement('div');
    this.banner.textContent = message + '  [Right-click to confirm / ESC to cancel]';
    Object.assign(this.banner.style, {
      position: 'fixed', top: '0', left: '0', right: '0', zIndex: '10001',
      padding: '8px 0', textAlign: 'center', background: '#a855f7',
      color: '#fff', fontFamily: 'monospace', fontSize: '12px', fontWeight: '700',
    } as CSSStyleDeclaration);
    document.body.appendChild(this.banner);

    const canvas = this.game.app.canvas as HTMLCanvasElement;
    canvas.style.cursor = 'crosshair';

    // Use right-click (mousedown button=2) to place/move.
    // mousedown is the most reliable event for right-click detection.
    // We need the canvas bounding rect to compute offsetX/Y from clientX/Y
    // because mousedown on document doesn't have offsetX relative to canvas.
    this.pickUpHandler = (e: MouseEvent) => {
      if (e.button !== 2) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      // Compute offset relative to canvas
      const rect = canvas.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;
      this.handlePick(offsetX, offsetY);
    };

    // Block context menu during pick mode (on window to catch everything)
    this.pickDownHandler = (e: MouseEvent) => {
      e.preventDefault();
    };

    window.addEventListener('contextmenu', this.pickDownHandler as EventListener, true);
    window.addEventListener('mousedown', this.pickUpHandler as EventListener, true);

    // ESC to cancel
    this.escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.cancelPickMode();
    };
    document.addEventListener('keydown', this.escHandler);
  }

  private cancelPickMode(): void {
    // If we were painting, finalize the building
    if (this.pickMode === 'paint_building' && this.paintState) {
      this.finalizePaint();
    }
    this.pickMode = 'none';
    this.pickCityData = null;
    this.movingCityId = null;
    this.placeBuildingData = null;
    this.paintState = null;
    // Clear paint preview overlay
    const cityView = (this.game as any).activeCityView;
    if (cityView) cityView.renderer.clearPaintPreview();
    if (this.banner) { this.banner.remove(); this.banner = null; }
    const canvas = this.game.app.canvas as HTMLCanvasElement;
    if (this.pickDownHandler) {
      window.removeEventListener('contextmenu', this.pickDownHandler as EventListener, true);
      this.pickDownHandler = null;
    }
    if (this.pickUpHandler) {
      window.removeEventListener('mousedown', this.pickUpHandler as EventListener, true);
      this.pickUpHandler = null;
    }
    if (this.escHandler) {
      document.removeEventListener('keydown', this.escHandler);
      this.escHandler = null;
    }
    canvas.style.cursor = '';
    if (this.isOpen) this.refreshTab();
  }

  private showBanner(message: string): void {
    this.hideBanner();
    this.banner = document.createElement('div');
    this.banner.textContent = message;
    Object.assign(this.banner.style, {
      position: 'fixed', top: '0', left: '0', right: '0', zIndex: '10001',
      padding: '8px 0', textAlign: 'center', background: '#a855f7',
      color: '#fff', fontFamily: 'monospace', fontSize: '12px', fontWeight: '700',
    } as CSSStyleDeclaration);
    document.body.appendChild(this.banner);
  }

  private hideBanner(): void {
    if (this.banner) { this.banner.remove(); this.banner = null; }
  }

  private handlePick(screenX: number, screenY: number): void {
    // World-level pick modes
    if (this.pickMode === 'place_city' || this.pickMode === 'move_city') {
      this.handleWorldPick(screenX, screenY);
      return;
    }
    // City-level pick modes
    if (this.pickMode === 'add_road' || this.pickMode === 'remove_road' || this.pickMode === 'place_building') {
      this.handleCityPick(screenX, screenY);
      return;
    }
    // Paint mode
    if (this.pickMode === 'paint_building') {
      this.handlePaintPick(screenX, screenY);
      return;
    }
  }

  private handleWorldPick(screenX: number, screenY: number): void {
    const worldView = (this.game as any).worldView;
    if (!worldView) return;
    const worldMap = worldView.worldMap;
    const world = worldView.camera.screenToWorld(screenX, screenY);

    if (this.pickMode === 'place_city' && this.pickCityData) {
      const { name, typeId, unlockCost } = this.pickCityData;
      const cityType = CITY_TYPES[typeId];
      const id = `city_dbg_${Date.now()}`;
      worldMap.addCity({
        id, name,
        position: new Vector2(Math.round(world.x), Math.round(world.y)),
        cityType, unlocked: unlockCost === 0, unlockCost,
      });
      worldView.renderer.markDirty();
      this.toast(`Placed ${name} at (${Math.round(world.x)}, ${Math.round(world.y)})`);
      this.cancelPickMode();
      if (this.isOpen) this.refreshTab();
    } else if (this.pickMode === 'move_city' && this.movingCityId) {
      const city = worldMap.getCity(this.movingCityId);
      if (city) {
        city.position = new Vector2(Math.round(world.x), Math.round(world.y));
        worldView.renderer.markDirty();
        this.toast(`Moved ${city.name} to (${city.position.x}, ${city.position.y})`);
      }
      this.cancelPickMode();
      if (this.isOpen) this.refreshTab();
    }
  }

  private handleCityPick(screenX: number, screenY: number): void {
    const cityView = (this.game as any).activeCityView;
    if (!cityView) return;
    const layout = cityView.layout;
    const world = cityView.camera.screenToWorld(screenX, screenY);
    const gx = Math.floor(world.x / CS);
    const gy = Math.floor(world.y / CS);
    const pos = new Vector2(gx, gy);

    if (gx < 0 || gy < 0 || gx >= layout.width || gy >= layout.height) return;

    if (this.pickMode === 'add_road') {
      layout.roadNetwork.addRoad(pos);
      cityView.renderer.markDirty();
      this.toast(`Road added at (${gx}, ${gy})`);
      // Stay in mode for multi-paint
    } else if (this.pickMode === 'remove_road') {
      layout.roadNetwork.removeRoad(pos);
      cityView.renderer.markDirty();
      this.toast(`Road removed at (${gx}, ${gy})`);
    } else if (this.pickMode === 'place_building' && this.placeBuildingData) {
      const { type, polyId, color, cost } = this.placeBuildingData;
      const polyRegistry = (this.game as any).polyominoRegistry;
      const poly = polyRegistry.get(polyId);
      if (!poly) { this.toast(`Unknown polyomino: ${polyId}`); return; }

      // Check bounds
      for (const cell of poly.cells) {
        if (gx + cell.x >= layout.width || gy + cell.y >= layout.height) {
          this.toast('Out of bounds'); return;
        }
      }

      const bb = poly.boundingBox;
      const bounds = { x: 0, y: 0, w: bb.width, h: bb.height };
      if (type === 'factory') {
        const slot = new CitySlot('factory', pos, bounds, cost);
        slot.slotIndex = layout.factorySlots.length;
        layout.factorySlots.push(slot);
      } else if (type === 'shop') {
        const slot = new CitySlot('shop', pos, bounds, cost);
        slot.slotIndex = layout.shopSlots.length;
        layout.shopSlots.push(slot);
      } else if (type === 'storage') {
        const slot = new CitySlot('storage', pos, bounds, cost);
        slot.slotIndex = layout.storageSlots.length;
        layout.storageSlots.push(slot);
      }

      cityView.renderer.markDirty();
      this.toast(`Placed ${type} (${polyId}) at (${gx}, ${gy})`);
      this.cancelPickMode();
      if (this.isOpen) this.refreshTab();
    }
  }

  // ─── Paint Mode ──────────────────────────────────────────

  private handlePaintPick(screenX: number, screenY: number): void {
    const cityView = (this.game as any).activeCityView;
    if (!cityView || !this.paintState) return;
    const layout = cityView.layout;
    const world = cityView.camera.screenToWorld(screenX, screenY);
    const gx = Math.floor(world.x / CS);
    const gy = Math.floor(world.y / CS);
    const pos = new Vector2(gx, gy);

    if (gx < 0 || gy < 0 || gx >= layout.width || gy >= layout.height) return;

    const ps = this.paintState;
    const cellIdx = ps.cells.findIndex(c => c.x === gx && c.y === gy);

    if (cellIdx >= 0) {
      // Clicking an existing cell -> remove it (if editing or if not the last cell)
      if (ps.cells.length <= 1) {
        this.toast('Cannot remove last cell');
        return;
      }
      // Check connectivity if removed
      const remaining = ps.cells.filter((_, i) => i !== cellIdx);
      if (!this.isCellSetConnected(remaining)) {
        this.toast('Would disconnect building');
        return;
      }
      ps.cells.splice(cellIdx, 1);
    } else {
      // Adding a new cell - check adjacency (unless first cell)
      if (ps.cells.length > 0) {
        const adjacent = ps.cells.some(c =>
          (Math.abs(c.x - gx) + Math.abs(c.y - gy)) === 1
        );
        if (!adjacent) {
          this.toast('Must be adjacent to existing cell');
          return;
        }
      }

      // Check cell is not occupied by other buildings/roads
      const key = pos.toKey();
      if (layout.roadNetwork.isRoad(pos)) {
        this.toast('Cell occupied by road');
        return;
      }
      // Check factory slots (skip the one being edited)
      for (const slot of layout.factorySlots) {
        if (ps.editingSlot && slot.id === ps.editingSlot.id) continue;
        for (const c of slot.getCells()) {
          if (c.add(slot.position).toKey() === key) {
            this.toast('Cell occupied by factory');
            return;
          }
        }
      }
      // Check shop slots
      for (const slot of layout.shopSlots) {
        if (ps.editingSlot && slot.id === ps.editingSlot.id) continue;
        for (const c of slot.getCells()) {
          if (c.add(slot.position).toKey() === key) {
            this.toast('Cell occupied by shop');
            return;
          }
        }
      }
      ps.cells.push(pos);
    }

    // Update live preview
    cityView.renderer.setPaintPreview(ps.cells, ps.color);
    cityView.renderer.markDirty();
  }

  private isCellSetConnected(cells: Vector2[]): boolean {
    if (cells.length <= 1) return true;
    const keySet = new Set(cells.map(c => c.toKey()));
    const visited = new Set<string>();
    const queue = [cells[0]];
    visited.add(cells[0].toKey());

    while (queue.length > 0) {
      const cur = queue.pop()!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = new Vector2(cur.x + dx, cur.y + dy).toKey();
        if (keySet.has(nk) && !visited.has(nk)) {
          visited.add(nk);
          queue.push(new Vector2(cur.x + dx, cur.y + dy));
        }
      }
    }
    return visited.size === cells.length;
  }

  private finalizePaint(): void {
    const cityView = (this.game as any).activeCityView;
    if (!cityView || !this.paintState) return;
    const ps = this.paintState;
    const layout = cityView.layout;

    if (ps.cells.length === 0) return;

    // Compute position (min x, min y) and relative cells
    let minX = Infinity, minY = Infinity;
    for (const c of ps.cells) {
      if (c.x < minX) minX = c.x;
      if (c.y < minY) minY = c.y;
    }
    const position = new Vector2(minX, minY);
    const relativeCells = ps.cells.map(c => new Vector2(c.x - minX, c.y - minY));
    const poly = new Polyomino(relativeCells);
    const polyId = `custom_${poly.cellCount}`;

    if (ps.editingSlot) {
      // Update existing slot
      const slot = ps.editingSlot;
      const idx = layout.factorySlots.indexOf(slot);
      const shopIdx = layout.shopSlots.indexOf(slot);
      const bb = poly.boundingBox;
      const newBounds = { x: 0, y: 0, w: bb.width, h: bb.height };
      const newSlot = new CitySlot(slot.slotType, position, newBounds, slot.cost);
      newSlot.purchased = slot.purchased;
      newSlot.buildingNodeId = slot.buildingNodeId;
      const storageIdx = layout.storageSlots.indexOf(slot);
      if (idx >= 0) { newSlot.slotIndex = idx; layout.factorySlots[idx] = newSlot; }
      else if (shopIdx >= 0) { newSlot.slotIndex = shopIdx; layout.shopSlots[shopIdx] = newSlot; }
      else if (storageIdx >= 0) { newSlot.slotIndex = storageIdx; layout.storageSlots[storageIdx] = newSlot; }
    } else {
      // Create new building
      const bb2 = poly.boundingBox;
      const newBounds2 = { x: 0, y: 0, w: bb2.width, h: bb2.height };
      if (ps.buildingType === 'factory') {
        const slot = new CitySlot('factory', position, newBounds2, ps.cost);
        slot.slotIndex = layout.factorySlots.length;
        layout.factorySlots.push(slot);
      } else if (ps.buildingType === 'shop') {
        const slot = new CitySlot('shop', position, newBounds2, ps.cost);
        slot.slotIndex = layout.shopSlots.length;
        slot.purchased = true;
        layout.shopSlots.push(slot);
      } else if (ps.buildingType === 'storage') {
        const slot = new CitySlot('storage', position, newBounds2, ps.cost);
        slot.slotIndex = layout.storageSlots.length;
        layout.storageSlots.push(slot);
      }
    }

    cityView.renderer.clearPaintPreview();
    cityView.renderer.markDirty();
    this.toast(`${ps.editingSlot ? 'Updated' : 'Created'} ${ps.buildingType} (${ps.cells.length} cells)`);
  }

  private enterPaintMode(type: 'factory' | 'shop' | 'storage', color: number, cost: number, editSlot?: CitySlot): void {
    this.cancelPickMode(); // clean up any previous mode (but won't finalize since paintState is null after cancel)

    const ps: PaintState = {
      buildingType: type,
      cells: [],
      color,
      cost,
    };

    if (editSlot) {
      ps.editingSlot = editSlot;
      // Load existing cells as absolute positions
      ps.cells = editSlot.getCells().map(c => c.add(editSlot.position));
      ps.originalCells = ps.cells.map(c => new Vector2(c.x, c.y));
      ps.originalPosition = new Vector2(editSlot.position.x, editSlot.position.y);
    }

    this.paintState = ps;
    this.pickMode = 'paint_building';

    const action = editSlot ? 'Editing' : 'Painting';
    const bannerMsg = `${action} ${type} — Right-click to add/remove cells | ESC to finish`;

    // Show banner
    this.banner = document.createElement('div');
    this.banner.textContent = bannerMsg;
    Object.assign(this.banner.style, {
      position: 'fixed', top: '0', left: '0', right: '0', zIndex: '10001',
      padding: '8px 0', textAlign: 'center', background: '#a855f7',
      color: '#fff', fontFamily: 'monospace', fontSize: '12px', fontWeight: '700',
    } as CSSStyleDeclaration);
    document.body.appendChild(this.banner);

    const canvas = this.game.app.canvas as HTMLCanvasElement;
    canvas.style.cursor = 'crosshair';

    this.pickUpHandler = (e: MouseEvent) => {
      if (e.button !== 2) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const rect = canvas.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const offsetY = e.clientY - rect.top;
      this.handlePick(offsetX, offsetY);
    };

    this.pickDownHandler = (e: MouseEvent) => {
      e.preventDefault();
    };

    window.addEventListener('contextmenu', this.pickDownHandler as EventListener, true);
    window.addEventListener('mousedown', this.pickUpHandler as EventListener, true);

    this.escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') this.cancelPickMode();
    };
    document.addEventListener('keydown', this.escHandler);

    // Show initial preview if editing
    if (ps.cells.length > 0) {
      const cityView = (this.game as any).activeCityView;
      if (cityView) {
        cityView.renderer.setPaintPreview(ps.cells, ps.color);
        cityView.renderer.markDirty();
      }
    }
  }

  // ─── Helpers ───────────────────────────────────────────────

  private makeSection(title: string): HTMLDivElement {
    const sec = document.createElement('div');
    sec.style.marginBottom = '12px';
    const h = document.createElement('div');
    h.textContent = title;
    Object.assign(h.style, {
      fontWeight: '700', fontSize: '11px', color: '#a855f7',
      marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px',
    } as CSSStyleDeclaration);
    sec.appendChild(h);
    this.tabContent.appendChild(sec);
    return sec;
  }

  private makeButton(label: string, onClick: () => void, parent: HTMLElement, danger = false): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    Object.assign(btn.style, {
      padding: '4px 10px', margin: '2px 4px 2px 0', border: '1px solid',
      borderColor: danger ? '#e94560' : '#2d3548', borderRadius: '4px',
      background: danger ? '#2a1020' : '#1c2541', color: danger ? '#e94560' : '#e8e8e8',
      fontFamily: 'inherit', fontSize: '10px', cursor: 'pointer', fontWeight: '600',
    } as CSSStyleDeclaration);
    btn.addEventListener('click', onClick);
    parent.appendChild(btn);
    return btn;
  }

  private makeInput(placeholder: string, parent: HTMLElement, width = '100%'): HTMLInputElement {
    const inp = document.createElement('input');
    inp.placeholder = placeholder;
    Object.assign(inp.style, {
      width, padding: '4px 6px', margin: '2px 0', border: '1px solid #2d3548',
      borderRadius: '4px', background: '#0d1525', color: '#e8e8e8',
      fontFamily: 'inherit', fontSize: '10px', boxSizing: 'border-box',
    } as CSSStyleDeclaration);
    parent.appendChild(inp);
    return inp;
  }

  private makeSelect(options: { value: string; label: string }[], parent: HTMLElement): HTMLSelectElement {
    const sel = document.createElement('select');
    Object.assign(sel.style, {
      width: '100%', padding: '4px 6px', margin: '2px 0', border: '1px solid #2d3548',
      borderRadius: '4px', background: '#0d1525', color: '#e8e8e8',
      fontFamily: 'inherit', fontSize: '10px', boxSizing: 'border-box',
    } as CSSStyleDeclaration);
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      sel.appendChild(o);
    }
    parent.appendChild(sel);
    return sel;
  }

  private makeLabel(text: string, parent: HTMLElement): HTMLDivElement {
    const lbl = document.createElement('div');
    lbl.textContent = text;
    Object.assign(lbl.style, {
      fontSize: '10px', color: '#8892a4', marginBottom: '2px',
    } as CSSStyleDeclaration);
    parent.appendChild(lbl);
    return lbl;
  }

  private toast(msg: string): void {
    const t = document.createElement('div');
    t.textContent = msg;
    Object.assign(t.style, {
      position: 'fixed', bottom: '20px', right: '20px', zIndex: '10000',
      padding: '8px 16px', borderRadius: '6px', background: '#1c2541',
      border: '1px solid #a855f7', color: '#e8e8e8', fontFamily: 'monospace',
      fontSize: '11px', boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
    } as CSSStyleDeclaration);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
  }

  // ─── GENERAL TAB ───────────────────────────────────────────

  private buildGeneralTab(): void {
    // Wallet
    const walletSec = this.makeSection('Wallet');
    const coinsLabel = document.createElement('div');
    coinsLabel.textContent = `Coins: ${this.game.wallet.coins}`;
    coinsLabel.style.marginBottom = '4px';
    walletSec.appendChild(coinsLabel);

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '4px';
    const coinInput = this.makeInput('Amount', row, '120px');
    this.makeButton('+Add', () => {
      const amount = parseInt(coinInput.value);
      if (!isNaN(amount)) {
        this.game.wallet.addCoins(amount);
        this.toast(`Added ${amount} coins`);
        this.refreshTab();
      }
    }, row);
    this.makeButton('Set', () => {
      const amount = parseInt(coinInput.value);
      if (!isNaN(amount)) {
        this.game.wallet.reset(amount);
        this.toast(`Coins set to ${amount}`);
        this.refreshTab();
      }
    }, row);
    walletSec.appendChild(row);

    // Tick speed
    const tickSec = this.makeSection('Simulation');
    const speedRow = document.createElement('div');
    speedRow.style.display = 'flex';
    speedRow.style.gap = '4px';
    this.makeButton('Pause', () => { this.game.tickEngine.stop(); this.toast('Paused'); }, speedRow);
    this.makeButton('Resume', () => { this.game.tickEngine.start(); this.toast('Resumed'); }, speedRow);
    tickSec.appendChild(speedRow);

    // View info
    const viewSec = this.makeSection('Current View');
    const info = document.createElement('div');
    info.style.color = '#8892a4';
    info.innerHTML = `View: <span style="color:#e8e8e8">${(this.game as any).currentView}</span>`;
    if ((this.game as any).activeCityId) {
      info.innerHTML += `<br>City: <span style="color:#e8e8e8">${(this.game as any).activeCityId}</span>`;
    }
    viewSec.appendChild(info);
  }

  // ─── WORLD TAB ─────────────────────────────────────────────

  private buildWorldTab(): void {
    const worldView = (this.game as any).worldView;
    const worldMap = worldView?.worldMap;
    if (!worldMap) {
      this.tabContent.textContent = 'No world loaded.';
      return;
    }

    const cities = worldMap.getCities();

    // City list with edit/move/delete
    const listSec = this.makeSection('Cities');
    const listContainer = document.createElement('div');
    Object.assign(listContainer.style, {
      maxHeight: '180px', overflowY: 'auto', marginBottom: '6px',
      border: '1px solid #2d3548', borderRadius: '4px', padding: '4px',
    } as CSSStyleDeclaration);

    for (const city of cities) {
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '3px 4px', borderRadius: '2px',
      } as CSSStyleDeclaration);
      row.addEventListener('mouseenter', () => row.style.background = '#1c2541');
      row.addEventListener('mouseleave', () => row.style.background = 'transparent');

      const label = document.createElement('span');
      label.style.flex = '1';
      const lockIcon = city.unlocked ? '' : ' [locked]';
      label.innerHTML = `<span style="color:${city.unlocked ? '#53d769' : '#e94560'}">&bull;</span> ${city.name} <span style="color:#8892a4; font-size:9px">${city.cityType.id}${lockIcon}</span>`;
      row.appendChild(label);

      const btnGroup = document.createElement('div');
      btnGroup.style.display = 'flex';
      btnGroup.style.gap = '2px';

      // Move button
      const moveBtn = this.makeSmallBtn('Move', '#4dc9f6', () => {
        this.enterPickMode('move_city', `Click on map to move "${city.name}"`);
        this.movingCityId = city.id;
      });
      btnGroup.appendChild(moveBtn);

      // Edit button (inline expand)
      const editBtn = this.makeSmallBtn('Edit', '#f5c842', () => {
        this.showEditCityPopup(city, worldView);
      });
      btnGroup.appendChild(editBtn);

      if (!city.unlocked) {
        const unlockBtn = this.makeSmallBtn('Unlock', '#53d769', () => {
          worldMap.unlockCity(city.id);
          worldView.renderer.markDirty();
          this.toast(`Unlocked ${city.name}`);
          this.refreshTab();
        });
        btnGroup.appendChild(unlockBtn);
      }

      // Delete button
      const delBtn = this.makeSmallBtn('X', '#e94560', () => {
        worldMap.removeCity(city.id);
        worldView.renderer.markDirty();
        this.toast(`Deleted ${city.name}`);
        this.refreshTab();
      });
      btnGroup.appendChild(delBtn);

      row.appendChild(btnGroup);
      listContainer.appendChild(row);
    }
    listSec.appendChild(listContainer);

    const actionRow = document.createElement('div');
    actionRow.style.display = 'flex';
    actionRow.style.gap = '4px';
    this.makeButton('Unlock All', () => {
      for (const c of cities) {
        if (!c.unlocked) worldMap.unlockCity(c.id);
      }
      worldView.renderer.markDirty();
      this.toast('All cities unlocked');
      this.refreshTab();
    }, actionRow);
    listSec.appendChild(actionRow);

    // Add city — with "Place on Map" button
    const addSec = this.makeSection('Add City');
    this.makeLabel('Name', addSec);
    const nameInput = this.makeInput('City name', addSec);

    this.makeLabel('Type', addSec);
    const typeOptions = Object.keys(CITY_TYPES).map(k => ({ value: k, label: CITY_TYPES[k].name }));
    const typeSelect = this.makeSelect(typeOptions, addSec);

    this.makeLabel('Unlock Cost', addSec);
    const costInput = this.makeInput('0', addSec);
    costInput.value = '0';

    const addBtnRow = document.createElement('div');
    addBtnRow.style.display = 'flex';
    addBtnRow.style.gap = '4px';
    addBtnRow.style.marginTop = '6px';

    this.makeButton('Place on Map', () => {
      const name = nameInput.value.trim();
      if (!name) { this.toast('Name required'); return; }
      this.enterPickMode('place_city', `Click on map to place "${name}"`);
      this.pickCityData = {
        name,
        typeId: typeSelect.value,
        unlockCost: parseInt(costInput.value) || 0,
      };
    }, addBtnRow);

    addSec.appendChild(addBtnRow);

    // Add connection
    const connSec = this.makeSection('Add Connection');
    const cityOptions = cities.map((c: any) => ({ value: c.id, label: c.name }));

    this.makeLabel('From', connSec);
    const fromSelect = this.makeSelect(cityOptions, connSec);
    this.makeLabel('To', connSec);
    const toSelect = this.makeSelect(cityOptions, connSec);

    this.makeButton('Add Connection', () => {
      const fromId = fromSelect.value;
      const toId = toSelect.value;
      if (fromId === toId) { this.toast('Cannot connect city to itself'); return; }
      const fromCity = worldMap.getCity(fromId);
      const toCity = worldMap.getCity(toId);
      if (!fromCity || !toCity) return;

      const dist = fromCity.position.manhattanDistance(toCity.position);
      const transportTypes: string[] = ['truck'];
      if (fromCity.cityType.hasRailway && toCity.cityType.hasRailway) transportTypes.push('train');
      if (fromCity.cityType.hasPort && toCity.cityType.hasPort) transportTypes.push('boat');
      if (fromCity.cityType.hasAirport && toCity.cityType.hasAirport) transportTypes.push('plane');

      worldMap.addConnection({
        fromCityId: fromId, toCityId: toId,
        distance: Math.round(dist / 10), transportTypes,
      });
      worldView.renderer.markDirty();
      this.toast(`Connected ${fromCity.name} <-> ${toCity.name}`);
    }, connSec);

    // Connections list
    const connListSec = this.makeSection('Connections');
    const connections = worldMap.getConnections();
    const connContainer = document.createElement('div');
    Object.assign(connContainer.style, {
      maxHeight: '100px', overflowY: 'auto', fontSize: '9px', color: '#8892a4',
      border: '1px solid #2d3548', borderRadius: '4px', padding: '4px',
    } as CSSStyleDeclaration);
    for (const conn of connections) {
      const from = worldMap.getCity(conn.fromCityId);
      const to = worldMap.getCity(conn.toCityId);
      const line = document.createElement('div');
      line.style.padding = '1px 0';
      line.textContent = `${from?.name ?? conn.fromCityId} <-> ${to?.name ?? conn.toCityId} [${conn.transportTypes.join(', ')}]`;
      connContainer.appendChild(line);
    }
    connListSec.appendChild(connContainer);

    // Export
    const exportSec = this.makeSection('Export');

    const buildExportData = () => {
      const allCities = worldMap.getCities();
      const allConns = worldMap.getConnections();
      return {
        width: 4000, height: 2800,
        cities: allCities.map((c: any) => ({
          id: c.id, name: c.name, typeId: c.cityType.id,
          x: c.position.x, y: c.position.y, unlockCost: c.unlockCost,
        })),
        connections: allConns.map((c: any) => ({ from: c.fromCityId, to: c.toCityId })),
      };
    };

    this.makeButton('Copy to Clipboard', () => {
      const json = JSON.stringify(buildExportData(), null, 2);
      navigator.clipboard.writeText(json).then(
        () => this.toast('JSON copied — paste into worldCities.json'),
        () => this.toast('Clipboard access denied'),
      );
    }, exportSec);

    this.makeButton('Download JSON', () => {
      const blob = new Blob([JSON.stringify(buildExportData(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'worldCities_debug.json';
      a.click();
      URL.revokeObjectURL(url);
      this.toast('Downloaded worldCities JSON');
    }, exportSec);
  }

  // ─── Edit City Popup ──────────────────────────────────────

  private showEditCityPopup(city: any, worldView: any): void {
    // Replace tab content with edit form
    this.tabContent.innerHTML = '';

    const header = this.makeSection(`Edit: ${city.name}`);

    this.makeLabel('Name', header);
    const nameInput = this.makeInput(city.name, header);
    nameInput.value = city.name;

    this.makeLabel('Type', header);
    const typeOptions = Object.keys(CITY_TYPES).map(k => ({ value: k, label: CITY_TYPES[k].name }));
    const typeSelect = this.makeSelect(typeOptions, header);
    typeSelect.value = city.cityType.id;

    this.makeLabel('Unlock Cost', header);
    const costInput = this.makeInput(String(city.unlockCost), header);
    costInput.value = String(city.unlockCost);

    this.makeLabel(`Position: (${city.position.x}, ${city.position.y})`, header);
    const posRow = document.createElement('div');
    posRow.style.display = 'flex';
    posRow.style.gap = '4px';
    const xInput = this.makeInput('x', posRow, '50%');
    xInput.value = String(city.position.x);
    const yInput = this.makeInput('y', posRow, '50%');
    yInput.value = String(city.position.y);
    header.appendChild(posRow);

    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '4px';
    btnRow.style.marginTop = '8px';

    this.makeButton('Save', () => {
      const name = nameInput.value.trim();
      if (name) city.name = name;
      const newType = CITY_TYPES[typeSelect.value];
      if (newType) city.cityType = newType;
      city.unlockCost = parseInt(costInput.value) || 0;
      const x = parseInt(xInput.value);
      const y = parseInt(yInput.value);
      if (!isNaN(x) && !isNaN(y)) city.position = new Vector2(x, y);
      worldView.renderer.markDirty();
      this.toast(`Updated ${city.name}`);
      this.refreshTab(); // back to city list
    }, btnRow);

    this.makeButton('Move on Map', () => {
      this.enterPickMode('move_city', `Click on map to move "${city.name}"`);
      this.movingCityId = city.id;
    }, btnRow);

    this.makeButton('Cancel', () => {
      this.refreshTab();
    }, btnRow);

    header.appendChild(btnRow);
  }

  private makeSmallBtn(label: string, color: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    Object.assign(btn.style, {
      padding: '1px 5px', border: `1px solid ${color}`, borderRadius: '3px',
      background: 'transparent', color, fontFamily: 'inherit',
      fontSize: '9px', cursor: 'pointer', lineHeight: '1.4',
    } as CSSStyleDeclaration);
    btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return btn;
  }

  // ─── CITY TAB ──────────────────────────────────────────────

  private buildCityTab(): void {
    const activeCityId = (this.game as any).activeCityId as string | null;
    const cityView = (this.game as any).activeCityView;

    if (!activeCityId || !cityView) {
      this.tabContent.textContent = 'Enter a city first.';
      return;
    }

    const layout = cityView.layout;
    const worldView = (this.game as any).worldView;
    const worldCity = worldView?.worldMap.getCity(activeCityId);
    const polyRegistry = (this.game as any).polyominoRegistry;

    // ── Info ──
    const infoSec = this.makeSection(`City: ${worldCity?.name ?? activeCityId}`);
    const info = document.createElement('div');
    info.style.color = '#8892a4';
    info.innerHTML = [
      `Type: <span style="color:#e8e8e8">${worldCity?.cityType.id ?? '?'}</span>`,
      `Grid: <span style="color:#e8e8e8">${layout.width} x ${layout.height}</span>`,
      `Factories: <span style="color:#e8e8e8">${layout.factorySlots.length}</span>`,
      `Shops: <span style="color:#e8e8e8">${layout.shopSlots.length}</span>`,
      `Roads: <span style="color:#e8e8e8">${layout.roadNetwork.roadCount} cells</span>`,
    ].join('<br>');
    infoSec.appendChild(info);

    // ── Grid Size ──
    const gridSec = this.makeSection('Grid Size');
    const gridRow = document.createElement('div');
    gridRow.style.display = 'flex';
    gridRow.style.gap = '4px';
    const wInput = this.makeInput('Width', gridRow, '40%');
    wInput.value = String(layout.width);
    const hInput = this.makeInput('Height', gridRow, '40%');
    hInput.value = String(layout.height);
    this.makeButton('Apply', () => {
      const w = parseInt(wInput.value);
      const h = parseInt(hInput.value);
      if (isNaN(w) || isNaN(h) || w < 5 || h < 5) { this.toast('Min 5x5'); return; }
      (layout as any).width = w;
      (layout as any).height = h;
      cityView.renderer.markDirty();
      this.toast(`Grid resized to ${w}x${h}`);
      this.refreshTab();
    }, gridRow);
    gridSec.appendChild(gridRow);

    // ── Background Color ──
    const bgSec = this.makeSection('Background Color');
    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = '#' + (cityView.renderer.getBgColor() >>> 0).toString(16).padStart(6, '0');
    Object.assign(colorInput.style, {
      width: '60px', height: '28px', border: '1px solid #2d3548', borderRadius: '4px',
      background: '#0d1525', cursor: 'pointer',
    } as CSSStyleDeclaration);
    colorInput.addEventListener('input', () => {
      cityView.renderer.setBgColor(parseInt(colorInput.value.slice(1), 16));
    });
    bgSec.appendChild(colorInput);

    // ── Camera Bounds ──
    const camSec = this.makeSection('Camera Bounds');
    const camRow = document.createElement('div');
    Object.assign(camRow.style, { display: 'flex', gap: '4px', flexWrap: 'wrap' } as CSSStyleDeclaration);
    const cb = layout.cameraBounds ?? { x: 0, y: 0, w: layout.width * CS, h: layout.height * CS };
    const cbxI = this.makeInput('X', camRow, '22%');
    cbxI.value = String(cb.x);
    const cbyI = this.makeInput('Y', camRow, '22%');
    cbyI.value = String(cb.y);
    const cbwI = this.makeInput('W', camRow, '22%');
    cbwI.value = String(cb.w);
    const cbhI = this.makeInput('H', camRow, '22%');
    cbhI.value = String(cb.h);
    camSec.appendChild(camRow);

    const camBtnRow = document.createElement('div');
    Object.assign(camBtnRow.style, { display: 'flex', gap: '4px', marginTop: '4px' } as CSSStyleDeclaration);
    this.makeButton('Apply', () => {
      const x = parseFloat(cbxI.value), y = parseFloat(cbyI.value);
      const w = parseFloat(cbwI.value), h = parseFloat(cbhI.value);
      if ([x, y, w, h].some(isNaN) || w <= 0 || h <= 0) { this.toast('Invalid bounds'); return; }
      layout.cameraBounds = { x, y, w, h };
      cityView.camera.bounds = layout.cameraBounds;
      cityView.renderer.markDirty();
      this.toast('Camera bounds applied');
    }, camBtnRow);
    this.makeButton('Clear', () => {
      layout.cameraBounds = undefined;
      cityView.camera.bounds = null;
      cityView.renderer.markDirty();
      this.toast('Camera bounds removed');
      this.refreshTab();
    }, camBtnRow);
    camSec.appendChild(camBtnRow);

    // ── Zoom Limits ──
    const zoomSec = this.makeSection('Zoom Limits');
    const zoomRow = document.createElement('div');
    Object.assign(zoomRow.style, { display: 'flex', gap: '4px', alignItems: 'center' } as CSSStyleDeclaration);
    const zl = layout.zoomLimits ?? { min: 0.5, max: 1.8 };
    const zMinI = this.makeInput('Min', zoomRow, '30%');
    zMinI.value = String(zl.min);
    zMinI.step = '0.1';
    const zMaxI = this.makeInput('Max', zoomRow, '30%');
    zMaxI.value = String(zl.max);
    zMaxI.step = '0.1';
    this.makeButton('Apply', () => {
      const mn = parseFloat(zMinI.value), mx = parseFloat(zMaxI.value);
      if (isNaN(mn) || isNaN(mx) || mn <= 0 || mx <= mn) { this.toast('Invalid zoom limits'); return; }
      layout.zoomLimits = { min: mn, max: mx };
      cityView.camera.setZoomLimits(mn, mx);
      this.toast(`Zoom: ${mn} – ${mx}`);
    }, zoomRow);
    this.makeButton('Clear', () => {
      layout.zoomLimits = undefined;
      cityView.camera.setZoomLimits(0.5, 1.8);
      this.toast('Zoom limits reset');
      this.refreshTab();
    }, zoomRow);
    zoomSec.appendChild(zoomRow);

    // ── Roads ──
    const roadSec = this.makeSection('Roads');
    const roadBtnRow = document.createElement('div');
    roadBtnRow.style.display = 'flex';
    roadBtnRow.style.gap = '4px';
    this.makeButton('Paint Roads', () => {
      this.enterPickMode('add_road', 'Right-click cells to add roads');
    }, roadBtnRow);
    this.makeButton('Erase Roads', () => {
      this.enterPickMode('remove_road', 'Right-click cells to remove roads');
    }, roadBtnRow);
    this.makeButton('Clear All', () => {
      for (const r of layout.roadNetwork.getAllRoads()) {
        layout.roadNetwork.removeRoad(r);
      }
      cityView.renderer.markDirty();
      this.toast('All roads cleared');
      this.refreshTab();
    }, roadBtnRow, true);
    roadSec.appendChild(roadBtnRow);

    // ── Factory Slots ──
    const factSec = this.makeSection('Factory Slots');
    this.buildSlotList(layout.factorySlots, 'factory', cityView, factSec);

    const factAddRow = document.createElement('div');
    factAddRow.style.display = 'flex';
    factAddRow.style.gap = '4px';
    factAddRow.style.marginTop = '4px';
    this.makeButton('Buy All', () => {
      for (const s of layout.factorySlots) s.purchased = true;
      cityView.renderer.markDirty();
      this.toast('All factories purchased');
      this.refreshTab();
    }, factAddRow);
    this.makeButton('+ Add Factory', () => {
      const slot = new CitySlot('factory', new Vector2(0, 0), { x: 0, y: 0, w: 1, h: 1 }, 100);
      slot.slotIndex = layout.factorySlots.length;
      layout.factorySlots.push(slot);
      this.openZoneEditor(slot, cityView);
      this.refreshTab();
    }, factAddRow);
    factSec.appendChild(factAddRow);

    // ── Shop Slots ──
    const shopSec = this.makeSection('Shop Slots');
    this.buildSlotList(layout.shopSlots, 'shop', cityView, shopSec);

    const shopAddRow = document.createElement('div');
    shopAddRow.style.display = 'flex';
    shopAddRow.style.gap = '4px';
    shopAddRow.style.marginTop = '4px';
    this.makeButton('+ Add Shop', () => {
      const slot = new CitySlot('shop', new Vector2(0, 0), { x: 0, y: 0, w: 1, h: 1 }, 0);
      slot.slotIndex = layout.shopSlots.length;
      slot.purchased = true;
      layout.shopSlots.push(slot);
      this.openZoneEditor(slot, cityView);
      this.refreshTab();
    }, shopAddRow);
    shopSec.appendChild(shopAddRow);

    // ── Storage Slots ──
    const storageSec = this.makeSection('Storage Slots');
    this.buildSlotList(layout.storageSlots, 'storage', cityView, storageSec);

    const storagePriceRow = document.createElement('div');
    Object.assign(storagePriceRow.style, {
      display: 'flex', gap: '4px', marginTop: '4px', alignItems: 'center',
    } as CSSStyleDeclaration);
    const storagePriceLabel = document.createElement('span');
    storagePriceLabel.textContent = 'Price:';
    storagePriceLabel.style.color = '#8892a4';
    storagePriceRow.appendChild(storagePriceLabel);
    const storagePriceInput = this.makeInput('75', storagePriceRow);
    storagePriceInput.value = '75';
    storagePriceInput.style.width = '50px';
    this.makeButton('Set All', () => {
      const price = parseInt(storagePriceInput.value) || 0;
      for (const s of layout.storageSlots) {
        if (!s.purchased) s.cost = price;
      }
      cityView.renderer.markDirty();
      this.toast(`All storage prices set to ${price}`);
      this.refreshTab();
    }, storagePriceRow);
    storageSec.appendChild(storagePriceRow);

    const storageAddRow = document.createElement('div');
    storageAddRow.style.display = 'flex';
    storageAddRow.style.gap = '4px';
    storageAddRow.style.marginTop = '4px';
    this.makeButton('Buy All', () => {
      for (const s of layout.storageSlots) s.purchased = true;
      cityView.renderer.markDirty();
      this.toast('All storages purchased');
      this.refreshTab();
    }, storageAddRow);
    this.makeButton('+ Add Storage', () => {
      const price = parseInt(storagePriceInput.value) || 75;
      const slot = new CitySlot('storage', new Vector2(0, 0), { x: 0, y: 0, w: 1, h: 1 }, price);
      slot.slotIndex = layout.storageSlots.length;
      layout.storageSlots.push(slot);
      this.openZoneEditor(slot, cityView);
      this.refreshTab();
    }, storageAddRow);
    storageSec.appendChild(storageAddRow);

    // ── Export / Persistence ──
    const exportSec = this.makeSection('Export City JSON');
    const fromJson = hasCityJson(activeCityId);
    const sourceLabel = document.createElement('div');
    sourceLabel.style.color = '#8892a4';
    sourceLabel.style.marginBottom = '4px';
    sourceLabel.innerHTML = `Source: <span style="color:${fromJson ? '#53d769' : '#f5c842'}">${fromJson ? 'JSON file' : 'Generated'}</span>`;
    exportSec.appendChild(sourceLabel);

    const buildCityExport = () => {
      // Sync shop configs onto slots before serializing
      const cityShops = (this.game as any).cityShops as Map<string, CityShop>;
      for (const shopSlot of layout.shopSlots) {
        const key = `${activeCityId}_${shopSlot.slotKey}`;
        const shop = cityShops.get(key);
        if (shop) {
          const mods: Record<string, number> = {};
          for (const [resId, mod] of shop.itemPriceModifiers) {
            mods[resId] = mod;
          }
          shopSlot.shopConfig = {
            name: shop.definition.name,
            color: shop.definition.color,
            description: shop.definition.description,
            priceModifier: shop.definition.priceModifier,
            itemPriceModifiers: mods,
          };
        }
      }
      const bgColor = cityView.renderer.getBgColor();
      return serializeCityLayout(layout, bgColor);
    };

    const exportBtnRow = document.createElement('div');
    exportBtnRow.style.display = 'flex';
    exportBtnRow.style.gap = '4px';

    this.makeButton('Copy JSON', () => {
      const json = JSON.stringify(buildCityExport(), null, 2);
      navigator.clipboard.writeText(json).then(
        () => this.toast(`Copied — paste into src/data/cities/${activeCityId}.json`),
        () => this.toast('Clipboard access denied'),
      );
    }, exportBtnRow);

    this.makeButton('Download JSON', () => {
      const data = buildCityExport();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${activeCityId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.toast(`Downloaded ${activeCityId}.json`);
    }, exportBtnRow);

    exportSec.appendChild(exportBtnRow);

    // ── Actions ──
    const actionSec = this.makeSection('Actions');
    this.makeButton('Regenerate City', () => {
      (this.game as any).enterCity(activeCityId, true);
      this.toast('City regenerated (ignored JSON)');
      setTimeout(() => this.refreshTab(), 50);
    }, actionSec, true);

    this.makeButton('Clear Everything', () => {
      layout.factorySlots.length = 0;
      layout.shopSlots.length = 0;
      layout.storageSlots.length = 0;
      for (const r of layout.roadNetwork.getAllRoads()) layout.roadNetwork.removeRoad(r);
      cityView.renderer.markDirty();
      this.toast('City wiped');
      this.refreshTab();
    }, actionSec, true);
  }

  private buildSlotList(slots: CitySlot[], type: string, cityView: any, parent: HTMLElement): void {
    const listContainer = document.createElement('div');
    Object.assign(listContainer.style, {
      maxHeight: '100px', overflowY: 'auto', fontSize: '9px',
      border: '1px solid #2d3548', borderRadius: '4px', padding: '4px',
    } as CSSStyleDeclaration);

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '2px 2px',
      } as CSSStyleDeclaration);

      const label = document.createElement('span');
      const status = slot.purchased
        ? '<span style="color:#53d769">owned</span>'
        : `<span style="color:#f5c842">${slot.cost}c</span>`;
      label.innerHTML = `${slot.bounds.w}x${slot.bounds.h} (${slot.position.x},${slot.position.y}) [${slot.cellCount}c] ${status}`;
      row.appendChild(label);

      const btnGroup = document.createElement('div');
      btnGroup.style.display = 'flex';
      btnGroup.style.gap = '2px';

      if (!slot.purchased) {
        // Editable cost
        const costInp = document.createElement('input');
        costInp.value = String(slot.cost);
        Object.assign(costInp.style, {
          width: '40px', padding: '1px 3px', border: '1px solid #2d3548', borderRadius: '3px',
          background: '#0d1525', color: '#f5c842', fontFamily: 'inherit', fontSize: '9px',
          textAlign: 'right', boxSizing: 'border-box',
        } as CSSStyleDeclaration);
        costInp.addEventListener('change', () => {
          const v = parseInt(costInp.value);
          if (!isNaN(v) && v >= 0) {
            slot.cost = v;
            cityView.renderer.markDirty();
            this.toast(`Cost set to ${v}`);
          }
        });
        btnGroup.appendChild(costInp);

        btnGroup.appendChild(this.makeSmallBtn('Buy', '#53d769', () => {
          slot.purchased = true;
          cityView.renderer.markDirty();
          this.refreshTab();
        }));
      }

      // Shop config button — opens side panel for shop editing
      if (type === 'shop' && slot.purchased) {
        btnGroup.appendChild(this.makeSmallBtn('Cfg', '#f5c842', () => {
          const cityId = (this.game as any).activeCityId as string;
          if (cityId) this.openShopSidePanel(cityId, slot);
        }));
      }

      // Zones button — opens zone editor popup
      btnGroup.appendChild(this.makeSmallBtn('Zones', '#4dc9f6', () => {
        this.openZoneEditor(slot, cityView);
      }));

      btnGroup.appendChild(this.makeSmallBtn('X', '#e94560', () => {
        slots.splice(i, 1);
        cityView.renderer.markDirty();
        this.toast(`Removed ${type} slot`);
        this.refreshTab();
      }));

      row.appendChild(btnGroup);
      listContainer.appendChild(row);

      // --- Interior Size editor row (factory/storage only) ---
      if (type === 'factory' || type === 'storage') {
        const isRow = document.createElement('div');
        Object.assign(isRow.style, { display: 'flex', gap: '3px', alignItems: 'center', padding: '1px 6px', fontSize: '9px', color: '#8892a4' } as CSSStyleDeclaration);
        isRow.textContent = 'int:';
        for (const key of ['w', 'h'] as const) {
          const inp = document.createElement('input');
          inp.value = String(slot.interiorSize[key]);
          Object.assign(inp.style, {
            width: '32px', padding: '1px 2px', border: '1px solid #2d3548', borderRadius: '3px',
            background: '#0d1525', color: '#b8c0d0', fontFamily: 'inherit', fontSize: '9px',
            textAlign: 'right', boxSizing: 'border-box',
          } as CSSStyleDeclaration);
          inp.placeholder = key;
          inp.addEventListener('change', () => {
            const v = parseInt(inp.value);
            if (!isNaN(v) && v > 0) {
              slot.interiorSize[key] = v;
              this.toast(`Interior ${key} = ${v}`);
            }
          });
          isRow.appendChild(inp);
        }
        listContainer.appendChild(isRow);
      }

    }
    parent.appendChild(listContainer);
  }


  // ─── SHOP SIDE PANEL ──────────────────────────────────────

  private closeShopSidePanel(): void {
    this.shopSidePanel?.remove();
    this.shopSidePanel = null;
  }

  // ─── ZONE EDITOR POPUP ──────────────────────────────────────

  private closeZoneEditor(): void {
    this.zoneEditorPopup?.remove();
    this.zoneEditorPopup = null;
  }

  private openZoneEditor(slot: CitySlot, cityView: import('@/city/CityView').CityView): void {
    this.closeZoneEditor();

    const popup = document.createElement('div');
    this.zoneEditorPopup = popup;
    Object.assign(popup.style, {
      position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
      width: '320px', maxHeight: '80vh', overflowY: 'auto',
      background: '#0d1525', border: '1px solid #2d3548', borderRadius: '8px',
      padding: '12px', zIndex: '10001', fontFamily: 'JetBrains Mono, monospace',
      fontSize: '11px', color: '#e8e8e8', boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    } as CSSStyleDeclaration);

    // Header
    const header = document.createElement('div');
    Object.assign(header.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } as CSSStyleDeclaration);
    const title = document.createElement('span');
    title.textContent = `Zone Editor — ${slot.slotType}`;
    title.style.fontWeight = '700';
    header.appendChild(title);
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'X';
    Object.assign(closeBtn.style, {
      background: 'none', border: 'none', color: '#e94560', cursor: 'pointer',
      fontFamily: 'inherit', fontSize: '13px', fontWeight: '700',
    } as CSSStyleDeclaration);
    closeBtn.addEventListener('click', () => this.closeZoneEditor());
    header.appendChild(closeBtn);
    popup.appendChild(header);

    // Position editor
    const posRow = this.zeMakeRow(popup, 'Position (grid)');
    for (const key of ['x', 'y'] as const) {
      const inp = this.zeMakeInput(posRow, key, String(slot.position[key]));
      inp.addEventListener('change', () => {
        const v = parseInt(inp.value);
        if (!isNaN(v)) {
          (slot.position as any)[key] = v;
          cityView.renderer.markDirty();
        }
      });
    }

    // Truck stop editor
    const tsRow = this.zeMakeRow(popup, 'Truck stop');
    const ts = slot.truckStop ?? new Vector2(0, 0);
    for (const key of ['x', 'y'] as const) {
      const inp = this.zeMakeInput(tsRow, key, String(ts[key]));
      inp.addEventListener('change', () => {
        const v = parseInt(inp.value);
        if (!isNaN(v)) {
          if (!slot.truckStop) slot.truckStop = new Vector2(0, 0);
          (slot.truckStop as any)[key] = v;
          cityView.renderer.markDirty();
        }
      });
    }

    // Interior size editor
    if (slot.slotType === 'factory' || slot.slotType === 'storage') {
      const intRow = this.zeMakeRow(popup, 'Interior size');
      for (const key of ['w', 'h'] as const) {
        const inp = this.zeMakeInput(intRow, key, String(slot.interiorSize[key]));
        inp.addEventListener('change', () => {
          const v = parseInt(inp.value);
          if (!isNaN(v) && v > 0) slot.interiorSize[key] = v;
        });
      }
    }

    // Cost editor
    const costRow = this.zeMakeRow(popup, 'Cost');
    const costInp = this.zeMakeInput(costRow, '', String(slot.cost));
    costInp.style.width = '60px';
    costInp.addEventListener('change', () => {
      const v = parseInt(costInp.value);
      if (!isNaN(v) && v >= 0) {
        slot.cost = v;
        cityView.renderer.markDirty();
      }
    });

    // Separator
    const sep = document.createElement('hr');
    Object.assign(sep.style, { border: 'none', borderTop: '1px solid #2d3548', margin: '8px 0' } as CSSStyleDeclaration);
    popup.appendChild(sep);

    // Zones list
    const zonesTitle = document.createElement('div');
    Object.assign(zonesTitle.style, { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' } as CSSStyleDeclaration);
    const zt = document.createElement('span');
    zt.textContent = `Zones (${slot.pixelZones.length})`;
    zt.style.fontWeight = '600';
    zonesTitle.appendChild(zt);
    const addZoneBtn = document.createElement('button');
    addZoneBtn.textContent = '+ Add Zone';
    Object.assign(addZoneBtn.style, {
      background: '#1c2541', border: '1px solid #2d3548', borderRadius: '4px',
      color: '#53d769', cursor: 'pointer', fontFamily: 'inherit', fontSize: '10px',
      padding: '2px 8px',
    } as CSSStyleDeclaration);
    addZoneBtn.addEventListener('click', () => {
      slot.pixelZones.push({ x: 0, y: 0, w: 16, h: 16 });
      cityView.renderer.markDirty();
      this.openZoneEditor(slot, cityView); // Re-render popup
    });
    zonesTitle.appendChild(addZoneBtn);
    popup.appendChild(zonesTitle);

    const zoneList = document.createElement('div');
    zoneList.style.display = 'flex';
    zoneList.style.flexDirection = 'column';
    zoneList.style.gap = '4px';

    for (let zi = 0; zi < slot.pixelZones.length; zi++) {
      const zone = slot.pixelZones[zi];
      const zRow = document.createElement('div');
      Object.assign(zRow.style, {
        display: 'flex', gap: '3px', alignItems: 'center',
        background: '#1c2541', borderRadius: '4px', padding: '4px 6px',
      } as CSSStyleDeclaration);

      const label = document.createElement('span');
      label.textContent = `#${zi + 1}`;
      label.style.color = '#8892a4';
      label.style.minWidth = '20px';
      zRow.appendChild(label);

      for (const key of ['x', 'y', 'w', 'h'] as const) {
        const inp = this.zeMakeInput(zRow, key, String(zone[key]));
        inp.addEventListener('change', () => {
          const v = parseInt(inp.value);
          if (!isNaN(v)) {
            zone[key] = v;
            cityView.renderer.markDirty();
          }
        });
      }

      // Delete zone button
      const delBtn = document.createElement('button');
      delBtn.textContent = 'X';
      Object.assign(delBtn.style, {
        background: 'none', border: 'none', color: '#e94560', cursor: 'pointer',
        fontFamily: 'inherit', fontSize: '11px', fontWeight: '700', padding: '0 2px',
      } as CSSStyleDeclaration);
      delBtn.addEventListener('click', () => {
        slot.pixelZones.splice(zi, 1);
        cityView.renderer.markDirty();
        this.openZoneEditor(slot, cityView); // Re-render popup
      });
      zRow.appendChild(delBtn);

      zoneList.appendChild(zRow);
    }

    popup.appendChild(zoneList);

    if (slot.pixelZones.length === 0) {
      const hint = document.createElement('div');
      hint.textContent = 'No zones defined — using cell bounds fallback';
      Object.assign(hint.style, { color: '#8892a4', fontSize: '9px', padding: '4px 0' } as CSSStyleDeclaration);
      popup.appendChild(hint);
    }

    document.body.appendChild(popup);
  }

  /** Helper: create a labeled row in the zone editor */
  private zeMakeRow(parent: HTMLElement, label: string): HTMLDivElement {
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '4px', alignItems: 'center', marginBottom: '4px' } as CSSStyleDeclaration);
    const lbl = document.createElement('span');
    lbl.textContent = label;
    Object.assign(lbl.style, { color: '#8892a4', fontSize: '10px', minWidth: '85px' } as CSSStyleDeclaration);
    row.appendChild(lbl);
    parent.appendChild(row);
    return row;
  }

  /** Helper: create a small input in the zone editor */
  private zeMakeInput(parent: HTMLElement, placeholder: string, value: string): HTMLInputElement {
    const inp = document.createElement('input');
    inp.value = value;
    inp.placeholder = placeholder;
    Object.assign(inp.style, {
      width: '36px', padding: '2px 3px', border: '1px solid #2d3548', borderRadius: '3px',
      background: '#0d1525', color: '#e8e8e8', fontFamily: 'inherit', fontSize: '10px',
      textAlign: 'right', boxSizing: 'border-box',
    } as CSSStyleDeclaration);
    parent.appendChild(inp);
    return inp;
  }

  private openShopSidePanel(cityId: string, slot: CitySlot): void {
    this.closeShopSidePanel();

    const cityShops = (this.game as any).cityShops as Map<string, CityShop>;
    const shopDefs = (this.game as any).shopDefinitions as ShopDefinition[];
    const resourceRegistry = this.game.resourceRegistry;
    const allResources = resourceRegistry.getAll();

    const shopKey = `${cityId}_${slot.slotKey}`;

    // Force-create the shop if it doesn't exist yet
    let shop = cityShops.get(shopKey);
    if (!shop) {
      const getOrCreate = (this.game as any).getOrCreateShop.bind(this.game);
      shop = getOrCreate(cityId, slot) as CityShop;
    }

    const panel = document.createElement('div');
    this.shopSidePanel = panel;
    Object.assign(panel.style, {
      position: 'fixed', top: '44px', right: '360px', zIndex: '9997',
      width: '300px', maxHeight: 'calc(100vh - 60px)',
      fontFamily: 'JetBrains Mono, monospace', fontSize: '11px',
      color: '#e8e8e8', borderRadius: '8px', overflow: 'hidden',
      border: '1px solid rgba(245,200,66,0.4)',
      boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
      background: '#16213e',
    } as CSSStyleDeclaration);
    document.body.appendChild(panel);

    const rebuild = () => {
      panel.innerHTML = '';
      if (!shop) return;

      // Header
      const header = document.createElement('div');
      Object.assign(header.style, {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 10px', background: '#0d1525', borderBottom: '1px solid #2d3548',
        borderRadius: '8px 8px 0 0',
      } as CSSStyleDeclaration);
      const title = document.createElement('span');
      title.textContent = `Shop @ ${slot.slotKey}`;
      title.style.fontWeight = '700';
      title.style.fontSize = '11px';
      title.style.color = '#f5c842';
      header.appendChild(title);
      const closeBtn = document.createElement('button');
      closeBtn.textContent = 'X';
      Object.assign(closeBtn.style, {
        background: 'transparent', border: 'none', color: '#8892a4',
        cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit',
      } as CSSStyleDeclaration);
      closeBtn.addEventListener('click', () => this.closeShopSidePanel());
      header.appendChild(closeBtn);
      panel.appendChild(header);

      const body = document.createElement('div');
      Object.assign(body.style, {
        padding: '10px', overflowY: 'auto', maxHeight: 'calc(100vh - 110px)',
      } as CSSStyleDeclaration);
      panel.appendChild(body);

      // ── Name ──
      const nameRow = this.sidePanelRow(body, 'Name');
      const nameInput = this.sidePanelInput(nameRow, shop.definition.name, '100%');
      nameInput.addEventListener('change', () => {
        (shop!.definition as any).name = nameInput.value;
        this.toast(`Name: ${nameInput.value}`);
      });

      // ── Type preset ──
      const typeRow = this.sidePanelRow(body, 'Preset');
      const typeSelect = document.createElement('select');
      Object.assign(typeSelect.style, this.sidePanelInputStyle());
      typeSelect.style.width = '100%';
      const customOpt = document.createElement('option');
      customOpt.value = '';
      customOpt.textContent = '(custom)';
      typeSelect.appendChild(customOpt);
      for (const def of shopDefs) {
        const opt = document.createElement('option');
        opt.value = def.id;
        opt.textContent = def.name;
        if (def.id === shop.definition.id) opt.selected = true;
        typeSelect.appendChild(opt);
      }
      typeSelect.addEventListener('change', () => {
        if (!typeSelect.value) return;
        const newDef = shopDefs.find(d => d.id === typeSelect.value);
        if (newDef && shop) {
          (shop as any).definition = { ...newDef };
          shop.itemPriceModifiers.clear();
          if (newDef.itemPriceModifiers) {
            for (const [resId, mod] of Object.entries(newDef.itemPriceModifiers)) {
              shop.itemPriceModifiers.set(resId, mod);
            }
          }
          this.toast(`Loaded preset: ${newDef.name}`);
          rebuild();
        }
      });
      typeRow.appendChild(typeSelect);

      // ── Global modifier ──
      const globalRow = this.sidePanelRow(body, 'Global multiplier');
      const globalInput = this.sidePanelInput(globalRow, shop.definition.priceModifier.toFixed(2), '60px');
      globalInput.style.color = '#f5c842';
      globalInput.addEventListener('change', () => {
        const v = parseFloat(globalInput.value);
        if (!isNaN(v) && v > 0 && shop) {
          (shop.definition as any).priceModifier = v;
          this.toast(`Global mult: x${v.toFixed(2)}`);
          rebuild();
        }
      });

      // Revenue display
      const revSpan = document.createElement('span');
      revSpan.style.color = '#53d769';
      revSpan.style.fontSize = '10px';
      revSpan.style.marginLeft = '8px';
      revSpan.textContent = `Rev: ${shop.totalRevenue}`;
      globalRow.appendChild(revSpan);

      // ── Description ──
      const descRow = this.sidePanelRow(body, 'Description');
      const descInput = this.sidePanelInput(descRow, shop.definition.description, '100%');
      descInput.addEventListener('change', () => {
        if (shop) (shop.definition as any).description = descInput.value;
      });

      // ── Categories ──
      const catRow = this.sidePanelRow(body, 'Categories (comma sep)');
      const catInput = this.sidePanelInput(catRow, shop.definition.acceptedCategories.join(', '), '100%');
      catInput.placeholder = 'empty = all';
      catInput.addEventListener('change', () => {
        if (!shop) return;
        const cats = catInput.value.split(',').map(s => s.trim()).filter(Boolean);
        (shop.definition as any).acceptedCategories = cats;
        this.toast(`Categories: ${cats.length === 0 ? 'all' : cats.join(', ')}`);
      });

      // ── Accepted items ──
      const itemsRow = this.sidePanelRow(body, 'Accepted items (comma sep)');
      const itemsInput = this.sidePanelInput(itemsRow, (shop.definition.acceptedItems ?? []).join(', '), '100%');
      itemsInput.placeholder = 'empty = use categories';
      itemsInput.addEventListener('change', () => {
        if (!shop) return;
        const items = itemsInput.value.split(',').map(s => s.trim()).filter(Boolean);
        (shop.definition as any).acceptedItems = items.length > 0 ? items : undefined;
      });

      // ── Separator ──
      const sep = document.createElement('hr');
      Object.assign(sep.style, { border: 'none', borderTop: '1px solid #2d3548', margin: '10px 0' } as CSSStyleDeclaration);
      body.appendChild(sep);

      // ── Per-item modifiers ──
      const perItemTitle = document.createElement('div');
      perItemTitle.textContent = 'PER-ITEM PRICE MODIFIERS';
      Object.assign(perItemTitle.style, {
        fontSize: '10px', color: '#a855f7', fontWeight: '700', marginBottom: '6px',
        letterSpacing: '0.5px',
      } as CSSStyleDeclaration);
      body.appendChild(perItemTitle);

      for (const [resId, mod] of shop.itemPriceModifiers) {
        const resDef = resourceRegistry.get(resId);
        const row = document.createElement('div');
        Object.assign(row.style, {
          display: 'flex', gap: '4px', alignItems: 'center', marginBottom: '3px',
        } as CSSStyleDeclaration);

        // Color dot
        const resColor = resDef ? '#' + resDef.color.toString(16).padStart(6, '0') : '#888';
        const dot = document.createElement('span');
        Object.assign(dot.style, {
          width: '8px', height: '8px', borderRadius: '50%', background: resColor,
          display: 'inline-block', flexShrink: '0',
        } as CSSStyleDeclaration);
        row.appendChild(dot);

        // Name
        const name = document.createElement('span');
        name.textContent = resDef?.name ?? resId;
        name.style.fontSize = '10px';
        name.style.flex = '1';
        row.appendChild(name);

        // Modifier input
        const modInp = this.sidePanelInput(row, mod.toFixed(2), '45px');
        modInp.style.color = '#f5c842';
        modInp.addEventListener('change', () => {
          const v = parseFloat(modInp.value);
          if (!isNaN(v) && v > 0 && shop) {
            shop.setItemPriceModifier(resId, v);
            rebuild();
          }
        });

        // Effective price
        const eff = document.createElement('span');
        eff.style.color = '#53d769';
        eff.style.fontSize = '9px';
        eff.style.width = '35px';
        eff.style.textAlign = 'right';
        eff.textContent = `= ${shop.getSellPrice(resId)}`;
        row.appendChild(eff);

        // Remove
        const rm = document.createElement('button');
        rm.textContent = 'x';
        Object.assign(rm.style, {
          padding: '0 4px', border: '1px solid #e94560', borderRadius: '3px',
          background: 'transparent', color: '#e94560', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: '9px', lineHeight: '14px',
        } as CSSStyleDeclaration);
        rm.addEventListener('click', () => {
          shop?.removeItemPriceModifier(resId);
          rebuild();
        });
        row.appendChild(rm);

        body.appendChild(row);
      }

      // ── Add new modifier ──
      const addRow = document.createElement('div');
      Object.assign(addRow.style, {
        display: 'flex', gap: '4px', alignItems: 'center', marginTop: '6px',
      } as CSSStyleDeclaration);

      const addSel = document.createElement('select');
      Object.assign(addSel.style, this.sidePanelInputStyle());
      addSel.style.flex = '1';
      const defOption = document.createElement('option');
      defOption.value = '';
      defOption.textContent = 'Add item...';
      addSel.appendChild(defOption);
      for (const res of allResources) {
        if (shop.itemPriceModifiers.has(res.id)) continue;
        if (res.id === 'dust') continue;
        const opt = document.createElement('option');
        opt.value = res.id;
        opt.textContent = `${res.name} (${res.sellPrice})`;
        addSel.appendChild(opt);
      }
      addRow.appendChild(addSel);

      const addModInp = this.sidePanelInput(addRow, '1.5', '40px');
      addModInp.style.color = '#f5c842';

      const addBtn = document.createElement('button');
      addBtn.textContent = '+';
      Object.assign(addBtn.style, {
        padding: '2px 8px', border: '1px solid #53d769', borderRadius: '3px',
        background: 'transparent', color: '#53d769', cursor: 'pointer',
        fontFamily: 'inherit', fontSize: '11px', fontWeight: '700',
      } as CSSStyleDeclaration);
      addBtn.addEventListener('click', () => {
        const resId = addSel.value;
        const mod = parseFloat(addModInp.value);
        if (!resId || isNaN(mod) || mod <= 0 || !shop) return;
        shop.setItemPriceModifier(resId, mod);
        rebuild();
      });
      addRow.appendChild(addBtn);
      body.appendChild(addRow);
    };

    rebuild();
  }

  private sidePanelRow(parent: HTMLElement, label: string): HTMLDivElement {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px', flexWrap: 'wrap',
    } as CSSStyleDeclaration);
    const lbl = document.createElement('span');
    lbl.textContent = label;
    Object.assign(lbl.style, { color: '#8892a4', fontSize: '10px', width: '100%' } as CSSStyleDeclaration);
    row.appendChild(lbl);
    parent.appendChild(row);
    return row;
  }

  private sidePanelInput(parent: HTMLElement, value: string, width: string): HTMLInputElement {
    const inp = document.createElement('input');
    inp.value = value;
    Object.assign(inp.style, this.sidePanelInputStyle());
    inp.style.width = width;
    parent.appendChild(inp);
    return inp;
  }

  private sidePanelInputStyle(): Record<string, string> {
    return {
      padding: '3px 5px', border: '1px solid #2d3548', borderRadius: '3px',
      background: '#0d1525', color: '#e8e8e8', fontFamily: 'inherit', fontSize: '10px',
      boxSizing: 'border-box',
    };
  }

  // ─── FACTORY TAB ───────────────────────────────────────────

  private buildFactoryTab(): void {
    const factory = (this.game as any).activeFactory;
    const factoryView = (this.game as any).factoryView;

    if (!factory || !factoryView) {
      this.tabContent.textContent = 'Enter a factory first.';
      return;
    }

    const infoSec = this.makeSection(`Factory: ${factory.id}`);
    const info = document.createElement('div');
    info.style.color = '#8892a4';

    const machines = factory.getMachines?.() ?? [];
    const belts = factory.getBelts?.() ?? [];
    const ioPorts = factory.getIOPorts?.() ?? [];

    info.innerHTML = [
      `Machines: <span style="color:#e8e8e8">${machines.length}</span>`,
      `Belts: <span style="color:#e8e8e8">${belts.length}</span>`,
      `IO Ports: <span style="color:#e8e8e8">${ioPorts.length}</span>`,
    ].join('<br>');
    infoSec.appendChild(info);

    const actionSec = this.makeSection('Actions');
    this.makeButton('Clear All Entities', () => {
      if (factory.clear) {
        factory.clear();
        (factoryView as any).renderer?.markGridDirty();
        this.toast('Factory cleared');
        this.refreshTab();
      } else {
        this.toast('clear() not available on Factory');
      }
    }, actionSec, true);

    // ── Border Paint Mode ──
    const slot = this.game.getActiveFactorySlot?.();
    if (slot) {
      const borderSec = this.makeSection('Border Editor');
      const hint = document.createElement('div');
      hint.style.color = '#8892a4';
      hint.style.fontSize = '9px';
      hint.style.marginBottom = '6px';
      hint.textContent = 'Select a brush then right-click border cells in the factory view.';
      borderSec.appendChild(hint);

      // Status label
      const statusLabel = document.createElement('div');
      statusLabel.style.color = '#8892a4';
      statusLabel.style.fontSize = '10px';
      statusLabel.style.marginBottom = '4px';
      const borderCount = slot.manualBorder.filter(b => b.type === 'road').length;
      statusLabel.textContent = `Manual border: ${slot.manualBorder.length} cells (${borderCount} roads)`;
      borderSec.appendChild(statusLabel);

      const btnRow = document.createElement('div');
      Object.assign(btnRow.style, { display: 'flex', gap: '4px', flexWrap: 'wrap' } as CSSStyleDeclaration);

      const paintRoadBtn = this.makeSmallBtn('Paint Road', '#2d8a4e', () => {
        this.startBorderPaint('road', slot, factory, factoryView, paintRoadBtn, paintWallBtn);
      });
      const paintWallBtn = this.makeSmallBtn('Paint Wall', '#6b7280', () => {
        this.startBorderPaint('wall', slot, factory, factoryView, paintRoadBtn, paintWallBtn);
      });
      btnRow.appendChild(paintRoadBtn);
      btnRow.appendChild(paintWallBtn);

      btnRow.appendChild(this.makeSmallBtn('Stop', '#e94560', () => {
        this.stopBorderPaint(factoryView);
        paintRoadBtn.style.outline = '';
        paintWallBtn.style.outline = '';
        this.toast('Border paint stopped');
      }));

      btnRow.appendChild(this.makeSmallBtn('Apply', '#4dc9f6', () => {
        import('@/core/BorderContextComputer').then(mod => {
          const cityView = this.game.getCurrentCityView?.();
          factory.borderContext = mod.computeBorderContext(slot, cityView?.layout);
          (factoryView as any).renderer?.markGridDirty();
          this.toast(`Border applied (${slot.manualBorder.length} cells)`);
          this.refreshTab();
        });
      }));

      btnRow.appendChild(this.makeSmallBtn('Clear', '#f5c842', () => {
        slot.manualBorder = [];
        this.stopBorderPaint(factoryView);
        import('@/core/BorderContextComputer').then(mod => {
          const cityView = this.game.getCurrentCityView?.();
          factory.borderContext = mod.computeBorderContext(slot, cityView?.layout);
          (factoryView as any).renderer?.markGridDirty();
          this.toast('Manual border cleared');
          this.refreshTab();
        });
      }));

      borderSec.appendChild(btnRow);
    }
  }

  private borderPaintType: 'road' | 'wall' | null = null;

  private startBorderPaint(
    type: 'road' | 'wall',
    slot: CitySlot,
    factory: any,
    factoryView: any,
    roadBtn: HTMLElement,
    wallBtn: HTMLElement,
  ): void {
    this.borderPaintType = type;
    roadBtn.style.outline = type === 'road' ? '2px solid #53d769' : '';
    wallBtn.style.outline = type === 'wall' ? '2px solid #e8e8e8' : '';
    this.showBanner(`Border paint: ${type} (right-click cells)`);

    // Build border lookup
    const borderMap = new Map<string, 'wall' | 'road'>();
    for (const b of slot.manualBorder) {
      borderMap.set(`${b.x},${b.y}`, b.type);
    }

    // Grid dimensions = interiorSize * FACTORY_CELL_RATIO (each city cell = 5 factory cells)
    const R = 5; // FACTORY_CELL_RATIO
    const gw = slot.interiorSize.w * R;
    const gh = slot.interiorSize.h * R;

    factoryView.onRightClickCell = (gx: number, gy: number): boolean => {
      if (!this.borderPaintType) return false;

      // Check if this is a border cell (outside interior grid)
      const isInterior = gx >= 0 && gx < gw && gy >= 0 && gy < gh;
      if (isInterior) return false; // Can't paint interior cells

      // Check if it's within the border ring (1 cell around interior)
      const isBorder = gx >= -1 && gx <= gw && gy >= -1 && gy <= gh;
      if (!isBorder) return false;

      const key = `${gx},${gy}`;
      borderMap.set(key, this.borderPaintType);

      // Sync back to slot
      slot.manualBorder = [];
      for (const [k, t] of borderMap) {
        const [x, y] = k.split(',').map(Number);
        slot.manualBorder.push({ x, y, type: t });
      }

      // Live update: recompute border and re-render
      import('@/core/BorderContextComputer').then(mod => {
        const cityView = this.game.getCurrentCityView?.();
        factory.borderContext = mod.computeBorderContext(slot, cityView?.layout);
        (factoryView as any).renderer?.markGridDirty();
      });

      return true;
    };
  }

  private stopBorderPaint(factoryView: any): void {
    this.borderPaintType = null;
    factoryView.onRightClickCell = null;
    this.hideBanner();
  }

  destroy(): void {
    this.cancelPickMode();
    document.getElementById('debug-toggle')?.remove();
    this.root.remove();
  }
}

/** Mount point — call from Game constructor behind import.meta.env.DEV */
export function mountDebugPanel(game: Game): DebugPanel {
  return new DebugPanel(game);
}
