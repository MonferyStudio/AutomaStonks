import { Container, Graphics, Sprite } from 'pixi.js';
import type { Factory } from '@/simulation/Factory';
import { FactoryRenderer } from './FactoryRenderer';
import { PlacementSystem, type PlacementTool } from './PlacementSystem';
import { SelectionSystem } from './SelectionSystem';
import { CameraController } from '@/rendering/CameraController';
import { SpriteFactory } from '@/rendering/SpriteFactory';
import { TextureCache } from '@/rendering/TextureCache';
import { createTunnelGraphic, createExchangerGraphic } from '@/rendering/EntityGraphicsFactory';
import { CommandHistory } from '@/core/CommandHistory';
import type { ICommand } from '@/interfaces/ICommand';
import type { ResourceRegistry } from '@/simulation/Resource';
import type { RecipeRegistry } from '@/simulation/RecipeRegistry';
import type { TickEngine } from '@/core/TickEngine';
import type { IOPort } from '@/factory/IOPort';
import { Belt } from '@/simulation/Belt';
import type { Machine } from '@/simulation/Machine';
import { Exchanger } from '@/simulation/Exchanger';
import { Direction, directionToVector, oppositeDirection } from '@/utils/Direction';
import { CELL_SIZE_PX, COLORS } from '@/utils/Constants';
import { Vector2 } from '@/utils/Vector2';
import { eventBus } from '@/core/EventBus';
import { isMobile } from '@/utils/platform';
import { FloatingTextManager } from '@/ui/FloatingTextManager';

export class FactoryView {
  readonly container: Container;
  readonly camera: CameraController;
  private renderer: FactoryRenderer;
  private placement: PlacementSystem;
  private selectionSystem: SelectionSystem;
  private commandHistory: CommandHistory;
  private factory: Factory;
  private ghostGraphic: Graphics;
  private ghostSpriteContainer: Container;
  private selectionGraphic: Graphics;
  private worldContainer: Container;
  private spriteFactory: SpriteFactory;
  private lastScreenX = 0;
  private lastScreenY = 0;

  // Mobile state
  private _mobile = isMobile();
  private _pendingConfirm = false;
  private _confirmUI: HTMLDivElement | null = null;
  private _selectTapA: Vector2 | null = null;
  private _mobileGhostWorldPos: { x: number; y: number } | null = null;

  // Mobile belt chain state
  private _beltChain: Array<{ pos: Vector2; dir: Direction }> = [];
  private _beltPreviewPos: Vector2 | null = null;
  private _beltPreviewDir: Direction = Direction.Right;
  private _beltChainGraphic: Graphics;

  private floatingText: FloatingTextManager;

  /** Called when an input IOPort is clicked with no tool selected */
  onEntryClicked: ((port: IOPort, screenX: number, screenY: number) => void) | null = null;
  /** Called when selection state changes so toolbar can update copy/paste buttons */
  onSelectionChanged: ((hasSelection: boolean, hasClipboard: boolean) => void) | null = null;
  /** Debug: right-click handler for border painting. Returns true if handled. */
  onRightClickCell: ((gridX: number, gridY: number) => boolean) | null = null;
  /** Called when an entity is placed successfully (single click). Returns the tool and grid position. */
  onEntityPlaced: ((tool: PlacementTool, gridPos: Vector2) => void) | null = null;
  /** Called when a belt drag ends with newly placed belts. count = number of new belts, lastPos = last placed position. */
  onBeltsDragPlaced: ((count: number, lastPos: Vector2) => void) | null = null;
  /** Called when a placed assembler machine is clicked (to open recipe selection). */
  onMachineClicked: ((machine: Machine) => void) | null = null;

