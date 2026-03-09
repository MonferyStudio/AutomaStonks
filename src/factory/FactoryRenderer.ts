import { Container, Graphics, Sprite, Text, TextStyle } from 'pixi.js';
import { TextureCache } from '@/rendering/TextureCache';
import { getRoadSpriteInfo } from '@/rendering/TileResolver';
import { createTunnelGraphic, createSeamlessBeltGraphic, createSplitterGraphic } from '@/rendering/EntityGraphicsFactory';
import type { Factory } from '@/simulation/Factory';
import { SpriteFactory } from '@/rendering/SpriteFactory';
import { PolyominoRenderer } from '@/rendering/PolyominoRenderer';
import { ObjectPool } from '@/core/ObjectPool';
import { CELL_SIZE_PX, COLORS } from '@/utils/Constants';
import type { ResourceRegistry } from '@/simulation/Resource';
import type { TickEngine } from '@/core/TickEngine';
import { Direction, directionToVector } from '@/utils/Direction';

const LABEL_STYLE = new TextStyle({
  fontFamily: 'Space Mono, monospace',
  fontSize: 10,
  fontWeight: '600',
  fill: 0xe8e8e8,
  align: 'center',
});


export class FactoryRenderer {
  readonly container: Container;
  private borderLayer: Container;
  private gridLayer: Container;
  private entityLayer: Container;
  private itemLayer: Container;
  private uiLayer: Container;

  private factory: Factory;
  private spriteFactory: SpriteFactory;
  private polyRenderer: PolyominoRenderer;
  private resourceRegistry: ResourceRegistry;
  private tickEngine: TickEngine;

  private itemSprites = new Map<number, Container>();
  private beltStraightSprites: Sprite[] = [];
  private beltCurveSprites: Sprite[] = [];
  private itemPool: ObjectPool<Container>;

  private gridDirty = true;
  private entityDirty = true;

  constructor(
    factory: Factory,
    spriteFactory: SpriteFactory,
    resourceRegistry: ResourceRegistry,
    tickEngine: TickEngine,
  ) {
    this.factory = factory;
    this.spriteFactory = spriteFactory;
    this.polyRenderer = new PolyominoRenderer();
    this.resourceRegistry = resourceRegistry;
    this.tickEngine = tickEngine;

    this.container = new Container();
    this.container.sortableChildren = true;

    this.borderLayer = new Container();
    this.borderLayer.zIndex = -1;
    this.gridLayer = new Container();
    this.gridLayer.zIndex = 0;
    this.entityLayer = new Container();
    this.entityLayer.zIndex = 1;
    this.itemLayer = new Container();
    this.itemLayer.zIndex = 2;
    this.uiLayer = new Container();
    this.uiLayer.zIndex = 3;

    this.container.addChild(this.borderLayer, this.gridLayer, this.entityLayer, this.itemLayer, this.uiLayer);

    this.itemPool = new ObjectPool<Container>(
      () => new Container(),
      (c) => { c.removeChildren(); c.visible = false; },
      50,
    );
  }

  markGridDirty(): void {
    this.gridDirty = true;
  }

  markEntityDirty(): void {
    this.entityDirty = true;
  }

  render(deltaMs: number = 0): void {
    if (this.gridDirty) {
      this.renderBorder();
      this.renderGrid();
      this.gridDirty = false;
    }

    if (this.entityDirty) {
      this.renderEntities();
      this.entityDirty = false;
    }

    // Animate belt sprites
    const prevFrame = TextureCache.beltAnimFrame;
    TextureCache.updateBeltAnimation(deltaMs);
    if (TextureCache.beltAnimFrame !== prevFrame) {
      if (TextureCache.beltStraightFrames.length > 0) {
        const newStraight = TextureCache.beltStraightFrames[TextureCache.beltAnimFrame];
        for (const sprite of this.beltStraightSprites) {
          sprite.texture = newStraight;
        }
      }
      if (TextureCache.beltCurveFrames.length > 0) {
        const newCurve = TextureCache.beltCurveFrames[TextureCache.beltAnimFrame];
        for (const sprite of this.beltCurveSprites) {
          sprite.texture = newCurve;
        }
      }
    }

    this.renderItems();
  }

