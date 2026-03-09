import { Container, Graphics } from 'pixi.js';
import type { Factory } from '@/simulation/Factory';
import { FactoryRenderer } from './FactoryRenderer';
import { PlacementSystem, type PlacementTool } from './PlacementSystem';
import { SelectionSystem } from './SelectionSystem';
import { CameraController } from '@/rendering/CameraController';
import { SpriteFactory } from '@/rendering/SpriteFactory';
import { CommandHistory } from '@/core/CommandHistory';
import type { ResourceRegistry } from '@/simulation/Resource';
import type { RecipeRegistry } from '@/simulation/RecipeRegistry';
import type { RecipeBook } from '@/simulation/RecipeBook';
import type { TickEngine } from '@/core/TickEngine';
import type { IOPort } from '@/factory/IOPort';
import { Splitter } from '@/simulation/Splitter';
import { Direction, directionToVector } from '@/utils/Direction';
import { CELL_SIZE_PX, COLORS } from '@/utils/Constants';
import { Vector2 } from '@/utils/Vector2';
import { eventBus } from '@/core/EventBus';

export class FactoryView {
  readonly container: Container;
  readonly camera: CameraController;
  private renderer: FactoryRenderer;
  private placement: PlacementSystem;
  private selectionSystem: SelectionSystem;
  private factory: Factory;
  private ghostGraphic: Graphics;
  private selectionGraphic: Graphics;
  private worldContainer: Container;
  private lastScreenX = 0;
  private lastScreenY = 0;

  /** Called when an input IOPort is clicked with no tool selected */
  onEntryClicked: ((port: IOPort, screenX: number, screenY: number) => void) | null = null;
  /** Called when selection state changes so toolbar can update copy/paste buttons */
  onSelectionChanged: ((hasSelection: boolean, hasClipboard: boolean) => void) | null = null;

  constructor(
    factory: Factory,
    spriteFactory: SpriteFactory,
    resourceRegistry: ResourceRegistry,
    recipeRegistry: RecipeRegistry,
    recipeBook: RecipeBook,
    tickEngine: TickEngine,
  ) {
    this.factory = factory;
    this.container = new Container();

    this.worldContainer = new Container();
    this.container.addChild(this.worldContainer);

    this.camera = new CameraController(this.worldContainer);

    this.renderer = new FactoryRenderer(factory, spriteFactory, resourceRegistry, tickEngine);
    this.worldContainer.addChild(this.renderer.container);

    const commandHistory = new CommandHistory();
    this.placement = new PlacementSystem(factory, commandHistory, recipeRegistry, recipeBook);
    this.selectionSystem = new SelectionSystem(factory, commandHistory);

    this.ghostGraphic = new Graphics();
    this.ghostGraphic.zIndex = 10;
    this.worldContainer.addChild(this.ghostGraphic);

    this.selectionGraphic = new Graphics();
    this.selectionGraphic.zIndex = 11;
    this.worldContainer.addChild(this.selectionGraphic);

    eventBus.on('LayoutChanged', () => {
      this.renderer.markEntityDirty();
    });
  }

  get placementSystem(): PlacementSystem {
    return this.placement;
  }

  get selection(): SelectionSystem {
    return this.selectionSystem;
  }

  /** Reset all interaction state: cancel paste, clear selection, set tool to none */
  resetState(): void {
    this.selectionSystem.cancelPaste();
    this.selectionSystem.clearSelection();
    this.placement.setTool('none');
    this.ghostGraphic.clear();
    this.selectionGraphic.clear();
    this.notifySelectionChanged();
  }

  setTool(tool: PlacementTool): void {
    this.placement.setTool(tool);
    if (tool !== 'select') {
      this.selectionSystem.clearSelection();
      this.selectionSystem.cancelPaste();
      this.notifySelectionChanged();
    }
  }

  // --- Keyboard shortcuts ---