  constructor(
    factory: Factory,
    spriteFactory: SpriteFactory,
    resourceRegistry: ResourceRegistry,
    tickEngine: TickEngine,
  ) {
    this.factory = factory;
    this.spriteFactory = spriteFactory;
    this.container = new Container();

    this.worldContainer = new Container();
    this.container.addChild(this.worldContainer);

    this.camera = new CameraController(this.worldContainer);

    this.renderer = new FactoryRenderer(factory, spriteFactory, resourceRegistry, tickEngine);
    this.worldContainer.addChild(this.renderer.container);

    this.commandHistory = new CommandHistory();
    this.placement = new PlacementSystem(factory, this.commandHistory);
    this.selectionSystem = new SelectionSystem(factory, this.commandHistory);

    this.ghostSpriteContainer = new Container();
    this.ghostSpriteContainer.zIndex = 10;
    this.worldContainer.addChild(this.ghostSpriteContainer);

    this.ghostGraphic = new Graphics();
    this.ghostGraphic.zIndex = 10;
    this.worldContainer.addChild(this.ghostGraphic);

    this._beltChainGraphic = new Graphics();
    this._beltChainGraphic.zIndex = 10;
    this.worldContainer.addChild(this._beltChainGraphic);

    this.selectionGraphic = new Graphics();
    this.selectionGraphic.zIndex = 11;
    this.worldContainer.addChild(this.selectionGraphic);

    this.floatingText = new FloatingTextManager();
    this.worldContainer.addChild(this.floatingText.container);

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

  setRecipeRegistry(registry: RecipeRegistry): void {
    this.renderer.setRecipeRegistry(registry);
  }

  /** Reset all interaction state: cancel paste, clear selection, set tool to none */
  /** Handle right-click: if border paint callback is set, use it. Returns true if handled. */
  handleRightClick(screenX: number, screenY: number): boolean {
    if (!this.onRightClickCell) return false;
    const world = this.camera.screenToWorld(screenX, screenY);
    const gridX = Math.floor(world.x / CELL_SIZE_PX);
    const gridY = Math.floor(world.y / CELL_SIZE_PX);
    return this.onRightClickCell(gridX, gridY);
  }

  resetState(): void {
    this.selectionSystem.cancelPaste();
    this.selectionSystem.clearSelection();
    this.placement.setTool('none');
    this.ghostGraphic.clear();
    this.ghostSpriteContainer.removeChildren().forEach(c => c.destroy({ children: true }));
    this.selectionGraphic.clear();
    this._pendingConfirm = false;
    this._hideConfirmUI();
    this._selectTapA = null;
    this._mobileGhostWorldPos = null;
    this._clearBeltChain();
    this.notifySelectionChanged();
  }

  setTool(tool: PlacementTool): void {
    this.placement.setTool(tool);
    this._pendingConfirm = false;
    this._hideConfirmUI();
    this._selectTapA = null;
    this._mobileGhostWorldPos = null;
    this._clearBeltChain();
    this.ghostGraphic.clear();
    this.ghostSpriteContainer.removeChildren().forEach(c => c.destroy({ children: true }));
    this.selectionGraphic.clear();
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

  // ===================== POINTER HANDLING =====================

  handlePointerMove(screenX: number, screenY: number): void {
    if (this._mobile) return; // No hover preview on mobile — all via tap

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
    this._renderPlacementGhost(result);

    if (this.placement.dragging) {
      this.renderer.markEntityDirty();
    }
  }

  handlePointerDown(screenX: number, screenY: number): void {
    if (this._mobile) return; // Mobile uses tap-only via handleClick

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
    if (tool === 'tunnel' || tool === 'exchanger' || tool === 'machine') return;

    this.camera.dragEnabled = false;
    const world = this.camera.screenToWorld(screenX, screenY);
    this.placement.startDrag(world.x, world.y);
  }

  handlePointerUp(): void {
    if (this._mobile) return; // Mobile uses tap-only via handleClick

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
      // Fire belt drag cost callback
      const beltsPlaced = this.placement.dragBeltsPlaced;
      if (beltsPlaced > 0) {
        const world = this.camera.screenToWorld(this.lastScreenX, this.lastScreenY);
        const gridX = Math.floor(world.x / CELL_SIZE_PX);
        const gridY = Math.floor(world.y / CELL_SIZE_PX);
        this.onBeltsDragPlaced?.(beltsPlaced, new Vector2(gridX, gridY));
      }
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
      // Check if clicked on an assembler machine
      const machine = this.factory.getMachineAt(clickPos);
      if (machine && machine.needsRecipeSelection) {
        this.onMachineClicked?.(machine);
        return true;
      }
      return false;
    }

    // ---- Mobile: all interactions via tap ----
    if (this._mobile) {
      return this._handleMobileClick(screenX, screenY);
    }

    // ---- Desktop (unchanged) ----
    if (this.placement.currentTool === 'select') return false;

    this.placement.updateGhost(world.x, world.y);
    const placed = this.placement.execute();
    if (placed) {
      this.renderer.markEntityDirty();
      const gridX = Math.floor(world.x / CELL_SIZE_PX);
      const gridY = Math.floor(world.y / CELL_SIZE_PX);
      this.onEntityPlaced?.(this.placement.currentTool, new Vector2(gridX, gridY));
    }
    return placed;
  }

  // ===================== MOBILE INTERACTION =====================

  private _handleMobileClick(screenX: number, screenY: number): boolean {
    const world = this.camera.screenToWorld(screenX, screenY);
    const gridX = Math.floor(world.x / CELL_SIZE_PX);
    const gridY = Math.floor(world.y / CELL_SIZE_PX);
    const tool = this.placement.currentTool;

    // Belt: chain placement with preview
    if (tool === 'belt') {
      return this._handleMobileBeltTap(gridX, gridY);
    }

    // Delete: tap to delete immediately
    if (tool === 'delete') {
      this.placement.updateGhost(world.x, world.y);
      const placed = this.placement.execute();
      if (placed) this.renderer.markEntityDirty();
      return placed;
    }

    // Select: 2-tap selection or paste
    if (tool === 'select') {
      return this._handleMobileSelect(gridX, gridY);
    }

    // Machine, Tunnel, Exchanger, Entry, Exit: confirm/cancel flow
    return this._handleMobileConfirmPlace(world);
  }

  // ===================== MOBILE BELT CHAIN =====================

  private _handleMobileBeltTap(gridX: number, gridY: number): boolean {
    const pos = new Vector2(gridX, gridY);

    // Tap on the current preview → do nothing (user should use Rotate)
    if (this._beltPreviewPos && this._beltPreviewPos.equals(pos)) {
      return true;
    }

    // Tap on an existing chain belt → re-select it for editing
    const chainIdx = this._beltChain.findIndex(b => b.pos.equals(pos));
    if (chainIdx !== -1) {
      // Move current preview into chain first
      if (this._beltPreviewPos) {
        this._beltChain.push({ pos: this._beltPreviewPos, dir: this._beltPreviewDir });
      }
      // Pull the tapped belt out of the chain into preview
      const entry = this._beltChain.splice(chainIdx, 1)[0];
      this._beltPreviewPos = entry.pos;
      this._beltPreviewDir = entry.dir;
      this._renderBeltChain();
      return true;
    }

    // Can't place here — occupied or out of bounds
    if (!this.factory.grid.isInBounds(pos) || this.factory.grid.isOccupied(pos)) {
      return false;
    }

    // If there's already a preview belt, commit it to the chain
    if (this._beltPreviewPos) {
      this._beltChain.push({ pos: this._beltPreviewPos, dir: this._beltPreviewDir });
    }

    // Infer direction for the new preview
    const dir = this._inferBeltChainDirection(pos);
    this._beltPreviewPos = pos;
    this._beltPreviewDir = dir;

    // Update direction of previous belt if adjacent (auto-connect towards new belt)
    if (this._beltChain.length > 0) {
      const prev = this._beltChain[this._beltChain.length - 1];
      const dx = pos.x - prev.pos.x;
      const dy = pos.y - prev.pos.y;
      if (Math.abs(dx) + Math.abs(dy) === 1) {
        let newPrevDir: Direction;
        if (dx === 1) newPrevDir = Direction.Right;
        else if (dx === -1) newPrevDir = Direction.Left;
        else if (dy === 1) newPrevDir = Direction.Down;
        else newPrevDir = Direction.Up;
        prev.dir = newPrevDir;
      }
    }

    // Show confirm UI if not already shown
    if (!this._confirmUI) {
      this._showBeltConfirmUI();
    }

    // Render the chain + preview
    this._renderBeltChain();
    return true;
  }

  /** Infer direction for a new belt in the chain, considering pending belts */
  private _inferBeltChainDirection(pos: Vector2): Direction {
    const prev = this._beltPreviewPos
      ? { pos: this._beltPreviewPos, dir: this._beltPreviewDir }
      : this._beltChain.length > 0
        ? this._beltChain[this._beltChain.length - 1]
        : null;

    if (prev) {
      const dx = pos.x - prev.pos.x;
      const dy = pos.y - prev.pos.y;
      if (Math.abs(dx) + Math.abs(dy) === 1) {
        if (dx === 1) return Direction.Right;
        if (dx === -1) return Direction.Left;
        if (dy === 1) return Direction.Down;
        return Direction.Up;
      }
    }

    return this.placement.inferBeltDirection(pos);
  }

  /** Get all chain entries including the current preview, in order */
  private _getAllChainEntries(): Array<{ pos: Vector2; dir: Direction }> {
    const all = [...this._beltChain];
    if (this._beltPreviewPos) {
      all.push({ pos: this._beltPreviewPos, dir: this._beltPreviewDir });
    }
    return all;
  }

  /**
   * Compute the belt shape (straight/curve) for a chain entry by looking at
   * its neighbors within the chain and on the actual grid.
   */
  private _computeChainBeltShape(
    index: number,
    entries: Array<{ pos: Vector2; dir: Direction }>,
  ): { inputDir: Direction; isCurve: boolean } {
    const entry = entries[index];

    // Find what feeds into this belt: the previous chain entry or an on-grid belt
    let feedDir: Direction | null = null;

    // Check chain neighbors: find one whose output (pos + dirVec) == this pos
    for (let i = 0; i < entries.length; i++) {
      if (i === index) continue;
      const other = entries[i];
      const outPos = other.pos.add(directionToVector(other.dir));
      if (outPos.equals(entry.pos)) {
        // feedDir = edge from which items enter (same as Belt.computeShape: prev - this)
        const dx = other.pos.x - entry.pos.x;
        const dy = other.pos.y - entry.pos.y;
        if (dx === -1) feedDir = Direction.Left;
        else if (dx === 1) feedDir = Direction.Right;
        else if (dy === -1) feedDir = Direction.Up;
        else feedDir = Direction.Down;
        break;
      }
    }

    // If no chain feeder, check the real grid
    if (feedDir === null) {
      const grid = this.factory.grid;
      for (const checkDir of [Direction.Up, Direction.Down, Direction.Left, Direction.Right]) {
        const neighborPos = entry.pos.add(directionToVector(checkDir));
        const neighbor = grid.getAt(neighborPos);
        if (neighbor instanceof Belt) {
          const nOut = neighbor.position.add(directionToVector(neighbor.direction));
          if (nOut.equals(entry.pos)) {
            const dx = neighbor.position.x - entry.pos.x;
            const dy = neighbor.position.y - entry.pos.y;
            if (dx === -1) feedDir = Direction.Left;
            else if (dx === 1) feedDir = Direction.Right;
            else if (dy === -1) feedDir = Direction.Up;
            else feedDir = Direction.Down;
            break;
          }
        }
      }
    }

    if (feedDir === null) {
      return { inputDir: oppositeDirection(entry.dir), isCurve: false };
    }

    const isCurve = feedDir !== oppositeDirection(entry.dir);
    return { inputDir: feedDir, isCurve };
  }

  /** Render all pending belts (cyan) + current preview (green), with proper curves */
  private _renderBeltChain(): void {
    this._beltChainGraphic.clear();
    this.ghostGraphic.clear();
    this.ghostSpriteContainer.removeChildren().forEach(c => c.destroy({ children: true }));

    const S = CELL_SIZE_PX;
    const PENDING_COLOR = 0x4dc9f6;
    const PREVIEW_COLOR = 0x53d769;
    const allEntries = this._getAllChainEntries();

    for (let i = 0; i < allEntries.length; i++) {
      const entry = allEntries[i];
      const isPreview = this._beltPreviewPos !== null && entry.pos.equals(this._beltPreviewPos);
      const color = isPreview ? PREVIEW_COLOR : PENDING_COLOR;
      const g = isPreview ? this.ghostGraphic : this._beltChainGraphic;
      const px = entry.pos.x * S;
      const py = entry.pos.y * S;

      // Compute curve shape
      const { inputDir, isCurve } = this._computeChainBeltShape(i, allEntries);

      // Build appropriate belt sprite (straight or curve)
      const sprite = this._buildChainBeltSprite(entry.pos, entry.dir, inputDir, isCurve);
      if (sprite) {
        sprite.alpha = isPreview ? 0.6 : 0.5;
        this.ghostSpriteContainer.addChild(sprite);
      }

      // Tint overlay
      g.rect(px, py, S, S);
      g.fill({ color, alpha: isPreview ? 0.2 : 0.15 });
      g.rect(px, py, S, S);
      g.stroke({ color, alpha: isPreview ? 0.6 : 0.5, width: isPreview ? 2 : 1.5 });

      // Direction arrow
      this._drawDirectionArrow(g, px, py, entry.dir, color, isPreview ? 0.8 : 0.6);
    }
  }

  /** Draw a small direction arrow inside a cell */
  private _drawDirectionArrow(g: Graphics, px: number, py: number, dir: Direction, color: number, alpha: number): void {
    const S = CELL_SIZE_PX;
    const cx = px + S / 2;
    const cy = py + S / 2;
    const a = S * 0.2;
    const dv = directionToVector(dir);
    const tipX = cx + dv.x * a;
    const tipY = cy + dv.y * a;
    const perpX = -dv.y;
    const perpY = dv.x;
    const wingSize = a * 0.6;

    g.moveTo(tipX, tipY);
    g.lineTo(tipX - dv.x * a * 1.2 + perpX * wingSize, tipY - dv.y * a * 1.2 + perpY * wingSize);
    g.moveTo(tipX, tipY);
    g.lineTo(tipX - dv.x * a * 1.2 - perpX * wingSize, tipY - dv.y * a * 1.2 - perpY * wingSize);
    g.stroke({ color, alpha, width: 2 });
  }

  /** Build a belt sprite with correct shape (straight or curve) for chain preview */
  private _buildChainBeltSprite(
    pos: Vector2, dir: Direction, inputDir: Direction, isCurve: boolean,
  ): Container | null {
    const S = CELL_SIZE_PX;
    const px = pos.x * S;
    const py = pos.y * S;

    const tex = isCurve
      ? (TextureCache.beltCurveFrames[0] ?? null)
      : (TextureCache.beltStraightFrames[0] ?? null);

    if (!tex) {
      // Fallback: programmatic
      const belt = this.spriteFactory.createBeltGraphic(dir);
      belt.position.set(px, py);
      const c = new Container();
      c.addChild(belt);
      return c;
    }

    const sprite = new Sprite(tex);
    sprite.anchor.set(0.5);
    sprite.position.set(px + S / 2, py + S / 2);
    sprite.scale.set(4);
    sprite.roundPixels = true;

    if (!isCurve) {
      // Straight belt rotation
      const rotMap: Record<Direction, number> = {
        [Direction.Right]: 0,
        [Direction.Down]: Math.PI / 2,
        [Direction.Left]: Math.PI,
        [Direction.Up]: -Math.PI / 2,
      };
      sprite.rotation = rotMap[dir];
    } else {
      // Curve rotation — same logic as EntityGraphicsFactory.createSeamlessBeltGraphic
      const curveKey = `${inputDir}_${dir}`;
      const normalRotations: Record<string, number> = {
        [`${Direction.Left}_${Direction.Down}`]: 0,
        [`${Direction.Down}_${Direction.Right}`]: -Math.PI / 2,
        [`${Direction.Right}_${Direction.Up}`]: Math.PI,
        [`${Direction.Up}_${Direction.Left}`]: Math.PI / 2,
      };
      const flippedRotations: Record<string, number> = {
        [`${Direction.Right}_${Direction.Down}`]: Math.PI,
        [`${Direction.Down}_${Direction.Left}`]: -Math.PI / 2,
        [`${Direction.Up}_${Direction.Right}`]: Math.PI / 2,
        [`${Direction.Left}_${Direction.Up}`]: 0,
      };

      if (normalRotations[curveKey] !== undefined) {
        sprite.rotation = normalRotations[curveKey];
      } else if (flippedRotations[curveKey] !== undefined) {
        sprite.scale.y *= -1;
        sprite.rotation = flippedRotations[curveKey];
      } else {
        // Fallback: straight rotation
        const rotMap: Record<Direction, number> = {
          [Direction.Right]: 0,
          [Direction.Down]: Math.PI / 2,
          [Direction.Left]: Math.PI,
          [Direction.Up]: -Math.PI / 2,
        };
        sprite.rotation = rotMap[dir];
      }
    }

    const c = new Container();
    c.addChild(sprite);
    return c;
  }

  /** Show confirm UI for belt chain: Cancel / Rotate / Confirm */
  private _showBeltConfirmUI(): void {
    this._hideConfirmUI();

    const div = document.createElement('div');
    Object.assign(div.style, {
      position: 'fixed',
      bottom: '140px',
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: '12px',
      zIndex: '900',
    });

    const makeBtn = (label: string, bg: string, color: string, onClick: () => void) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      Object.assign(btn.style, {
        padding: '12px 28px',
        borderRadius: '10px',
        border: 'none',
        background: bg,
        color,
        fontFamily: 'Inter, sans-serif',
        fontSize: '14px',
        fontWeight: '700',
        cursor: 'pointer',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        touchAction: 'manipulation',
      });
      btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
      return btn;
    };

    // Cancel — discard entire chain
    div.appendChild(makeBtn('Cancel', 'rgba(233,69,96,0.85)', '#fff', () => {
      this._clearBeltChain();
    }));

    // Rotate — rotate current preview belt
    div.appendChild(makeBtn('Rotate', 'rgba(77,201,246,0.85)', '#fff', () => {
      if (this._beltPreviewPos) {
        const rotMap: Record<Direction, Direction> = {
          [Direction.Right]: Direction.Down,
          [Direction.Down]: Direction.Left,
          [Direction.Left]: Direction.Up,
          [Direction.Up]: Direction.Right,
        };
        this._beltPreviewDir = rotMap[this._beltPreviewDir];
        this._renderBeltChain();
      }
    }));

    // Confirm — place all belts in one batch
    div.appendChild(makeBtn('Confirm', 'rgba(83,215,105,0.85)', '#fff', () => {
      this._confirmBeltChain();
    }));

    document.body.appendChild(div);
    this._confirmUI = div;
  }

