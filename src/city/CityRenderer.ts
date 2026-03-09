import { Container, Graphics, Sprite, Text, Texture, TextStyle } from 'pixi.js';
import { COLORS, CELL_SIZE_PX, SHADOW_ALPHA } from '@/utils/Constants';
import { TextureCache } from '@/rendering/TextureCache';
import { getRoadSpriteInfo, getBuildingTileIndices } from '@/rendering/TileResolver';
import { formatNumber } from '@/utils/formatNumber';
import type { CityLayout } from './CityGenerator';
import type { CitySlot } from './CitySlot';
import type { CityNode } from './CityNode';
import type { TransportRoute } from '@/transport/TransportRoute';
import type { PolyominoRegistry } from '@/simulation/PolyominoRegistry';
import type { Polyomino } from '@/simulation/Polyomino';
import { Vector2 } from '@/utils/Vector2';

const CS = CELL_SIZE_PX;

export class CityRenderer {
  readonly container: Container;
  private roadLayer: Container;
  private buildingLayer: Container;
  private decorLayer: Container;
  private vehicleLayer: Container;
  private uiOverlay: Container;
  private polyRegistry: PolyominoRegistry;
  private bgColor: number;
  private dirty = true;
  private paintPreviewLayer: Container;
  private paintCells: Vector2[] = [];
  private paintColor: number = 0;

  constructor(polyRegistry: PolyominoRegistry, bgColor: number = COLORS.BG_PRIMARY) {
    this.polyRegistry = polyRegistry;
    this.bgColor = bgColor;

    this.container = new Container();
    this.container.sortableChildren = true;

    this.roadLayer = new Container();
    this.roadLayer.zIndex = 0;
    this.buildingLayer = new Container();
    this.buildingLayer.zIndex = 1;
    this.decorLayer = new Container();
    this.decorLayer.zIndex = 2;
    this.vehicleLayer = new Container();
    this.vehicleLayer.zIndex = 4;
    this.paintPreviewLayer = new Container();
    this.paintPreviewLayer.zIndex = 3;
    this.uiOverlay = new Container();
    this.uiOverlay.zIndex = 5;

    this.container.addChild(this.roadLayer, this.buildingLayer, this.decorLayer, this.paintPreviewLayer, this.vehicleLayer, this.uiOverlay);
  }

  markDirty(): void {
    this.dirty = true;
  }

