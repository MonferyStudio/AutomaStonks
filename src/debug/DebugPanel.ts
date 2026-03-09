import type { Game } from '@/core/Game';
import { CITY_TYPES } from '@/world/CityType';
import { COLORS, CELL_SIZE_PX as CS } from '@/utils/Constants';
import { Vector2 } from '@/utils/Vector2';
import { Polyomino } from '@/simulation/Polyomino';
import { CitySlot } from '@/city/CitySlot';
import { CityNode } from '@/city/CityNode';
import { serializeCityLayout } from '@/city/CityLayoutData';
import { hasCityJson } from '@/city/CityLayoutLoader';
import { CityGenerator } from '@/city/CityGenerator';

type TabId = 'world' | 'city' | 'factory' | 'general';
type PickMode =
  | 'none'
  | 'place_city' | 'move_city'
  | 'add_road' | 'remove_road'
  | 'place_building'
  | 'paint_building';

interface PaintState {
  buildingType: 'factory' | 'shop' | 'storage' | 'house';
  cells: Vector2[];
  color: number;
  cost: number;
  /** If editing an existing building, reference to it */
  editingSlot?: CitySlot;
  editingNode?: CityNode;
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
  private placeBuildingData: { type: 'factory' | 'shop' | 'storage' | 'house' | 'decoration'; polyId: string; color: number; cost: number } | null = null;
  private paintState: PaintState | null = null;
  private banner: HTMLDivElement | null = null;
  private pickUpHandler: ((e: MouseEvent) => void) | null = null;
  private pickDownHandler: ((e: MouseEvent) => void) | null = null;
  private escHandler: ((e: KeyboardEvent) => void) | null = null;

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
      fontFamily: 'Space Mono, Consolas, monospace', fontSize: '11px',
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

      if (type === 'factory') {
        const slot = new CitySlot('factory', pos, polyId, poly, cost);
        layout.factorySlots.push(slot);
      } else if (type === 'shop') {
        const slot = new CitySlot('shop', pos, polyId, poly, cost);
        layout.shopSlots.push(slot);
      } else if (type === 'storage') {
        const slot = new CitySlot('storage', pos, polyId, poly, cost);
        layout.storageSlots.push(slot);
      } else if (type === 'house') {
        const node = new CityNode('house', pos, poly, polyId, 'House', color);
        layout.decorations.push(node);
      } else if (type === 'decoration') {
        const shade = 0x1a4a20 + Math.floor(Math.random() * 0x153015);
        const node = new CityNode('decoration', pos, poly, polyId, 'Tree', shade);
        layout.decorations.push(node);
      }