  private renderBorder(): void {
    this.borderLayer.removeChildren();

    const ctx = this.factory.borderContext;
    if (!ctx || ctx.edges.length === 0) return;

    const cellSize = CELL_SIZE_PX;
    const scale = cellSize / 32;

    // Build set of road cell positions for neighbor lookup
    const roadPositions = new Set<string>();
    const cellPositions = new Map<string, { bx: number; by: number }>();
    for (const edge of ctx.edges) {
      const dir = directionToVector(edge.direction);
      const cx = edge.factoryCell.x + dir.x;
      const cy = edge.factoryCell.y + dir.y;
      const key = `${cx},${cy}`;
      cellPositions.set(key, { bx: cx * cellSize, by: cy * cellSize });
      if (edge.type === 'road') roadPositions.add(key);
    }

    for (const edge of ctx.edges) {
      const dir = directionToVector(edge.direction);
      const cx = edge.factoryCell.x + dir.x;
      const cy = edge.factoryCell.y + dir.y;
      const key = `${cx},${cy}`;
      const { bx, by } = cellPositions.get(key)!;

      if (edge.type === 'road') {
        const up = roadPositions.has(`${cx},${cy - 1}`);
        const down = roadPositions.has(`${cx},${cy + 1}`);
        const left = roadPositions.has(`${cx - 1},${cy}`);
        const right = roadPositions.has(`${cx + 1},${cy}`);

        const { tex, rotation } = getRoadSpriteInfo(up, down, left, right);
        if (tex) {
          const sprite = new Sprite(tex);
          sprite.anchor.set(0.5);
          sprite.position.set(bx + cellSize / 2, by + cellSize / 2);
          sprite.roundPixels = true;
          sprite.scale.set(scale);
          sprite.rotation = rotation;
          this.borderLayer.addChild(sprite);
        }
      } else if (TextureCache.wallCellTex) {
        const sprite = new Sprite(TextureCache.wallCellTex);
        sprite.position.set(bx, by);
        sprite.roundPixels = true;
        sprite.scale.set(scale);
        this.borderLayer.addChild(sprite);
      }
    }
  }

  private renderGrid(): void {
    this.gridLayer.removeChildren();

    const grid = this.factory.grid;
    const shape = grid.shape;
    const cellSize = CELL_SIZE_PX;

    if (TextureCache.bgCellTex) {
      const scale = cellSize / 32;
      for (const cell of shape.cells) {
        for (let dy = 0; dy < grid.cellSize; dy++) {
          for (let dx = 0; dx < grid.cellSize; dx++) {
            const px = (cell.x * grid.cellSize + dx) * cellSize;
            const py = (cell.y * grid.cellSize + dy) * cellSize;
            const sprite = new Sprite(TextureCache.bgCellTex);
            sprite.position.set(px, py);
            sprite.roundPixels = true;
            sprite.scale.set(scale);
            this.gridLayer.addChild(sprite);
          }
        }
      }
    } else {
      const bg = new Graphics();
      for (const cell of shape.cells) {
        for (let dy = 0; dy < grid.cellSize; dy++) {
          for (let dx = 0; dx < grid.cellSize; dx++) {
            const px = (cell.x * grid.cellSize + dx) * cellSize;
            const py = (cell.y * grid.cellSize + dy) * cellSize;
            bg.rect(px, py, cellSize, cellSize);
          }
        }
      }
      bg.fill(COLORS.GRID_BG);
      this.gridLayer.addChild(bg);
    }
  }