  /** Place all chain + preview belts as a single undoable command */
  private _confirmBeltChain(): void {
    const allBelts = this._getAllChainEntries();

    if (allBelts.length === 0) {
      this._clearBeltChain();
      return;
    }

    // Build Belt instances, skip any that became invalid
    const tier = this.placement.currentBeltTier;
    const belts: Belt[] = [];
    for (const entry of allBelts) {
      if (this.factory.grid.isInBounds(entry.pos) && !this.factory.grid.isOccupied(entry.pos)) {
        belts.push(new Belt(entry.pos, entry.dir, tier));
      }
    }

    if (belts.length > 0) {
      this.commandHistory.execute(new BulkPlaceBeltsCommand(this.factory, belts));
      this.factory.updateBeltShapes();
      this.renderer.markEntityDirty();
      // Fire batched belt cost callback
      const lastBelt = belts[belts.length - 1];
      this.onBeltsDragPlaced?.(belts.length, lastBelt.position);
    }

    this._clearBeltChain();
  }

  /** Clear all belt chain state and UI */
  private _clearBeltChain(): void {
    this._beltChain = [];
    this._beltPreviewPos = null;
    this._beltPreviewDir = Direction.Right;
    this._beltChainGraphic.clear();
    this.ghostGraphic.clear();
    this.ghostSpriteContainer.removeChildren().forEach(c => c.destroy({ children: true }));
    this._hideConfirmUI();
  }