  handleKeyDown(e: KeyboardEvent): boolean {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'c') {
        this.copySelection();
        return true;
      }
      if (e.key === 'v') {
        this.startPaste();
        return true;
      }
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this.selectionSystem.hasSelection) {
        this.deleteSelection();
        return true;
      }
    }
    if (e.key === 'r' || e.key === 'R') {
      this.placement.rotateDirection();
      this.handlePointerMove(this.lastScreenX, this.lastScreenY);
      return true;
    }
    if (e.key === 'Escape') {
      if (this.placement.isPlacingTunnelExit) {
        this.placement.setTool('tunnel'); // re-set to cancel pending
        return true;
      }
      if (this.selectionSystem.isPasting) {
        this.selectionSystem.cancelPaste();
        this.notifySelectionChanged();
        return true;
      }
      if (this.selectionSystem.hasSelection) {
        this.selectionSystem.clearSelection();
        this.notifySelectionChanged();
        return true;
      }
    }
    return false;
  }

  copySelection(): void {
    this.selectionSystem.copySelection();
    this.notifySelectionChanged();
  }

  startPaste(): void {
    if (!this.selectionSystem.hasClipboard) return;
    this.selectionSystem.startPaste();
    if (this.placement.currentTool !== 'select') {
      this.placement.setTool('select');
    }
    this.notifySelectionChanged();
  }

  deleteSelection(): void {
    this.selectionSystem.deleteSelection();
    this.renderer.markEntityDirty();
    this.notifySelectionChanged();
  }

  private notifySelectionChanged(): void {
    this.onSelectionChanged?.(this.selectionSystem.hasSelection, this.selectionSystem.hasClipboard);
  }

  // --- Pointer handling ---

  handlePointerMove(screenX: number, screenY: number): void {
    this.lastScreenX = screenX;
    this.lastScreenY = screenY;
    const world = this.camera.screenToWorld(screenX, screenY);
    const gridX = Math.floor(world.x / CELL_SIZE_PX);
    const gridY = Math.floor(world.y / CELL_SIZE_PX);
    const gridPos = new Vector2(gridX, gridY);

    // Selection drag
    if (this.selectionSystem.isSelecting) {
      this.selectionSystem.updateSelection(gridPos);
      this.renderSelectionOverlay();
      return;
    }

    // Paste ghost
    if (this.selectionSystem.isPasting) {
      this.selectionSystem.updatePasteGhost(gridPos);
      this.renderSelectionOverlay();
      return;
    }

    // Normal placement ghost
    const result = this.placement.updateGhost(world.x, world.y);

    this.ghostGraphic.clear();
    if (result) {
      const px = result.position.x * CELL_SIZE_PX;
      const py = result.position.y * CELL_SIZE_PX;
      const tool = this.placement.currentTool;

      if (tool === 'delete') {
        const deleteColor = COLORS.ACCENT_RED;
        this.ghostGraphic.rect(px, py, CELL_SIZE_PX, CELL_SIZE_PX);
        this.ghostGraphic.fill({ color: deleteColor, alpha: result.valid ? 0.25 : 0.08 });
        this.ghostGraphic.rect(px, py, CELL_SIZE_PX, CELL_SIZE_PX);
        this.ghostGraphic.stroke({ color: deleteColor, alpha: result.valid ? 0.7 : 0.2, width: 2 });

        if (result.valid) {
          const cx = px + CELL_SIZE_PX / 2;
          const cy = py + CELL_SIZE_PX / 2;
          const s = CELL_SIZE_PX * 0.22;
          this.ghostGraphic.moveTo(cx - s, cy - s);
          this.ghostGraphic.lineTo(cx + s, cy + s);
          this.ghostGraphic.moveTo(cx + s, cy - s);
          this.ghostGraphic.lineTo(cx - s, cy + s);
          this.ghostGraphic.stroke({ color: deleteColor, width: 2.5, alpha: 0.8 });
        }
      } else if (tool === 'none') {
        // Subtle white hover highlight
        this.ghostGraphic.rect(px, py, CELL_SIZE_PX, CELL_SIZE_PX);
        this.ghostGraphic.fill({ color: 0xffffff, alpha: 0.08 });
        this.ghostGraphic.rect(px, py, CELL_SIZE_PX, CELL_SIZE_PX);
        this.ghostGraphic.stroke({ color: 0xffffff, alpha: 0.15, width: 1 });
      } else if (tool !== 'select') {
        let validColor = 0x53d769;
        if (tool === 'entry') validColor = COLORS.IO_INPUT;
        else if (tool === 'exit') validColor = COLORS.IO_OUTPUT;
        else if (tool === 'tunnel') validColor = 0x6b7db3;
        else if (tool === 'splitter') validColor = 0xf7c948;
        const color = result.valid ? validColor : COLORS.ACCENT_RED;

        // Multi-cell ghost for splitter
        const cells = this.getToolCells(tool, result.position);
        for (const cell of cells) {
          const cx = cell.x * CELL_SIZE_PX;
          const cy = cell.y * CELL_SIZE_PX;
          this.ghostGraphic.rect(cx, cy, CELL_SIZE_PX, CELL_SIZE_PX);
          this.ghostGraphic.fill({ color, alpha: 0.3 });
          this.ghostGraphic.rect(cx, cy, CELL_SIZE_PX, CELL_SIZE_PX);
          this.ghostGraphic.stroke({ color, alpha: 0.6, width: 2 });
        }

        // Draw direction arrow on ghost
        if (tool === 'belt' || tool === 'tunnel' || tool === 'splitter') {
          const dir = this.placement.lastDirection;
          const dirVec = directionToVector(dir);
          const firstCell = cells[0];
          const acx = firstCell.x * CELL_SIZE_PX + CELL_SIZE_PX / 2;
          const acy = firstCell.y * CELL_SIZE_PX + CELL_SIZE_PX / 2;
          const aLen = 8;
          this.ghostGraphic.moveTo(acx + dirVec.x * aLen, acy + dirVec.y * aLen);
          this.ghostGraphic.lineTo(acx - dirVec.x * aLen + dirVec.y * 5, acy - dirVec.y * aLen - dirVec.x * 5);
          this.ghostGraphic.lineTo(acx - dirVec.x * aLen - dirVec.y * 5, acy - dirVec.y * aLen + dirVec.x * 5);
          this.ghostGraphic.closePath();
          this.ghostGraphic.fill({ color, alpha: 0.5 });
        }

        // Show pending tunnel entry marker
        if (tool === 'tunnel' && this.placement.isPlacingTunnelExit && this.placement.pendingTunnelEntryPos) {
          const ep = this.placement.pendingTunnelEntryPos;
          const epx = ep.x * CELL_SIZE_PX;
          const epy = ep.y * CELL_SIZE_PX;
          this.ghostGraphic.rect(epx, epy, CELL_SIZE_PX, CELL_SIZE_PX);
          this.ghostGraphic.fill({ color: 0x6b7db3, alpha: 0.4 });
          this.ghostGraphic.rect(epx, epy, CELL_SIZE_PX, CELL_SIZE_PX);
          this.ghostGraphic.stroke({ color: 0x6b7db3, alpha: 0.8, width: 2 });

          // Dashed line between entry and ghost
          if (result.valid) {
            const ecx = epx + CELL_SIZE_PX / 2;
            const ecy = epy + CELL_SIZE_PX / 2;
            const gcx = px + CELL_SIZE_PX / 2;
            const gcy = py + CELL_SIZE_PX / 2;
            this.ghostGraphic.moveTo(ecx, ecy);
            this.ghostGraphic.lineTo(gcx, gcy);
            this.ghostGraphic.stroke({ color: 0x6b7db3, alpha: 0.4, width: 2 });
          }
        }
      }
    }

    if (this.placement.dragging) {
      this.renderer.markEntityDirty();
    }
  }

  handlePointerDown(screenX: number, screenY: number): void {
    const tool = this.placement.currentTool;

    // Select tool: start selection or confirm paste
    if (tool === 'select') {
      if (this.selectionSystem.isPasting) {
        this.selectionSystem.confirmPaste();
        this.selectionSystem.cancelPaste();
        this.renderer.markEntityDirty();
        this.selectionGraphic.clear();
        this.notifySelectionChanged();
        return;
      }
      this.camera.dragEnabled = false;
      const world = this.camera.screenToWorld(screenX, screenY);
      const gridX = Math.floor(world.x / CELL_SIZE_PX);
      const gridY = Math.floor(world.y / CELL_SIZE_PX);
      this.selectionSystem.startSelection(new Vector2(gridX, gridY));
      return;
    }

    if (tool === 'none') return;
    if (tool === 'entry' || tool === 'exit') return;
    if (tool === 'tunnel' || tool === 'splitter') return;

    this.camera.dragEnabled = false;
    const world = this.camera.screenToWorld(screenX, screenY);
    this.placement.startDrag(world.x, world.y);
  }

  handlePointerUp(): void {
    this.camera.dragEnabled = true;

    if (this.selectionSystem.isSelecting) {
      this.selectionSystem.endSelection();
      this.renderSelectionOverlay();
      this.notifySelectionChanged();
      return;
    }

    if (this.placement.dragging) {
      this.placement.endDrag();
      this.renderer.markEntityDirty();
    }
  }

  handleClick(screenX: number, screenY: number): boolean {
    if (this.placement.dragging) return false;

    const world = this.camera.screenToWorld(screenX, screenY);

    if (this.placement.currentTool === 'none') {
      const gridX = Math.floor(world.x / CELL_SIZE_PX);
      const gridY = Math.floor(world.y / CELL_SIZE_PX);
      const clickPos = new Vector2(gridX, gridY);
      const port = this.factory.getIOPortAt(clickPos);
      if (port && port.portType === 'input') {
        this.onEntryClicked?.(port, screenX, screenY);
        return true;
      }
      return false;
    }

    if (this.placement.currentTool === 'select') return false;

    this.placement.updateGhost(world.x, world.y);
    const placed = this.placement.execute();
    if (placed) {
      this.renderer.markEntityDirty();
    }
    return placed;
  }

  /** Get the cells that a tool would occupy at the given position */
  private getToolCells(tool: PlacementTool, pos: Vector2): Vector2[] {
    if (tool === 'splitter') {
      const splitter = new Splitter(pos, this.placement.lastDirection, 1);
      return splitter.getCells().map(c => c.add(pos));
    }
    return [pos];
  }

  // --- Selection overlay rendering ---

  private renderSelectionOverlay(): void {
    this.selectionGraphic.clear();

    const rect = this.selectionSystem.getSelectionRect();
    if (rect) {
      const px = rect.min.x * CELL_SIZE_PX;
      const py = rect.min.y * CELL_SIZE_PX;
      const w = (rect.max.x - rect.min.x + 1) * CELL_SIZE_PX;
      const h = (rect.max.y - rect.min.y + 1) * CELL_SIZE_PX;
      this.selectionGraphic.rect(px, py, w, h);
      this.selectionGraphic.fill({ color: COLORS.ACCENT_VIOLET, alpha: 0.1 });
      this.selectionGraphic.rect(px, py, w, h);
      this.selectionGraphic.stroke({ color: COLORS.ACCENT_VIOLET, width: 2, alpha: 0.6 });
    }

    const ghost = this.selectionSystem.getPasteGhost();
    if (ghost) {
      for (const entry of ghost.entries) {
        const px = entry.pos.x * CELL_SIZE_PX;
        const py = entry.pos.y * CELL_SIZE_PX;
        const color = entry.valid ? 0x53d769 : COLORS.ACCENT_RED;
        this.selectionGraphic.rect(px, py, CELL_SIZE_PX, CELL_SIZE_PX);
        this.selectionGraphic.fill({ color, alpha: 0.25 });
        this.selectionGraphic.rect(px, py, CELL_SIZE_PX, CELL_SIZE_PX);
        this.selectionGraphic.stroke({ color, alpha: 0.5, width: 1.5 });
      }
    }
  }

  markEntityDirty(): void {
    this.renderer.markEntityDirty();
  }

  update(deltaMs: number = 0): void {
    this.renderer.render(deltaMs);
    if (this.selectionSystem.hasSelection || this.selectionSystem.isPasting) {
      this.renderSelectionOverlay();
    }
  }

  centerCamera(screenWidth: number, screenHeight: number): void {
    const grid = this.factory.grid;
    const centerX = (grid.width * CELL_SIZE_PX) / 2;
    const centerY = (grid.height * CELL_SIZE_PX) / 2;
    this.camera.centerOn(centerX, centerY, screenWidth, screenHeight);
  }

  destroy(): void {
    this.renderer.destroy();
    this.container.destroy({ children: true });
  }
}
