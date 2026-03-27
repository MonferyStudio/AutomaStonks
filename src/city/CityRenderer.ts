import { Application, Container, Graphics, Sprite, Text, TextStyle } from 'pixi.js';
import { COLORS, CELL_SIZE_PX, FONT_UI, FONT_MONO } from '@/utils/Constants';
import type { BuildingAlert } from '@/core/AlertMonitor';
import { TextureCache } from '@/rendering/TextureCache';
import { getRoadSpriteInfo } from '@/rendering/TileResolver';
import { formatMoney } from '@/utils/currency';
import { eventBus } from '@/core/EventBus';
import { FloatingTextManager } from '@/ui/FloatingTextManager';
import type { CityLayout } from './CityLayoutData';
import type { CitySlot } from './CitySlot';
import type { Truck } from '@/transport/Truck';
import type { TruckRoute } from '@/transport/TruckRoute';
import type { PolyominoRegistry } from '@/simulation/PolyominoRegistry';
import { Vector2 } from '@/utils/Vector2';
import { getTruckColor } from '@/data/truckColors';
import { textResolution } from '@/utils/platform';


const CS = CELL_SIZE_PX;

export class CityRenderer {
  readonly container: Container;
  private mapLayer: Container;
  private roadLayer: Container;
  private buildingLayer: Container;
  private decorLayer: Container;
  private vehicleLayer: Container;
  private uiOverlay: Container;
  private polyRegistry: PolyominoRegistry;
  private bgColor: number;
  private app: Application | null = null;
  private dirty = true;
  private paintPreviewLayer: Container;
  private paintCells: Vector2[] = [];
  private paintColor: number = 0;
  readonly floatingText: FloatingTextManager;
  private cityId: string = '';
  /** When true, show road overlay and slot outlines on map-based cities */
  showDebugOverlay = false;

  private _hoveredSlotKey: string | null = null;
  private _labelContainers = new Map<string, { container: Container; cx: number; cy: number }>();

  constructor(polyRegistry: PolyominoRegistry, bgColor: number = COLORS.BG_PRIMARY) {
    this.polyRegistry = polyRegistry;
    this.bgColor = bgColor;

    this.container = new Container();
    this.container.sortableChildren = true;

    this.mapLayer = new Container();
    this.mapLayer.zIndex = -1;
    this.roadLayer = new Container();
    this.roadLayer.zIndex = 0;
    this.buildingLayer = new Container();
    this.buildingLayer.zIndex = 1;
    this.decorLayer = new Container();
    this.decorLayer.zIndex = 2;
    this.vehicleLayer = new Container();
    this.vehicleLayer.zIndex = 4;
    this.vehicleLayer.sortableChildren = true;
    this.paintPreviewLayer = new Container();
    this.paintPreviewLayer.zIndex = 3;
    this.uiOverlay = new Container();
    this.uiOverlay.zIndex = 5;

    this.floatingText = new FloatingTextManager();
    this.container.addChild(this.mapLayer, this.roadLayer, this.buildingLayer, this.decorLayer, this.paintPreviewLayer, this.vehicleLayer, this.uiOverlay, this.floatingText.container);

    // Refresh building labels when currency symbol changes
    eventBus.on('CurrencyChanged', () => this.markDirty());
  }

  setHoveredSlot(slotKey: string | null): void {
    if (slotKey === this._hoveredSlotKey) return;
    // Un-hover previous
    const prev = this._hoveredSlotKey ? this._labelContainers.get(this._hoveredSlotKey) : null;
    if (prev) {
      prev.container.scale.set(1);
      prev.container.pivot.set(0, 0);
      prev.container.position.set(0, 0);
    }
    this._hoveredSlotKey = slotKey;
    // Hover new — scale up from center
    const next = slotKey ? this._labelContainers.get(slotKey) : null;
    if (next) {
      const s = 1.15;
      next.container.pivot.set(next.cx, next.cy);
      next.container.position.set(next.cx, next.cy);
      next.container.scale.set(s);
    }
  }