  // ===================== MOBILE SELECT =====================

  /** 2-tap selection on mobile */
  private _handleMobileSelect(gridX: number, gridY: number): boolean {
    const gridPos = new Vector2(gridX, gridY);

    // If pasting: tap to position and place immediately
    if (this.selectionSystem.isPasting) {
      this.selectionSystem.updatePasteGhost(gridPos);
      this.selectionSystem.confirmPaste();
      this.renderer.markEntityDirty();
      this.renderSelectionOverlay();
      return true;
    }

    // 2-tap selection flow
    if (!this._selectTapA) {
      // First tap: mark corner A
      this._selectTapA = gridPos;
      this._renderSelectTapA();
      return true;
    } else {
      // Second tap: create selection from A to B
      this.selectionSystem.startSelection(this._selectTapA);
      this.selectionSystem.updateSelection(gridPos);
      this.selectionSystem.endSelection();
      this._selectTapA = null;
      this.renderSelectionOverlay();
      this.notifySelectionChanged();
      return true;
    }
  }

  /** Render the first corner marker for mobile 2-tap selection */
  private _renderSelectTapA(): void {
    if (!this._selectTapA) return;
    this.selectionGraphic.clear();
    const px = this._selectTapA.x * CELL_SIZE_PX;
    const py = this._selectTapA.y * CELL_SIZE_PX;
    this.selectionGraphic.rect(px, py, CELL_SIZE_PX, CELL_SIZE_PX);
    this.selectionGraphic.fill({ color: COLORS.ACCENT_VIOLET, alpha: 0.3 });
    this.selectionGraphic.rect(px, py, CELL_SIZE_PX, CELL_SIZE_PX);
    this.selectionGraphic.stroke({ color: COLORS.ACCENT_VIOLET, width: 2, alpha: 0.8 });
  }

