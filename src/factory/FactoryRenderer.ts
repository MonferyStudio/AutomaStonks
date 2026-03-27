import { Container, Graphics, Sprite, Text, TextStyle } from 'pixi.js';
import { TextureCache } from '@/rendering/TextureCache';
import { getRoadSpriteInfo } from '@/rendering/TileResolver';
import { createTunnelGraphic, createSeamlessBeltGraphic, createExchangerGraphic } from '@/rendering/EntityGraphicsFactory';
import type { Factory } from '@/simulation/Factory';
import type { Machine } from '@/simulation/Machine';
import { SpriteFactory } from '@/rendering/SpriteFactory';
import { PolyominoRenderer } from '@/rendering/PolyominoRenderer';
import { ObjectPool } from '@/core/ObjectPool';
import { CELL_SIZE_PX, COLORS, FONT_MONO } from '@/utils/Constants';
import type { ResourceRegistry } from '@/simulation/Resource';
import type { RecipeRegistry } from '@/simulation/RecipeRegistry';
import type { TickEngine } from '@/core/TickEngine';
import { Direction, directionToVector } from '@/utils/Direction';
import { textResolution } from '@/utils/platform';

const LABEL_STYLE = new TextStyle({
  fontFamily: FONT_MONO,
  fontSize: 10,
  fontWeight: '600',
  fill: 0xe8e8e8,
  align: 'center',
});


export class FactoryRenderer {
  readonly container: Container;
  private borderLayer: Container;
  private gridLayer: Container;
  private beltLayer: Container;
  private entityLayer: Container;
  private itemLayer: Container;
  private uiLayer: Container;

  private factory: Factory;
  private spriteFactory: SpriteFactory;
  private polyRenderer: PolyominoRenderer;
  private resourceRegistry: ResourceRegistry;
  private recipeRegistry: RecipeRegistry | null = null;
  private tickEngine: TickEngine;

  private itemSprites = new Map<number, Container>();
  private beltStraightSprites: Sprite[] = [];
  private beltCurveSprites: Sprite[] = [];
  private exchangerSprites: Sprite[] = [];
  private beltEntrySprites: Sprite[] = [];
  private beltExitSprites: Sprite[] = [];
  private itemPool: ObjectPool<Container>;

  private gridDirty = true;
  private entityDirty = true;

  // Reusable set to avoid per-frame allocations
  private readonly _activeItems = new Set<number>();

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
    this.beltLayer = new Container();
    this.beltLayer.zIndex = 1;
    this.itemLayer = new Container();
    this.itemLayer.zIndex = 2;
    this.entityLayer = new Container();
    this.entityLayer.zIndex = 3;
    this.uiLayer = new Container();
    this.uiLayer.zIndex = 4;

    this.container.addChild(this.borderLayer, this.gridLayer, this.beltLayer, this.itemLayer, this.entityLayer, this.uiLayer);