  setCityId(cityId: string): void {
    this.cityId = cityId;
    this.markDirty();
  }

  markDirty(): void {
    this.dirty = true;
  }

  /** Link the Pixi app so bgColor changes also update the canvas background */
  setApp(app: Application): void {
    this.app = app;
    this.syncAppBackground();
  }

  setBgColor(color: number): void {
    this.bgColor = color;
    this.syncAppBackground();
    this.markDirty();
  }

  getBgColor(): number {
    return this.bgColor;
  }

  private syncAppBackground(): void {
    if (this.app) {
      this.app.renderer.background.color = this.bgColor;
    }
  }

  /** Truck data for rendering — set externally each frame */
  private truckData: { truck: Truck; route: TruckRoute }[] = [];
  /** Interpolation alpha (0–1) between previous and current tick */
  private truckInterpolationAlpha: number = 1;

  /** Building alerts for overlay icons */
  private alertData = new Map<string, BuildingAlert>();

  /** Custom building names */
  private buildingNames = new Map<string, string>();


  setTruckData(data: { truck: Truck; route: TruckRoute }[], interpolationAlpha: number = 1): void {
    this.truckData = data;
    this.truckInterpolationAlpha = interpolationAlpha;
  }

  setAlertData(alerts: Map<string, BuildingAlert>): void {
    this.alertData = alerts;
    this.markDirty();
  }

  setBuildingNames(names: Map<string, string>): void {
    this.buildingNames = names;
    this.markDirty();
  }

  render(layout: CityLayout, factorySlots: CitySlot[], shopSlots: CitySlot[], storageSlots: CitySlot[]): void {
    const allSlots = [...factorySlots, ...shopSlots, ...storageSlots];

    if (!this.dirty) {
      this.vehicleLayer.removeChildren().forEach(c => c.destroy({ children: true }));
      this.renderTruckRouteLines();
      this.renderTrucks();
      return;
    }

    this.dirty = false;
    this.mapLayer.removeChildren().forEach(c => c.destroy({ children: true }));
    this.roadLayer.removeChildren().forEach(c => c.destroy({ children: true }));
    this.buildingLayer.removeChildren().forEach(c => c.destroy({ children: true }));
    this.decorLayer.removeChildren().forEach(c => c.destroy({ children: true }));
    this.vehicleLayer.removeChildren().forEach(c => c.destroy({ children: true }));

    const mapTex = TextureCache.getCityMap(this.cityId);
    if (mapTex) {
      // City has a pre-rendered map image — display it as background
      const mapSprite = new Sprite(mapTex);
      mapSprite.roundPixels = true;
      // Map images are drawn at 16px/cell in Tiled, scale up to CELL_SIZE_PX
      mapSprite.scale.set(CS / 16);
      this.mapLayer.addChild(mapSprite);

      // Debug overlay: show road cells and slot outlines on top of the map
      if (this.showDebugOverlay) {
        this.renderRoadOverlay(layout);
      }
    } else {
      this.renderBackground(layout);
      this.renderRoads(layout);
    }

    // Render slot outlines — always when no map, only in debug when map exists
    if (!mapTex || this.showDebugOverlay) {
      this.renderSlots(factorySlots, COLORS.FACTORY, false);
      this.renderSlots(shopSlots, COLORS.SHOP, true);
      this.renderSlots(storageSlots, COLORS.STORAGE, false);
    }

    // Debug: render truck stop markers + camera bounds
    if (this.showDebugOverlay) {
      this.renderTruckStopMarkers(allSlots);
      if (layout.cameraBounds) {
        this.renderCameraBoundsOverlay(layout.cameraBounds);
      }
    }
    this.renderOverlayIcons(allSlots);
    this.renderTruckRouteLines();
    this.renderPaintPreview();
    this.renderTrucks();
  }