      cityView.renderer.markDirty();
      this.toast(`Placed ${type} (${polyId}) at (${gx}, ${gy})`);
      // Stay in place mode for decorations to allow multi-placement
      if (type !== 'decoration') {
        this.cancelPickMode();
      }
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
        for (const c of slot.polyomino.cells) {
          if (c.add(slot.position).toKey() === key) {
            this.toast('Cell occupied by factory');
            return;
          }
        }
      }
      // Check shop slots
      for (const slot of layout.shopSlots) {
        if (ps.editingSlot && slot.id === ps.editingSlot.id) continue;
        for (const c of slot.polyomino.cells) {
          if (c.add(slot.position).toKey() === key) {
            this.toast('Cell occupied by shop');
            return;
          }
        }
      }
      // Check decorations (skip the one being edited)
      for (const deco of layout.decorations) {
        if (ps.editingNode && deco.id === ps.editingNode.id) continue;
        for (const c of deco.polyomino.cells) {
          if (c.add(deco.position).toKey() === key) {
            this.toast('Cell occupied by decoration');
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
      const newSlot = new CitySlot(slot.slotType, position, polyId, poly, slot.cost);
      newSlot.purchased = slot.purchased;
      newSlot.buildingNodeId = slot.buildingNodeId;
      const storageIdx = layout.storageSlots.indexOf(slot);
      if (idx >= 0) layout.factorySlots[idx] = newSlot;
      else if (shopIdx >= 0) layout.shopSlots[shopIdx] = newSlot;
      else if (storageIdx >= 0) layout.storageSlots[storageIdx] = newSlot;
    } else if (ps.editingNode) {
      // Update existing decoration
      const node = ps.editingNode;
      const idx = layout.decorations.indexOf(node);
      if (idx >= 0) {
        layout.decorations[idx] = new CityNode(node.buildingType, position, poly, polyId, node.name, node.color);
      }
    } else {
      // Create new building
      if (ps.buildingType === 'factory') {
        const slot = new CitySlot('factory', position, polyId, poly, ps.cost);
        layout.factorySlots.push(slot);
      } else if (ps.buildingType === 'shop') {
        const slot = new CitySlot('shop', position, polyId, poly, ps.cost);
        slot.purchased = true;
        layout.shopSlots.push(slot);
      } else if (ps.buildingType === 'storage') {
        const slot = new CitySlot('storage', position, polyId, poly, ps.cost);
        layout.storageSlots.push(slot);
      } else if (ps.buildingType === 'house') {
        const node = new CityNode('house', position, poly, polyId, 'House', ps.color);
        layout.decorations.push(node);
      }
    }

    cityView.renderer.clearPaintPreview();
    cityView.renderer.markDirty();
    this.toast(`${ps.editingSlot || ps.editingNode ? 'Updated' : 'Created'} ${ps.buildingType} (${ps.cells.length} cells)`);
  }

  private enterPaintMode(type: 'factory' | 'shop' | 'storage' | 'house', color: number, cost: number, editSlot?: CitySlot, editNode?: CityNode): void {
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
      ps.cells = editSlot.polyomino.cells.map(c => c.add(editSlot.position));
      ps.originalCells = ps.cells.map(c => new Vector2(c.x, c.y));
      ps.originalPosition = new Vector2(editSlot.position.x, editSlot.position.y);
    } else if (editNode) {
      ps.editingNode = editNode;
      ps.cells = editNode.polyomino.cells.map(c => c.add(editNode.position));
      ps.originalCells = ps.cells.map(c => new Vector2(c.x, c.y));
      ps.originalPosition = new Vector2(editNode.position.x, editNode.position.y);
    }

    this.paintState = ps;
    this.pickMode = 'paint_building';

    const action = editSlot || editNode ? 'Editing' : 'Painting';
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
    const generator = new CityGenerator(polyRegistry);
    const unlockCost = worldCity?.unlockCost ?? 0;
    const cityType = worldCity?.cityType;

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
      `Decorations: <span style="color:#e8e8e8">${layout.decorations.length}</span>`,
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
    colorInput.value = '#' + ((cityView.renderer as any).bgColor >>> 0).toString(16).padStart(6, '0');
    Object.assign(colorInput.style, {
      width: '60px', height: '28px', border: '1px solid #2d3548', borderRadius: '4px',
      background: '#0d1525', cursor: 'pointer',
    } as CSSStyleDeclaration);
    colorInput.addEventListener('input', () => {
      (cityView.renderer as any).bgColor = parseInt(colorInput.value.slice(1), 16);
      cityView.renderer.markDirty();
    });
    bgSec.appendChild(colorInput);

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
    if (cityType) {
      this.makeButton('Regenerate', () => {
        generator.regenerateRoads(layout, cityType, unlockCost);
        cityView.renderer.markDirty();
        this.toast('Roads regenerated');
        this.refreshTab();
      }, roadBtnRow);
    }
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
    this.makeButton('Regenerate', () => {
      generator.regenerateFactories(layout, unlockCost);
      cityView.renderer.markDirty();
      this.toast('Factories regenerated');
      this.refreshTab();
    }, factAddRow);
    this.makeButton('Paint Factory', () => {
      this.enterPaintMode('factory', COLORS.FACTORY, 100);
    }, factAddRow);
    factSec.appendChild(factAddRow);

    // ── Shop Slots ──
    const shopSec = this.makeSection('Shop Slots');
    this.buildSlotList(layout.shopSlots, 'shop', cityView, shopSec);

    const shopAddRow = document.createElement('div');
    shopAddRow.style.display = 'flex';
    shopAddRow.style.gap = '4px';
    shopAddRow.style.marginTop = '4px';
    this.makeButton('Regenerate', () => {
      generator.regenerateShops(layout, unlockCost);
      cityView.renderer.markDirty();
      this.toast('Shops regenerated');
      this.refreshTab();
    }, shopAddRow);
    this.makeButton('Paint Shop', () => {
      this.enterPaintMode('shop', COLORS.SHOP, 0);
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
    this.makeButton('Paint Storage', () => {
      const price = parseInt(storagePriceInput.value) || 75;
      this.enterPaintMode('storage', COLORS.STORAGE, price);
    }, storageAddRow);
    storageSec.appendChild(storageAddRow);

    // ── Houses & Decorations ──
    const decoSec = this.makeSection('Houses & Decorations');
    const houses = layout.decorations.filter((d: CityNode) => d.buildingType === 'house');
    const trees = layout.decorations.filter((d: CityNode) => d.buildingType === 'decoration');
    const decoInfo = document.createElement('div');
    decoInfo.style.color = '#8892a4';
    decoInfo.innerHTML = `Houses: <span style="color:#e8e8e8">${houses.length}</span> | Trees: <span style="color:#e8e8e8">${trees.length}</span>`;
    decoSec.appendChild(decoInfo);

    // Scrollable decoration list with remove buttons
    const decoList = document.createElement('div');
    Object.assign(decoList.style, {
      maxHeight: '120px', overflowY: 'auto', fontSize: '9px',
      border: '1px solid #2d3548', borderRadius: '4px', padding: '4px',
      marginTop: '4px',
    } as CSSStyleDeclaration);
    for (let i = 0; i < layout.decorations.length; i++) {
      const deco = layout.decorations[i];
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '2px 2px',
      } as CSSStyleDeclaration);

      const colorSwatch = document.createElement('span');
      colorSwatch.style.display = 'inline-block';
      colorSwatch.style.width = '8px';
      colorSwatch.style.height = '8px';
      colorSwatch.style.borderRadius = '2px';
      colorSwatch.style.background = '#' + deco.color.toString(16).padStart(6, '0');
      colorSwatch.style.marginRight = '4px';
      row.appendChild(colorSwatch);

      const label = document.createElement('span');
      label.style.flex = '1';
      label.innerHTML = `${deco.name} <span style="color:#8892a4">${deco.polyominoId} (${deco.position.x},${deco.position.y})</span>`;
      row.appendChild(label);

      const decoBtnGroup = document.createElement('div');
      decoBtnGroup.style.display = 'flex';
      decoBtnGroup.style.gap = '2px';

      // Edit button for houses (multi-cell buildings worth editing)
      if (deco.buildingType === 'house') {
        decoBtnGroup.appendChild(this.makeSmallBtn('Edit', '#4dc9f6', () => {
          this.enterPaintMode('house', deco.color, 0, undefined, deco);
        }));
      }

      decoBtnGroup.appendChild(this.makeSmallBtn('X', '#e94560', () => {
        layout.decorations.splice(i, 1);
        cityView.renderer.markDirty();
        this.toast(`Removed ${deco.name}`);
        this.refreshTab();
      }));

      row.appendChild(decoBtnGroup);
      decoList.appendChild(row);
    }
    decoSec.appendChild(decoList);

    const decoBtnRow = document.createElement('div');
    decoBtnRow.style.display = 'flex';
    decoBtnRow.style.gap = '4px';
    decoBtnRow.style.marginTop = '4px';
    this.makeButton('Paint House', () => {
      this.enterPaintMode('house', 0x356840, 0);
    }, decoBtnRow);
    this.makeButton('+ Tree', () => {
      this.enterPickMode('place_building', 'Right-click to place a tree');
      const shade = 0x1a4a20 + Math.floor(Math.random() * 0x153015);
      this.placeBuildingData = { type: 'decoration', polyId: 'mono_1', color: shade, cost: 0 };
    }, decoBtnRow);
    this.makeButton('Regenerate', () => {
      generator.regenerateDecorations(layout, unlockCost);
      cityView.renderer.markDirty();
      this.toast('Decorations regenerated');
      this.refreshTab();
    }, decoBtnRow);
    this.makeButton('Clear Decor', () => {
      layout.decorations.length = 0;
      cityView.renderer.markDirty();
      this.toast('Decorations cleared');
      this.refreshTab();
    }, decoBtnRow, true);
    decoSec.appendChild(decoBtnRow);

    // ── Export / Persistence ──
    const exportSec = this.makeSection('Export City JSON');
    const fromJson = hasCityJson(activeCityId);
    const sourceLabel = document.createElement('div');
    sourceLabel.style.color = '#8892a4';
    sourceLabel.style.marginBottom = '4px';
    sourceLabel.innerHTML = `Source: <span style="color:${fromJson ? '#53d769' : '#f5c842'}">${fromJson ? 'JSON file' : 'Generated'}</span>`;
    exportSec.appendChild(sourceLabel);

    const buildCityExport = () => {
      const bgColor = (cityView.renderer as any).bgColor as number;
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
      layout.decorations.length = 0;
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
      label.innerHTML = `${slot.polyominoId} (${slot.position.x},${slot.position.y}) [${slot.polyomino.cellCount}c] ${status}`;
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

      // Edit button — enter paint mode on this slot
      const color = type === 'factory' ? COLORS.FACTORY : type === 'storage' ? COLORS.STORAGE : COLORS.SHOP;
      btnGroup.appendChild(this.makeSmallBtn('Edit', '#4dc9f6', () => {
        this.enterPaintMode(slot.slotType as 'factory' | 'shop' | 'storage', color, slot.cost, slot);
      }));

      btnGroup.appendChild(this.makeSmallBtn('X', '#e94560', () => {
        slots.splice(i, 1);
        cityView.renderer.markDirty();
        this.toast(`Removed ${type} slot`);
        this.refreshTab();
      }));

      row.appendChild(btnGroup);
      listContainer.appendChild(row);
    }
    parent.appendChild(listContainer);
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
        factoryView.rebuildAll?.();
        this.toast('Factory cleared');
        this.refreshTab();
      } else {
        this.toast('clear() not available on Factory');
      }
    }, actionSec, true);
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