  render(layout: CityLayout, factorySlots: CitySlot[], shopSlots: CitySlot[], storageSlots: CitySlot[], routes: readonly TransportRoute[]): void {
    if (!this.dirty) {
      this.renderVehicles(routes);
      return;
    }

    this.dirty = false;
    this.roadLayer.removeChildren();
    this.buildingLayer.removeChildren();
    this.decorLayer.removeChildren();

    this.renderBackground(layout);
    this.renderRoads(layout);
    this.renderDecorations(layout.decorations);
    this.renderSlots(factorySlots, COLORS.FACTORY, false, 'factory');
    this.renderSlots(shopSlots, COLORS.SHOP, true, 'shop');
    this.renderSlots(storageSlots, COLORS.STORAGE, false, 'storage');
    this.renderRouteLines(routes);
    this.renderPaintPreview();
    this.renderVehicles(routes);
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
    const scale = CS / 32;

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

  private renderSlots(slots: CitySlot[], color: number, alwaysBuilt: boolean, buildingType: string): void {
    for (const slot of slots) {
      const poly = slot.polyomino;

      const ox = slot.position.x * CS;
      const oy = slot.position.y * CS;

      if (slot.purchased || alwaysBuilt) {
        this.drawBuilding(poly, ox, oy, color, this.buildingLayer, buildingType);
      } else {
        this.drawLockedSlot(poly, ox, oy, slot.cost, slot.slotType, color);
      }
    }
  }

  private drawPolyShape(g: Graphics, poly: Polyomino, ox: number, oy: number): void {
    for (const cell of poly.cells) {
      g.roundRect(ox + cell.x * CS, oy + cell.y * CS, CS, CS, 6);
    }
    for (const cell of poly.cells) {
      if (poly.hasCellAt(cell.x + 1, cell.y))
        g.rect(ox + cell.x * CS + CS - 6, oy + cell.y * CS, 12, CS);
      if (poly.hasCellAt(cell.x, cell.y + 1))
        g.rect(ox + cell.x * CS, oy + cell.y * CS + CS - 6, CS, 12);
      if (poly.hasCellAt(cell.x + 1, cell.y) && poly.hasCellAt(cell.x, cell.y + 1) && poly.hasCellAt(cell.x + 1, cell.y + 1))
        g.rect(ox + cell.x * CS + CS - 6, oy + cell.y * CS + CS - 6, 12, 12);
    }
  }

  private darken(color: number, amount: number): number {
    const r = ((color >> 16) & 0xff) * (1 - amount);
    const g = ((color >> 8) & 0xff) * (1 - amount);
    const b = (color & 0xff) * (1 - amount);
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
  }

  private drawBuilding(poly: Polyomino, ox: number, oy: number, color: number, layer: Container, buildingType: string = ''): void {
    const frames = TextureCache.getBuildingFrames(buildingType);

    if (frames && frames.length >= 30) {
      this.drawBuildingSprites(poly, ox, oy, layer, frames);
      return;
    }

    // Fallback: procedural rendering
    const darkColor = this.darken(color, 0.25);
    const sd = 3;
    const bandH = Math.round(CS * 0.35);
    const r = 6;

    const shadowFill = new Graphics();
    for (const cell of poly.cells) {
      shadowFill.rect(ox + sd + cell.x * CS, oy + sd + cell.y * CS, CS, CS);
    }
    shadowFill.fill(0x000000);

    const shadowMask = new Graphics();
    this.drawPolyShape(shadowMask, poly, ox + sd, oy + sd);
    shadowMask.fill(0xffffff);
    layer.addChild(shadowMask);
    shadowFill.mask = shadowMask;
    shadowFill.alpha = 0.3;
    layer.addChild(shadowFill);

    const body = new Graphics();
    this.drawPolyShape(body, poly, ox, oy);
    body.fill(color);
    layer.addChild(body);

    const band = new Graphics();
    for (const cell of poly.cells) {
      if (poly.hasCellAt(cell.x, cell.y + 1)) continue;
      const cx = ox + cell.x * CS;
      const cy = oy + cell.y * CS;
      band.rect(cx, cy + CS - bandH, CS, bandH);
    }
    for (const cell of poly.cells) {
      if (poly.hasCellAt(cell.x, cell.y + 1)) continue;
      if (poly.hasCellAt(cell.x + 1, cell.y) && !poly.hasCellAt(cell.x + 1, cell.y + 1)) {
        band.rect(ox + cell.x * CS + CS - r, oy + cell.y * CS + CS - bandH, r * 2, bandH);
      }
    }
    band.fill(darkColor);

    const maskGfx = new Graphics();
    this.drawPolyShape(maskGfx, poly, ox, oy);
    maskGfx.fill(0xffffff);
    layer.addChild(maskGfx);
    band.mask = maskGfx;
    layer.addChild(band);
  }

  private drawBuildingSprites(poly: Polyomino, ox: number, oy: number, layer: Container, frames: Texture[]): void {
    const scale = CS / 32;

    for (const cell of poly.cells) {
      const up = poly.hasCellAt(cell.x, cell.y - 1);
      const down = poly.hasCellAt(cell.x, cell.y + 1);
      const left = poly.hasCellAt(cell.x - 1, cell.y);
      const right = poly.hasCellAt(cell.x + 1, cell.y);
      const diagTL = poly.hasCellAt(cell.x - 1, cell.y - 1);
      const diagTR = poly.hasCellAt(cell.x + 1, cell.y - 1);
      const diagBL = poly.hasCellAt(cell.x - 1, cell.y + 1);
      const diagBR = poly.hasCellAt(cell.x + 1, cell.y + 1);

      const tileIndices = getBuildingTileIndices(
        up, down, left, right, diagTL, diagTR, diagBL, diagBR,
      );

      const px = ox + cell.x * CS;
      const py = oy + cell.y * CS;

      for (const idx of tileIndices) {
        const sprite = new Sprite(frames[idx]);
        sprite.position.set(px, py);
        sprite.roundPixels = true;
        sprite.scale.set(scale);
        layer.addChild(sprite);
      }
    }
  }

  private drawLockedSlot(poly: Polyomino, ox: number, oy: number, cost: number, _slotType: string, color: number): void {
    // Tinted fill — use flat rects (no rounded corners) masked by poly shape
    const fillRects = new Graphics();
    for (const cell of poly.cells) {
      fillRects.rect(ox + cell.x * CS, oy + cell.y * CS, CS, CS);
    }
    fillRects.fill(color);
    fillRects.alpha = 0.12;
    const fillMask = new Graphics();
    this.drawPolyShape(fillMask, poly, ox, oy);
    fillMask.fill(0xffffff);
    this.buildingLayer.addChild(fillMask);
    fillRects.mask = fillMask;
    this.buildingLayer.addChild(fillRects);

    // Perimeter outline only (no internal cell borders)
    const outline = new Graphics();
    for (const cell of poly.cells) {
      const cx = ox + cell.x * CS;
      const cy = oy + cell.y * CS;
      if (!poly.hasCellAt(cell.x, cell.y - 1)) { outline.moveTo(cx, cy); outline.lineTo(cx + CS, cy); }
      if (!poly.hasCellAt(cell.x + 1, cell.y)) { outline.moveTo(cx + CS, cy); outline.lineTo(cx + CS, cy + CS); }
      if (!poly.hasCellAt(cell.x, cell.y + 1)) { outline.moveTo(cx, cy + CS); outline.lineTo(cx + CS, cy + CS); }
      if (!poly.hasCellAt(cell.x - 1, cell.y)) { outline.moveTo(cx, cy); outline.lineTo(cx, cy + CS); }
    }
    outline.stroke({ color, alpha: 0.35, width: 1.5 });
    this.buildingLayer.addChild(outline);

    const centerX = ox + (poly.boundingBox.width * CS) / 2;
    const centerY = oy + (poly.boundingBox.height * CS) / 2;

    // Type label
    const typeLabel = new Text({
      text: _slotType === 'factory' ? 'Factory' : 'Storage',
      style: new TextStyle({ fontFamily: 'Space Mono, monospace', fontSize: 8, fontWeight: '600', fill: color }),
      resolution: 4,
    });
    typeLabel.anchor.set(0.5);
    typeLabel.position.set(centerX, centerY - 8);
    this.buildingLayer.addChild(typeLabel);

    // Cost label
    const label = new Text({
      text: formatNumber(cost),
      style: new TextStyle({ fontFamily: 'Space Mono, monospace', fontSize: 9, fontWeight: '600', fill: COLORS.ACCENT_YELLOW }),
      resolution: 4,
    });
    label.anchor.set(0.5);
    label.position.set(centerX, centerY + 5);
    this.buildingLayer.addChild(label);
  }

  // --- Decorations ---

  private renderDecorations(decorations: CityNode[]): void {
    for (const node of decorations) {
      if (node.buildingType === 'decoration') {
        this.renderTree(node);
      } else if (node.buildingType === 'house') {
        this.renderHouse(node);
      }
    }
  }

  private renderTree(node: CityNode): void {
    const px = node.position.x * CS + CS / 2;
    const py = node.position.y * CS + CS / 2;
    const r = CS * 0.2;

    const shadow = new Graphics();
    shadow.circle(px + 1.5, py + 1.5, r);
    shadow.fill({ color: 0x000000, alpha: 0.15 });
    this.decorLayer.addChild(shadow);

    const tree = new Graphics();
    tree.circle(px, py, r);
    tree.fill({ color: node.color, alpha: 0.45 });
    this.decorLayer.addChild(tree);
  }

  private renderHouse(node: CityNode): void {
    this.drawBuilding(node.polyomino, node.position.x * CS, node.position.y * CS, node.color, this.decorLayer, 'house');
  }

  // --- Transport ---

  private renderRouteLines(routes: readonly TransportRoute[]): void {
    if (routes.length === 0) return;
    const line = new Graphics();
    for (const route of routes) {
      if (route.path.length < 2) continue;
      line.moveTo(route.path[0].x * CS + CS / 2, route.path[0].y * CS + CS / 2);
      for (let i = 1; i < route.path.length; i++) {
        line.lineTo(route.path[i].x * CS + CS / 2, route.path[i].y * CS + CS / 2);
      }
      line.stroke({ color: route.vehicle?.type.color ?? COLORS.TEXT_DIM, alpha: 0.3, width: 2 });
    }
    this.buildingLayer.addChild(line);
  }

  private renderVehicles(routes: readonly TransportRoute[]): void {
    this.vehicleLayer.removeChildren();
    for (const route of routes) {
      if (!route.vehicle) continue;
      const pos = route.getVehiclePosition();
      if (!pos) continue;

      const px = pos.x * CS + CS / 2;
      const py = pos.y * CS + CS / 2;
      const vSize = CS * 0.45;
      const color = route.vehicle.type.color;

      const shadow = new Graphics();
      shadow.roundRect(px - vSize / 2 + 1.5, py - vSize * 0.3 + 1.5, vSize, vSize * 0.6, 4);
      shadow.fill({ color: 0x000000, alpha: SHADOW_ALPHA });
      this.vehicleLayer.addChild(shadow);

      const body = new Graphics();
      body.roundRect(px - vSize / 2, py - vSize * 0.3, vSize, vSize * 0.6, 4);
      body.fill(color);
      this.vehicleLayer.addChild(body);

      const ws = new Graphics();
      ws.roundRect(px - vSize / 2 + 2, py - vSize * 0.3 + 2, vSize * 0.3, vSize * 0.6 - 4, 2);
      ws.fill({ color: 0xffffff, alpha: 0.3 });
      this.vehicleLayer.addChild(ws);
    }
  }

  // --- Paint Preview ---

  setPaintPreview(cells: Vector2[], color: number): void {
    this.paintCells = cells;
    this.paintColor = color;
  }

  clearPaintPreview(): void {
    this.paintCells = [];
    this.paintPreviewLayer.removeChildren();
  }

  private renderPaintPreview(): void {
    this.paintPreviewLayer.removeChildren();
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

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