  private renderRoadOverlay(layout: CityLayout): void {
    const roads = layout.roadNetwork.getAllRoads();
    if (roads.length === 0) return;

    const overlay = new Graphics();
    for (const pos of roads) {
      overlay.rect(pos.x * CS, pos.y * CS, CS, CS);
    }
    overlay.fill({ color: 0xffffff, alpha: 0.12 });
    this.roadLayer.addChild(overlay);
  }

  private renderTruckStopMarkers(allSlots: CitySlot[]): void {
    const g = new Graphics();
    for (const slot of allSlots) {
      if (!slot.truckStop) continue;
      const cx = slot.truckStop.x * CS + CS / 2;
      const cy = slot.truckStop.y * CS + CS / 2;
      const r = CS * 0.3;

      // Diamond shape
      g.moveTo(cx, cy - r);
      g.lineTo(cx + r, cy);
      g.lineTo(cx, cy + r);
      g.lineTo(cx - r, cy);
      g.closePath();
      g.fill({ color: COLORS.ACCENT_YELLOW, alpha: 0.7 });
      g.stroke({ color: 0xffffff, width: 1.5, alpha: 0.8 });
    }
    this.buildingLayer.addChild(g);
  }

  private renderCameraBoundsOverlay(bounds: { x: number; y: number; w: number; h: number }): void {
    const g = new Graphics();
    g.rect(bounds.x, bounds.y, bounds.w, bounds.h);
    g.stroke({ color: 0xff4444, width: 2, alpha: 0.8 });
    this.buildingLayer.addChild(g);
  }

  private renderBackground(layout: CityLayout): void {
    const bg = new Graphics();
    bg.rect(0, 0, layout.width * CS, layout.height * CS);
    bg.fill(this.bgColor);
    this.roadLayer.addChild(bg);
  }

  // --- Roads ---

  private renderRoads(layout: CityLayout): void {
    const roads = layout.roadNetwork.getAllRoads();
    const roadSet = new Set(roads.map(r => r.toKey()));
    const scale = CS / 16;

    const has = (x: number, y: number) => roadSet.has(new Vector2(x, y).toKey());

    for (const pos of roads) {
      const u = has(pos.x, pos.y - 1);
      const d = has(pos.x, pos.y + 1);
      const l = has(pos.x - 1, pos.y);
      const r = has(pos.x + 1, pos.y);

      const info = getRoadSpriteInfo(u, d, l, r);
      if (info.tex) {
        const sprite = new Sprite(info.tex);
        sprite.anchor.set(0.5);
        sprite.position.set(pos.x * CS + CS / 2, pos.y * CS + CS / 2);
        sprite.roundPixels = true;
        sprite.scale.set(scale);
        sprite.rotation = info.rotation;
        this.roadLayer.addChild(sprite);
      }
    }
  }

  // --- Buildings ---

  private renderSlots(slots: CitySlot[], color: number, alwaysBuilt: boolean): void {
    for (const slot of slots) {
      const zones = slot.getWorldZones();
      if (this.showDebugOverlay) {
        // Debug: always show zone outlines for all slots
        for (const z of zones) {
          this.drawLockedZone(z.x, z.y, z.w, z.h, color);
        }
      } else if (slot.purchased || alwaysBuilt) {
        for (const z of zones) {
          this.drawBuilding(z.x, z.y, z.w, z.h, color, this.buildingLayer);
        }
      } else {
        for (const z of zones) {
          this.drawLockedZone(z.x, z.y, z.w, z.h, color);
        }
      }
    }
  }

  private darken(color: number, amount: number): number {
    const r = ((color >> 16) & 0xff) * (1 - amount);
    const g = ((color >> 8) & 0xff) * (1 - amount);
    const b = (color & 0xff) * (1 - amount);
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
  }