  private renderEntities(): void {
    this.entityLayer.removeChildren();
    this.beltStraightSprites = [];
    this.beltCurveSprites = [];

    const half = CELL_SIZE_PX / 2;

    // Render belts with seamless connections
    for (const belt of this.factory.getBelts()) {
      const result = createSeamlessBeltGraphic(belt);
      result.container.position.set(
        belt.position.x * CELL_SIZE_PX,
        belt.position.y * CELL_SIZE_PX,
      );
      this.entityLayer.addChild(result.container);
      if (result.sprite) {
        if (result.type === 'straight') this.beltStraightSprites.push(result.sprite);
        else this.beltCurveSprites.push(result.sprite);
      }
    }

    for (const machine of this.factory.getMachines()) {
      const sprite = this.spriteFactory.createMachineGraphic(
        machine.definition.name,
        machine.definition.color,
        machine.definition.width,
        machine.definition.height,
      );
      sprite.position.set(
        machine.position.x * CELL_SIZE_PX,
        machine.position.y * CELL_SIZE_PX,
      );

      const label = new Text({
        text: machine.definition.operationType.toUpperCase(),
        style: LABEL_STYLE,
        resolution: 4,
      });
      label.anchor.set(0.5);
      label.position.set(
        machine.definition.width * CELL_SIZE_PX / 2,
        machine.definition.height * CELL_SIZE_PX / 2,
      );
      sprite.addChild(label);

      this.entityLayer.addChild(sprite);
    }

    // Sprite base orientation: pointing UP. Rotate to face toward road.
    const ioRotMap: Record<Direction, number> = {
      [Direction.Up]: 0,                // Road above → no rotation
      [Direction.Right]: Math.PI / 2,   // Road right → 90°
      [Direction.Down]: Math.PI,        // Road below → 180°
      [Direction.Left]: -Math.PI / 2,   // Road left → -90°
    };
    for (const port of this.factory.getIOPorts()) {
      const tex = port.portType === 'input'
        ? TextureCache.beltEntryTex
        : TextureCache.beltExitTex;
      if (tex) {
        const s = new Sprite(tex);
        s.anchor.set(0.5);
        s.scale.set(2);
        s.roundPixels = true;
        s.rotation = ioRotMap[port.direction];
        s.position.set(
          port.position.x * CELL_SIZE_PX + half,
          port.position.y * CELL_SIZE_PX + half,
        );
        this.entityLayer.addChild(s);
      } else {
        // Fallback to programmatic rendering
        const sprite = this.spriteFactory.createIOPortGraphic(port.portType, port.direction);
        sprite.position.set(
          port.position.x * CELL_SIZE_PX + half,
          port.position.y * CELL_SIZE_PX + half,
        );
        this.entityLayer.addChild(sprite);
      }

      // Draw resource indicator on input ports
      if (port.portType === 'input') {
        const indicator = new Container();
        indicator.position.set(
          port.position.x * CELL_SIZE_PX + half,
          port.position.y * CELL_SIZE_PX + half,
        );

        if (port.resourceFilter) {
          const def = this.resourceRegistry.get(port.resourceFilter);
          if (def) {
            // Resource color dot with outline
            const dot = new Graphics();
            dot.circle(0, -12, 6);
            dot.fill(def.color);
            dot.circle(0, -12, 6);
            dot.stroke({ color: 0xffffff, width: 1.5, alpha: 0.8 });
            indicator.addChild(dot);
          }
        } else {
          // Red cross for unconfigured entry
          const cross = new Graphics();
          const s = 4;
          cross.moveTo(-s, -12 - s);
          cross.lineTo(s, -12 + s);
          cross.moveTo(s, -12 - s);
          cross.lineTo(-s, -12 + s);
          cross.stroke({ color: COLORS.ACCENT_RED, width: 2, alpha: 0.8 });
          indicator.addChild(cross);

          // Small bg circle behind cross
          const bg = new Graphics();
          bg.circle(0, -12, 7);
          bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.8 });
          indicator.addChildAt(bg, 0);
        }

        this.entityLayer.addChild(indicator);
      }
    }

    // Render tunnels
    for (const entry of this.factory.getTunnelEntries()) {
      const sprite = createTunnelGraphic(entry.direction, true);
      sprite.position.set(entry.position.x * CELL_SIZE_PX, entry.position.y * CELL_SIZE_PX);
      this.entityLayer.addChild(sprite);
    }
    for (const exit of this.factory.getTunnelExits()) {
      const sprite = createTunnelGraphic(exit.direction, false);
      sprite.position.set(exit.position.x * CELL_SIZE_PX, exit.position.y * CELL_SIZE_PX);
      this.entityLayer.addChild(sprite);
    }

    // Render splitters
    for (const splitter of this.factory.getSplitters()) {
      const sprite = createSplitterGraphic(splitter);
      sprite.position.set(splitter.position.x * CELL_SIZE_PX, splitter.position.y * CELL_SIZE_PX);
      this.entityLayer.addChild(sprite);
    }
  }

  private renderItems(): void {
    const alpha = this.tickEngine.interpolationAlpha;
    const activeItems = new Set<number>();

    for (const belt of this.factory.getBelts()) {
      if (!belt.item) continue;

      activeItems.add(belt.item.uid);
      let sprite = this.itemSprites.get(belt.item.uid);

      if (!sprite) {
        const resDef = this.resourceRegistry.get(belt.item.resourceId);
        if (!resDef) continue;
        sprite = this.spriteFactory.createItemGraphic(resDef);
        this.itemLayer.addChild(sprite);
        this.itemSprites.set(belt.item.uid, sprite);
      }

      sprite.visible = true;
      const progress = Math.min(belt.progress + alpha * belt.speed, 10) / 10;

      const startX = belt.inputPosition.x * CELL_SIZE_PX + CELL_SIZE_PX / 2;
      const startY = belt.inputPosition.y * CELL_SIZE_PX + CELL_SIZE_PX / 2;
      const endX = belt.position.x * CELL_SIZE_PX + CELL_SIZE_PX / 2;
      const endY = belt.position.y * CELL_SIZE_PX + CELL_SIZE_PX / 2;

      sprite.position.set(
        startX + (endX - startX) * progress,
        startY + (endY - startY) * progress,
      );
    }

    for (const [uid, sprite] of this.itemSprites) {
      if (!activeItems.has(uid)) {
        sprite.visible = false;
        this.itemSprites.delete(uid);
        sprite.destroy();
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.itemSprites.clear();
  }
}
