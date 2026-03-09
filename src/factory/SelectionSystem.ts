import { Vector2 } from '@/utils/Vector2';
import { Direction } from '@/utils/Direction';
import type { Factory } from '@/simulation/Factory';
import { Belt } from '@/simulation/Belt';
import { CommandHistory } from '@/core/CommandHistory';
import type { ICommand } from '@/interfaces/ICommand';

export interface BlueprintEntry {
  /** Offset from the blueprint origin (top-left of selection) */
  offset: Vector2;
  direction: Direction;
  tier: number;
}

export class SelectionSystem {
  private factory: Factory;
  private commandHistory: CommandHistory;

  // Selection rectangle (grid coords)
  private selecting = false;
  private selStart: Vector2 | null = null;
  private selEnd: Vector2 | null = null;
  private selection: { min: Vector2; max: Vector2 } | null = null;

  // Clipboard
  private clipboard: BlueprintEntry[] = [];

  // Paste ghost
  private pasting = false;
  private pasteOrigin: Vector2 | null = null;

  constructor(factory: Factory, commandHistory: CommandHistory) {
    this.factory = factory;
    this.commandHistory = commandHistory;
  }

  // --- Selection ---

  get isSelecting(): boolean { return this.selecting; }
  get isPasting(): boolean { return this.pasting; }
  get hasSelection(): boolean { return this.selection !== null; }
  get hasClipboard(): boolean { return this.clipboard.length > 0; }

  startSelection(gridPos: Vector2): void {
    this.cancelPaste();
    this.selecting = true;
    this.selStart = gridPos;
    this.selEnd = gridPos;
    this.selection = null;
  }

  updateSelection(gridPos: Vector2): void {
    if (!this.selecting) return;
    this.selEnd = gridPos;
  }

  endSelection(): void {
    if (!this.selecting || !this.selStart || !this.selEnd) return;
    this.selecting = false;

    const minX = Math.min(this.selStart.x, this.selEnd.x);
    const minY = Math.min(this.selStart.y, this.selEnd.y);
    const maxX = Math.max(this.selStart.x, this.selEnd.x);
    const maxY = Math.max(this.selStart.y, this.selEnd.y);
    this.selection = { min: new Vector2(minX, minY), max: new Vector2(maxX, maxY) };
  }

  clearSelection(): void {
    this.selecting = false;
    this.selStart = null;
    this.selEnd = null;
    this.selection = null;
  }

  /** Returns the current selection rectangle for rendering (works during drag too) */
  getSelectionRect(): { min: Vector2; max: Vector2 } | null {
    if (this.selection) return this.selection;
    if (this.selecting && this.selStart && this.selEnd) {
      return {
        min: new Vector2(Math.min(this.selStart.x, this.selEnd.x), Math.min(this.selStart.y, this.selEnd.y)),
        max: new Vector2(Math.max(this.selStart.x, this.selEnd.x), Math.max(this.selStart.y, this.selEnd.y)),
      };
    }
    return null;
  }

  // --- Copy ---

  copySelection(): boolean {
    if (!this.selection) return false;
    const { min, max } = this.selection;
    this.clipboard = [];

    for (let x = min.x; x <= max.x; x++) {
      for (let y = min.y; y <= max.y; y++) {
        const pos = new Vector2(x, y);
        const entity = this.factory.grid.getAt(pos);
        if (entity instanceof Belt) {
          this.clipboard.push({
            offset: new Vector2(x - min.x, y - min.y),
            direction: entity.direction,
            tier: entity.tier,
          });
        }
      }
    }
    return this.clipboard.length > 0;
  }

  // --- Delete selection ---

  deleteSelection(): boolean {
    if (!this.selection) return false;
    const { min, max } = this.selection;
    const toRemove: { entity: import('@/interfaces/IGridPlaceable').IGridPlaceable; pos: Vector2 }[] = [];

    for (let x = min.x; x <= max.x; x++) {
      for (let y = min.y; y <= max.y; y++) {
        const pos = new Vector2(x, y);
        const entity = this.factory.grid.getAt(pos);
        if (entity) {
          toRemove.push({ entity, pos });
        }
      }
    }
    if (toRemove.length === 0) return false;

    this.commandHistory.execute(new BulkRemoveCommand(this.factory, toRemove));
    this.factory.updateBeltShapes();
    this.clearSelection();
    return true;
  }

  // --- Paste ---

  startPaste(): boolean {
    if (this.clipboard.length === 0) return false;
    this.clearSelection();
    this.pasting = true;
    this.pasteOrigin = null;
    return true;
  }

  updatePasteGhost(gridPos: Vector2): void {
    if (!this.pasting) return;
    this.pasteOrigin = gridPos;
  }

  /** Returns ghost positions + validity for rendering */
  getPasteGhost(): { entries: { pos: Vector2; direction: Direction; valid: boolean }[] } | null {
    if (!this.pasting || !this.pasteOrigin) return null;
    const entries = this.clipboard.map(e => {
      const pos = new Vector2(this.pasteOrigin!.x + e.offset.x, this.pasteOrigin!.y + e.offset.y);
      const valid = this.factory.grid.isInBounds(pos) && !this.factory.grid.isOccupied(pos);
      return { pos, direction: e.direction, valid };
    });
    return { entries };
  }

  confirmPaste(): boolean {
    if (!this.pasting || !this.pasteOrigin || this.clipboard.length === 0) return false;

    const belts: Belt[] = [];
    for (const entry of this.clipboard) {
      const pos = new Vector2(this.pasteOrigin.x + entry.offset.x, this.pasteOrigin.y + entry.offset.y);
      if (!this.factory.grid.isInBounds(pos) || this.factory.grid.isOccupied(pos)) continue;
      belts.push(new Belt(pos, entry.direction, entry.tier));
    }
    if (belts.length === 0) return false;

    this.commandHistory.execute(new BulkPlaceCommand(this.factory, belts));
    this.factory.updateBeltShapes();
    // Stay in paste mode for repeated pastes
    return true;
  }

  cancelPaste(): void {
    this.pasting = false;
    this.pasteOrigin = null;
  }

  /** Get blueprint dimensions for ghost rendering */
  getBlueprintSize(): { width: number; height: number } {
    if (this.clipboard.length === 0) return { width: 0, height: 0 };
    let maxX = 0, maxY = 0;
    for (const e of this.clipboard) {
      if (e.offset.x > maxX) maxX = e.offset.x;
      if (e.offset.y > maxY) maxY = e.offset.y;
    }
    return { width: maxX + 1, height: maxY + 1 };
  }
}

// --- Commands ---

class BulkRemoveCommand implements ICommand {
  readonly description = 'Delete selection';
  private removed: { entity: import('@/interfaces/IGridPlaceable').IGridPlaceable; pos: Vector2 }[];

  constructor(private factory: Factory, entities: { entity: import('@/interfaces/IGridPlaceable').IGridPlaceable; pos: Vector2 }[]) {
    this.removed = [...entities];
  }

  execute(): void {
    for (const { entity } of this.removed) {
      this.factory.removeEntity(entity);
    }
  }

  undo(): void {
    for (const { entity, pos } of this.removed) {
      this.factory.grid.place(entity, pos);
    }
    this.factory.updateBeltShapes();
  }
}

class BulkPlaceCommand implements ICommand {
  readonly description = 'Paste blueprint';
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