  private drawBuilding(ox: number, oy: number, w: number, h: number, color: number, layer: Container): void {
    // If we have a city map image, purchased buildings are already in the image
    if (TextureCache.getCityMap(this.cityId)) return;

    // Procedural rendering — simple rectangle
    const darkColor = this.darken(color, 0.25);
    const sd = 3;
    const bandH = Math.round(h * 0.35);
    const rad = 6;

    const shadow = new Graphics();
    shadow.roundRect(ox + sd, oy + sd, w, h, rad);
    shadow.fill({ color: 0x000000, alpha: 0.3 });
    layer.addChild(shadow);

    const body = new Graphics();
    body.roundRect(ox, oy, w, h, rad);
    body.fill(color);
    layer.addChild(body);

    const band = new Graphics();
    band.roundRect(ox, oy + h - bandH, w, bandH, rad);
    band.fill(darkColor);
    // Mask band to building shape
    const mask = new Graphics();
    mask.roundRect(ox, oy, w, h, rad);
    mask.fill(0xffffff);
    layer.addChild(mask);
    band.mask = mask;
    layer.addChild(band);
  }

  /** Draw a single locked zone rectangle (fill + outline) */
  private drawLockedZone(ox: number, oy: number, w: number, h: number, color: number): void {
    const fill = new Graphics();
    fill.roundRect(ox, oy, w, h, 6);
    fill.fill({ color, alpha: 0.12 });
    this.buildingLayer.addChild(fill);

    const outline = new Graphics();
    outline.roundRect(ox, oy, w, h, 6);
    outline.stroke({ color, alpha: 0.35, width: 1.5 });
    this.buildingLayer.addChild(outline);
  }

  // --- Trucks (sprite-based) ---

  private renderTruckRouteLines(): void {
    if (this.truckData.length === 0) return;
    for (const { truck, route } of this.truckData) {
      if (route.path.length < 2) continue;
      const line = new Graphics();
      const color = getTruckColor(truck.colorVariant).light;
      line.moveTo(route.path[0].x * CS + CS / 2, route.path[0].y * CS + CS / 2);
      for (let i = 1; i < route.path.length; i++) {
        line.lineTo(route.path[i].x * CS + CS / 2, route.path[i].y * CS + CS / 2);
      }
      line.stroke({ color, alpha: 0.35, width: 4 });
      this.vehicleLayer.addChild(line);
    }
  }

  private renderTrucks(): void {
    const alpha = this.truckInterpolationAlpha;

    for (const { truck, route } of this.truckData) {
      if (truck.state === 'idle') continue;
      if (route.path.length === 0) continue;

      let pos: Vector2;
      let dir: Vector2;

      const isMoving = truck.state === 'moving_to_dest' || truck.state === 'moving_to_origin';
      const wasMoving = truck.prevState === 'moving_to_dest' || truck.prevState === 'moving_to_origin';

      if (isMoving) {
        const reverse = truck.state === 'moving_to_origin';
        if (wasMoving && truck.prevState === truck.state) {
          // Interpolate between previous and current progress for smooth sub-tick movement
          const interpProgress = truck.prevProgress + (truck.progress - truck.prevProgress) * alpha;
          ({ pos, dir } = route.getPositionAndDirection(interpProgress, reverse));
        } else {
          ({ pos, dir } = route.getPositionAndDirection(truck.progress, reverse));
        }
      } else if (truck.state === 'loading') {
        pos = route.path[0];
        dir = route.path.length > 1
          ? new Vector2(route.path[1].x - route.path[0].x, route.path[1].y - route.path[0].y)
          : new Vector2(1, 0);
      } else if (truck.state === 'unloading') {
        const last = route.path[route.path.length - 1];
        const prev = route.path[Math.max(0, route.path.length - 2)];
        pos = last;
        dir = new Vector2(last.x - prev.x, last.y - prev.y);
        if (dir.x === 0 && dir.y === 0) dir = new Vector2(1, 0);
      } else {
        continue;
      }

      // Sprite frames: 0=up, 1=down, 2=right, 3=left
      // Lane offsets: always on the right side of the road
      let dirIdx: number;
      let offsetX = 0;
      let offsetY = 0;

      if (Math.abs(dir.x) >= Math.abs(dir.y)) {
        if (dir.x >= 0) {
          dirIdx = 2; // right
          offsetY = 12;   // right lane
        } else {
          dirIdx = 3; // left
          offsetY = -12;
        }
      } else {
        if (dir.y >= 0) {
          dirIdx = 1; // down
          offsetX = -16;
        } else {
          dirIdx = 0; // up
          offsetX = 16;
        }
      }

      const px = pos.x * CS + CS / 2 + offsetX;
      const py = pos.y * CS + CS / 2 + offsetY;

      const frames = TextureCache.getTruckFrames(truck.spriteKey, truck.colorVariant);
      if (frames && frames[dirIdx]) {
        const sprite = new Sprite(frames[dirIdx]);
        sprite.anchor.set(0.5);
        sprite.position.set(px, py);
        sprite.roundPixels = true;
        sprite.scale.set(CS / 16);
        sprite.zIndex = py; // Y-sort: trucks lower on screen render on top
        this.vehicleLayer.addChild(sprite);
      } else {
        // Fallback: simple colored rectangle
        const g = new Graphics();
        g.roundRect(px - 10, py - 6, 20, 12, 3);
        g.fill(COLORS.ACCENT_YELLOW);
        g.zIndex = py;
        this.vehicleLayer.addChild(g);
      }
    }
  }