  // ===================== MOBILE CONFIRM PLACE =====================

  /** confirm/cancel placement flow for complex tools (machine, tunnel, etc.) */
  private _handleMobileConfirmPlace(world: { x: number; y: number }): boolean {
    this._mobileGhostWorldPos = world;
    const result = this.placement.updateGhost(world.x, world.y);
    this._renderPlacementGhost(result);

    if (!this._pendingConfirm) {
      this._pendingConfirm = true;
      this._showConfirmUI();
    }
    return true;
  }

  // ===================== GHOST RENDERING =====================

  /** Render the placement ghost graphic based on the current tool and ghost position */
  private _renderPlacementGhost(result: { position: Vector2; valid: boolean } | null): void {
    this.ghostGraphic.clear();
    this.ghostSpriteContainer.removeChildren().forEach(c => c.destroy({ children: true }));

    if (!result) return;

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
      // Build the actual entity sprite as ghost
      const ghostSprite = this.buildGhostSprite(tool, result.position);
      if (ghostSprite) {
        // Apply validity tint overlay
        const tintColor = result.valid ? 0x53d769 : 0xff4444;
        const tintOverlay = new Graphics();

        const cells = this.getToolCells(tool, result.position);
        for (const cell of cells) {
          const cx = cell.x * CELL_SIZE_PX;
          const cy = cell.y * CELL_SIZE_PX;
          tintOverlay.rect(cx, cy, CELL_SIZE_PX, CELL_SIZE_PX);
          tintOverlay.fill({ color: tintColor, alpha: 0.25 });
          tintOverlay.rect(cx, cy, CELL_SIZE_PX, CELL_SIZE_PX);
          tintOverlay.stroke({ color: tintColor, alpha: 0.5, width: 2 });
        }

        ghostSprite.alpha = 0.6;
        this.ghostSpriteContainer.addChild(ghostSprite);
        this.ghostSpriteContainer.addChild(tintOverlay);
      }

      // Show pending tunnel entry marker
      if (tool === 'tunnel' && this.placement.isPlacingTunnelExit && this.placement.pendingTunnelEntryPos) {
        const ep = this.placement.pendingTunnelEntryPos;
        const epx = ep.x * CELL_SIZE_PX;
        const epy = ep.y * CELL_SIZE_PX;

        // Show the entry sprite at pending position
        const entrySprite = createTunnelGraphic(this.placement.pendingTunnelDir!, true);
        entrySprite.position.set(epx, epy);
        entrySprite.alpha = 0.5;
        this.ghostSpriteContainer.addChild(entrySprite);

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

  // ===================== CONFIRM UI =====================

  /** Show confirm/cancel/rotate buttons for mobile placement (non-belt tools) */
  private _showConfirmUI(): void {
    this._hideConfirmUI();

    const div = document.createElement('div');
    Object.assign(div.style, {
      position: 'fixed',
      bottom: '140px',
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: '12px',
      zIndex: '900',
    });

    const makeBtn = (label: string, bg: string, color: string, onClick: () => void) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      Object.assign(btn.style, {
        padding: '12px 28px',
        borderRadius: '10px',
        border: 'none',
        background: bg,
        color,
        fontFamily: 'Inter, sans-serif',
        fontSize: '14px',
        fontWeight: '700',
        cursor: 'pointer',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        touchAction: 'manipulation',
      });
      btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
      return btn;
    };

    // Cancel
    div.appendChild(makeBtn('Cancel', 'rgba(233,69,96,0.85)', '#fff', () => {
      this._pendingConfirm = false;
      this._hideConfirmUI();
      this._mobileGhostWorldPos = null;
      this.ghostGraphic.clear();
      this.ghostSpriteContainer.removeChildren().forEach(c => c.destroy({ children: true }));
    }));

    // Rotate
    div.appendChild(makeBtn('Rotate', 'rgba(77,201,246,0.85)', '#fff', () => {
      this.placement.rotateDirection();
      if (this._mobileGhostWorldPos) {
        const res = this.placement.updateGhost(this._mobileGhostWorldPos.x, this._mobileGhostWorldPos.y);
        this._renderPlacementGhost(res);
      }
    }));

    // Confirm
    div.appendChild(makeBtn('Confirm', 'rgba(83,215,105,0.85)', '#fff', () => {
      this._pendingConfirm = false;
      this._hideConfirmUI();
      const ghostPos = this._mobileGhostWorldPos;
      this._mobileGhostWorldPos = null;
      const tool = this.placement.currentTool;
      const placed = this.placement.execute();
      if (placed && ghostPos) {
        this.renderer.markEntityDirty();
        const gridX = Math.floor(ghostPos.x / CELL_SIZE_PX);
        const gridY = Math.floor(ghostPos.y / CELL_SIZE_PX);
        this.onEntityPlaced?.(tool, new Vector2(gridX, gridY));
      }
    }));

    document.body.appendChild(div);
    this._confirmUI = div;
  }

  private _hideConfirmUI(): void {
    this._confirmUI?.remove();
    this._confirmUI = null;
  }

  // ===================== TOOL HELPERS =====================

  /** Get the cells that a tool would occupy at the given position */
  private getToolCells(tool: PlacementTool, pos: Vector2): Vector2[] {
    if (tool === 'exchanger') {
      const splitter = new Exchanger(pos, this.placement.lastDirection, 1);
      return splitter.getCells().map(c => c.add(pos));
    }
    if (tool === 'machine') {
      return this.placement.getMachineCells(pos);
    }
    return [pos];
  }

  /**
   * Build the actual entity graphic for ghost preview.
   * Returns a Container positioned at the correct world coordinates.
   */
  private buildGhostSprite(tool: PlacementTool, pos: Vector2): Container | null {
    const dir = this.placement.lastDirection;
    const S = CELL_SIZE_PX;
    const px = pos.x * S;
    const py = pos.y * S;

    if (tool === 'belt') {
      return this._buildChainBeltSprite(pos, dir, oppositeDirection(dir), false);
    }

    if (tool === 'entry' || tool === 'exit') {
      const portType = tool === 'entry' ? 'input' : 'output';
      const frames = portType === 'input' ? TextureCache.beltEntryFrames : TextureCache.beltExitFrames;
      const tex = frames[0] ?? null;
      const ioRotMap: Record<Direction, number> = {
        [Direction.Up]: 0,
        [Direction.Right]: Math.PI / 2,
        [Direction.Down]: Math.PI,
        [Direction.Left]: -Math.PI / 2,
      };
      if (tex) {
        const sprite = new Sprite(tex);
        sprite.anchor.set(0.5);
        sprite.scale.set(4);
        sprite.roundPixels = true;
        sprite.rotation = ioRotMap[dir];
        sprite.position.set(px + S / 2, py + S / 2);
        const c = new Container();
        c.addChild(sprite);
        return c;
      }
      // Fallback
      const portGraphic = this.spriteFactory.createIOPortGraphic(portType, dir);
      portGraphic.position.set(px + S / 2, py + S / 2);
      const c = new Container();
      c.addChild(portGraphic);
      return c;
    }

    if (tool === 'tunnel') {
      const isEntry = !this.placement.isPlacingTunnelExit;
      const sprite = createTunnelGraphic(dir, isEntry);
      sprite.position.set(px, py);
      const c = new Container();
      c.addChild(sprite);
      return c;
    }

    if (tool === 'exchanger') {
      const tex = TextureCache.exchangerFrames[0] ?? null;
      if (tex) {
        const sprite = new Sprite(tex);
        sprite.roundPixels = true;
        sprite.anchor.set(0, 0);
        sprite.scale.set(CELL_SIZE_PX / 16);
        sprite.position.set(px, py);
        const c = new Container();
        c.addChild(sprite);
        return c;
      }
      // Fallback to programmatic graphic
      const tempExchanger = new Exchanger(pos, dir, 1);
      const sprite = createExchangerGraphic(tempExchanger);
      sprite.position.set(px, py);
      const c = new Container();
      c.addChild(sprite);
      return c;
    }

    if (tool === 'machine') {
      const machineDef = this.placement.currentMachineDef;
      if (!machineDef) return null;
      const rotation = this.placement.machineRotation;
      const eW = rotation % 2 === 0 ? machineDef.width : machineDef.height;
      const eH = rotation % 2 === 0 ? machineDef.height : machineDef.width;

      const tex = TextureCache.getMachineTexture(machineDef.id);
      if (tex) {
        const sprite = new Sprite(tex);
        sprite.roundPixels = true;
        sprite.anchor.set(0.5);
        sprite.width = machineDef.width * S;
        sprite.height = machineDef.height * S;
        sprite.rotation = (rotation * Math.PI) / 2;
        sprite.position.set(
          px + (eW * S) / 2,
          py + (eH * S) / 2,
        );
        const c = new Container();
        c.addChild(sprite);
        return c;
      }
      // Fallback: programmatic machine
      const machineGraphic = this.spriteFactory.createMachineGraphic(
        machineDef.name, machineDef.color, eW, eH,
      );
      machineGraphic.position.set(px, py);
      const c = new Container();
      c.addChild(machineGraphic);
      return c;
    }

    return null;
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

  /** Spawn a floating text at a grid position (world-space) */
  spawnFloatingText(gridX: number, gridY: number, amount: number, color: number): void {
    const wx = (gridX + 0.5) * CELL_SIZE_PX;
    const wy = gridY * CELL_SIZE_PX;
    this.floatingText.spawn(wx, wy, amount, color);
  }

  markEntityDirty(): void {
    this.renderer.markEntityDirty();
  }

  update(deltaMs: number = 0): void {
    this.renderer.render(deltaMs);
    this.floatingText.update(deltaMs);
    if (this.selectionSystem.hasSelection || this.selectionSystem.isPasting) {
      this.renderSelectionOverlay();
    } else if (this._mobile && this._selectTapA) {
      this._renderSelectTapA();
    }
  }

  centerCamera(screenWidth: number, screenHeight: number): void {
    const grid = this.factory.grid;
    const centerX = (grid.width * CELL_SIZE_PX) / 2;
    const centerY = (grid.height * CELL_SIZE_PX) / 2;
    this.camera.centerOn(centerX, centerY, screenWidth, screenHeight);
  }

  destroy(): void {
    this._hideConfirmUI();
    this.renderer.destroy();
    this.container.destroy({ children: true });
  }
}

// ===================== COMMANDS =====================

class BulkPlaceBeltsCommand implements ICommand {
  readonly description = 'Place belt chain';
  constructor(private factory: Factory, private belts: Belt[]) {}

  execute(): void {
    for (const belt of this.belts) {
      this.factory.addBelt(belt);
    }
  }

  undo(): void {
    for (const belt of this.belts) {
      this.factory.removeEntity(belt);
    }
    this.factory.updateBeltShapes();
  }
}