    this.itemPool = new ObjectPool<Container>(
      () => new Container(),
      (c) => { c.removeChildren().forEach(c => c.destroy({ children: true })); c.visible = false; },
      50,
    );
  }

  setRecipeRegistry(registry: RecipeRegistry): void {
    this.recipeRegistry = registry;
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
      if (TextureCache.beltEntryFrames.length > 0) {
        const newEntry = TextureCache.beltEntryFrames[TextureCache.beltAnimFrame];
        for (const sprite of this.beltEntrySprites) {
          sprite.texture = newEntry;
        }
      }
      if (TextureCache.beltExitFrames.length > 0) {
        const newExit = TextureCache.beltExitFrames[TextureCache.beltAnimFrame];
        for (const sprite of this.beltExitSprites) {
          sprite.texture = newExit;
        }
      }
      if (TextureCache.exchangerFrames.length > 0) {
        const newExch = TextureCache.exchangerFrames[TextureCache.beltAnimFrame];
        for (const sprite of this.exchangerSprites) {
          sprite.texture = newExch;
        }
      }
    }

    this.renderItems();
  }

  private renderBorder(): void {
    this.borderLayer.removeChildren().forEach(c => c.destroy({ children: true }));

    const ctx = this.factory.borderContext;
    if (!ctx || ctx.edges.length === 0) return;

    const cellSize = CELL_SIZE_PX;
    const scale = cellSize / 16;

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
    this.gridLayer.removeChildren().forEach(c => c.destroy({ children: true }));

    const grid = this.factory.grid;
    const shape = grid.shape;
    const cellSize = CELL_SIZE_PX;

    if (TextureCache.bgCellTex) {
      const scale = cellSize / 16;
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
    this.beltLayer.removeChildren().forEach(c => c.destroy({ children: true }));
    this.entityLayer.removeChildren().forEach(c => c.destroy({ children: true }));
    this.beltStraightSprites = [];
    this.beltCurveSprites = [];
    this.exchangerSprites = [];
    this.beltEntrySprites = [];
    this.beltExitSprites = [];

    const half = CELL_SIZE_PX / 2;

    // Render belts (below items)
    for (const belt of this.factory.getBelts()) {
      const result = createSeamlessBeltGraphic(belt);
      result.container.position.set(
        belt.position.x * CELL_SIZE_PX,
        belt.position.y * CELL_SIZE_PX,
      );
      this.beltLayer.addChild(result.container);
      if (result.sprite) {
        if (result.type === 'straight') this.beltStraightSprites.push(result.sprite);
        else this.beltCurveSprites.push(result.sprite);
      }
    }

    for (const machine of this.factory.getMachines()) {
      const eW = machine.effectiveWidth;
      const eH = machine.effectiveHeight;
      const tex = TextureCache.getMachineTexture(machine.definition.id);
      if (tex) {
        const s = new Sprite(tex);
        s.roundPixels = true;
        // Anchor at center for rotation
        s.anchor.set(0.5);
        // Set size to base definition (un-rotated), then rotate the sprite
        s.width = machine.definition.width * CELL_SIZE_PX;
        s.height = machine.definition.height * CELL_SIZE_PX;
        s.rotation = (machine.rotation * Math.PI) / 2;
        // Position at center of effective bounding box
        s.position.set(
          machine.position.x * CELL_SIZE_PX + (eW * CELL_SIZE_PX) / 2,
          machine.position.y * CELL_SIZE_PX + (eH * CELL_SIZE_PX) / 2,
        );
        this.entityLayer.addChild(s);
      } else {
        const sprite = this.spriteFactory.createMachineGraphic(
          machine.definition.name,
          machine.definition.color,
          eW,
          eH,
        );
        sprite.position.set(
          machine.position.x * CELL_SIZE_PX,
          machine.position.y * CELL_SIZE_PX,
        );

        const label = new Text({
          text: machine.definition.operationType.toUpperCase(),
          style: LABEL_STYLE,
          resolution: textResolution(),
        });
        label.anchor.set(0.5);
        label.position.set(
          eW * CELL_SIZE_PX / 2,
          eH * CELL_SIZE_PX / 2,
        );
        sprite.addChild(label);

        this.entityLayer.addChild(sprite);
      }

      // Assembler: show selected recipe output icon at center
      this.renderAssemblerIcon(machine);
    }

    // Sprite base orientation: pointing UP. Rotate to face toward road.
    const ioRotMap: Record<Direction, number> = {
      [Direction.Up]: 0,                // Road above → no rotation
      [Direction.Right]: Math.PI / 2,   // Road right → 90°
      [Direction.Down]: Math.PI,        // Road below → 180°
      [Direction.Left]: -Math.PI / 2,   // Road left → -90°
    };
    for (const port of this.factory.getIOPorts()) {
      const isInput = port.portType === 'input';
      const frames = isInput ? TextureCache.beltEntryFrames : TextureCache.beltExitFrames;
      const tex = frames[TextureCache.beltAnimFrame] ?? null;
      if (tex) {
        const s = new Sprite(tex);
        s.anchor.set(0.5);
        s.scale.set(4);
        s.roundPixels = true;
        s.rotation = ioRotMap[port.direction];
        s.position.set(
          port.position.x * CELL_SIZE_PX + half,
          port.position.y * CELL_SIZE_PX + half,
        );
        this.entityLayer.addChild(s);
        if (isInput) this.beltEntrySprites.push(s);
        else this.beltExitSprites.push(s);
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
            // Small badge with item sprite
            const badge = new Graphics();
            badge.roundRect(-10, -22, 20, 20, 4);
            badge.fill({ color: COLORS.BG_SURFACE, alpha: 0.9 });
            badge.stroke({ color: 0xffffff, width: 1, alpha: 0.5 });
            indicator.addChild(badge);

            const icon = SpriteFactory.createItemIcon(def, 14);
            icon.position.set(-7, -19);
            indicator.addChild(icon);
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

    // Render exchangers
    for (const exchanger of this.factory.getExchangers()) {
      if (TextureCache.exchangerFrames.length > 0) {
        const tex = TextureCache.exchangerFrames[TextureCache.beltAnimFrame];
        const s = new Sprite(tex);
        s.anchor.set(0.5);
        s.scale.set(CELL_SIZE_PX / 16);
        s.roundPixels = true;
        // Sprite base orientation: flow RIGHT, body vertical (16x32)
        // Rotation: Up=-90°, Right=0°, Down=90°, Left=180°
        const rotMap: Record<number, number> = {
          [Direction.Up]: -Math.PI / 2,
          [Direction.Right]: 0,
          [Direction.Down]: Math.PI / 2,
          [Direction.Left]: Math.PI,
        };
        s.rotation = rotMap[exchanger.direction] ?? 0;
        const offsets = exchanger.getCells();
        const abs0 = exchanger.position.add(offsets[0]);
        const abs1 = exchanger.position.add(offsets[1]);
        const cx = (abs0.x + abs1.x + 1) / 2 * CELL_SIZE_PX;
        const cy = (abs0.y + abs1.y + 1) / 2 * CELL_SIZE_PX;
        s.position.set(cx, cy);
        this.entityLayer.addChild(s);
        this.exchangerSprites.push(s);
      } else {
        const sprite = createExchangerGraphic(exchanger);
        sprite.position.set(exchanger.position.x * CELL_SIZE_PX, exchanger.position.y * CELL_SIZE_PX);
        this.entityLayer.addChild(sprite);
      }
    }
  }

  private renderAssemblerIcon(machine: Machine): void {
    if (!machine.needsRecipeSelection || !machine.selectedRecipeId) return;
    if (!this.recipeRegistry) return;

    const recipe = this.recipeRegistry.get(machine.selectedRecipeId);
    if (!recipe) return;

    const outputId = recipe.outputs[0]?.resourceId;
    if (!outputId) return;

    const resDef = this.resourceRegistry.get(outputId);
    if (!resDef) return;

    const eW = machine.effectiveWidth;
    const eH = machine.effectiveHeight;
    const iconSize = Math.round(CELL_SIZE_PX * 0.7);
    const cx = machine.position.x * CELL_SIZE_PX + (eW * CELL_SIZE_PX) / 2 - iconSize / 2;
    const cy = machine.position.y * CELL_SIZE_PX + (eH * CELL_SIZE_PX) / 2 - iconSize / 2;

    const icon = SpriteFactory.createItemIcon(resDef, iconSize);
    icon.position.set(Math.round(cx), Math.round(cy));
    this.entityLayer.addChild(icon);
  }

  private renderItems(): void {
    const alpha = this.tickEngine.interpolationAlpha;
    const activeItems = this._activeItems;
    activeItems.clear();

    const halfCell = CELL_SIZE_PX / 2;

    for (const belt of this.factory.getBelts()) {
      if (belt.slots.length === 0) continue;
      const slot = belt.slots[0];
      activeItems.add(slot.item.uid);
      let sprite = this.itemSprites.get(slot.item.uid);

      if (!sprite) {
        const resDef = this.resourceRegistry.get(slot.item.resourceId);
        if (!resDef) continue;
        sprite = this.spriteFactory.createItemGraphic(resDef);
        this.itemLayer.addChild(sprite);
        this.itemSprites.set(slot.item.uid, sprite);
      }

      sprite.visible = true;

      // Extrapolate from current progress using alpha
      const progress = Math.min(slot.progress + alpha * belt.speed, 10) / 10;

      const startX = belt.inputPosition.x * CELL_SIZE_PX + halfCell;
      const startY = belt.inputPosition.y * CELL_SIZE_PX + halfCell;
      const endX = belt.position.x * CELL_SIZE_PX + halfCell;
      const endY = belt.position.y * CELL_SIZE_PX + halfCell;

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