  // --- Paint Preview ---

  setPaintPreview(cells: Vector2[], color: number): void {
    this.paintCells = cells;
    this.paintColor = color;
  }

  clearPaintPreview(): void {
    this.paintCells = [];
    this.paintPreviewLayer.removeChildren().forEach(c => c.destroy({ children: true }));
  }

  private renderPaintPreview(): void {
    this.paintPreviewLayer.removeChildren().forEach(c => c.destroy({ children: true }));
    if (this.paintCells.length === 0) return;

    const cellSet = new Set(this.paintCells.map(c => c.toKey()));

    // Filled cells with slight transparency
    const body = new Graphics();
    for (const cell of this.paintCells) {
      body.roundRect(cell.x * CS + 1, cell.y * CS + 1, CS - 2, CS - 2, 4);
    }
    // Fill connectors between adjacent cells
    for (const cell of this.paintCells) {
      const rk = new Vector2(cell.x + 1, cell.y).toKey();
      if (cellSet.has(rk)) body.rect(cell.x * CS + CS - 4, cell.y * CS + 1, 8, CS - 2);
      const dk = new Vector2(cell.x, cell.y + 1).toKey();
      if (cellSet.has(dk)) body.rect(cell.x * CS + 1, cell.y * CS + CS - 4, CS - 2, 8);
    }
    body.fill({ color: this.paintColor, alpha: 0.6 });
    this.paintPreviewLayer.addChild(body);

    // Pulsing outline
    const outline = new Graphics();
    for (const cell of this.paintCells) {
      const cx = cell.x * CS;
      const cy = cell.y * CS;
      const hasUp = cellSet.has(new Vector2(cell.x, cell.y - 1).toKey());
      const hasDown = cellSet.has(new Vector2(cell.x, cell.y + 1).toKey());
      const hasLeft = cellSet.has(new Vector2(cell.x - 1, cell.y).toKey());
      const hasRight = cellSet.has(new Vector2(cell.x + 1, cell.y).toKey());
      if (!hasUp) { outline.moveTo(cx, cy); outline.lineTo(cx + CS, cy); }
      if (!hasDown) { outline.moveTo(cx, cy + CS); outline.lineTo(cx + CS, cy + CS); }
      if (!hasLeft) { outline.moveTo(cx, cy); outline.lineTo(cx, cy + CS); }
      if (!hasRight) { outline.moveTo(cx + CS, cy); outline.lineTo(cx + CS, cy + CS); }
    }
    outline.stroke({ color: 0xffffff, alpha: 0.8, width: 2 });
    this.paintPreviewLayer.addChild(outline);
  }

  // --- Alert & Name Overlay ---

  private renderOverlayIcons(allSlots: CitySlot[]): void {
    this.uiOverlay.removeChildren().forEach(c => c.destroy({ children: true }));
    this._labelContainers.clear();
    this._hoveredSlotKey = null;

    // Build per-type index for numbering (Factory 1, Factory 2, etc.)
    const typeCounters = new Map<string, number>();

    for (const slot of allSlots) {
      const key = slot.slotKey;
      const r = slot.getRenderRect();
      const oy = r.y;
      const cx = r.x + r.w / 2;

      // Determine label text
      let labelText: string | null = null;
      if (slot.purchased) {
        labelText = this.buildingNames.get(key) ?? slot.shopConfig?.name ?? null;
      } else {
        const idx = (typeCounters.get(slot.slotType) ?? 0) + 1;
        typeCounters.set(slot.slotType, idx);
        const typeName = slot.slotType === 'factory' ? 'Factory' : slot.slotType === 'storage' ? 'Storage' : 'Shop';
        labelText = `${typeName} ${idx} – ${formatMoney(slot.cost)}`;
      }

      if (labelText) {
        const slotColor = slot.slotType === 'factory' ? COLORS.FACTORY
          : slot.slotType === 'shop' ? COLORS.SHOP
          : COLORS.STORAGE;

        const label = new Text({
          text: labelText,
          style: new TextStyle({
            fontFamily: FONT_UI,
            fontSize: 10,
            fontWeight: '600',
            fill: slotColor,
          }),
          resolution: textResolution(),
        });
        label.anchor.set(0.5, 1);
        label.position.set(cx, oy - 6);

        // Small bg behind the label, tinted to slot color
        const labelBg = new Graphics();
        const lw = label.width + 8;
        const lh = label.height + 4;
        const lbx = cx - lw / 2;
        const lby = oy - 6 - lh + 2;
        labelBg.roundRect(lbx, lby, lw, lh, 3);
        labelBg.fill({ color: this.darken(slotColor, 0.7), alpha: 0.9 });

        const labelGroup = new Container();
        labelGroup.addChild(labelBg);
        labelGroup.addChild(label);
        this.uiOverlay.addChild(labelGroup);

        // Store ref for hover scale effect (cx/cy = visual center of the label)
        const centerX = cx;
        const centerY = lby + lh / 2;
        this._labelContainers.set(key, { container: labelGroup, cx: centerX, cy: centerY });
      }

      // Alert badge (purchased only)
      if (!slot.purchased) continue;
      const alert = this.alertData.get(slot.slotKey);
      if (alert) {
        const badgeY = labelText ? oy - 22 : oy - 4;
        const badge = new Graphics();
        badge.circle(cx, badgeY, 10);
        badge.fill({ color: COLORS.ACCENT_RED, alpha: 0.9 });
        badge.stroke({ color: 0xffffff, width: 1.5, alpha: 0.6 });
        this.uiOverlay.addChild(badge);

        const icon = new Text({
          text: '!',
          style: new TextStyle({
            fontFamily: FONT_MONO,
            fontSize: 12,
            fontWeight: '700',
            fill: 0xffffff,
          }),
          resolution: textResolution(),
        });
        icon.anchor.set(0.5);
        icon.position.set(cx, badgeY);
        this.uiOverlay.addChild(icon);
      }
    }
  }

  /** Spawn a floating price label above a building slot */
  spawnFloatingText(slotKey: string, amount: number, color: number, allSlots: CitySlot[]): void {
    const slot = allSlots.find(s => s.slotKey === slotKey || s.position.toKey() === slotKey);
    if (!slot) return;
    const r = slot.getRenderRect();
    this.floatingText.spawn(r.x + r.w / 2, r.y - 8, amount, color);
  }

  updateFloatingText(deltaMs: number): void {
    this.floatingText.update(deltaMs);
  }

  destroy(): void {
    this.floatingText.destroy();
    this.container.destroy({ children: true });
  }
}
