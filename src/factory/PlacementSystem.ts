import { Vector2 } from '@/utils/Vector2';
import { Direction, ALL_DIRECTIONS, directionToVector, oppositeDirection, rotateDirectionCW } from '@/utils/Direction';
import type { Factory } from '@/simulation/Factory';
import { Belt } from '@/simulation/Belt';
import { TunnelEntry, TunnelExit } from '@/simulation/Tunnel';
import { Exchanger } from '@/simulation/Exchanger';
import { Machine, type MachineDefinition } from '@/simulation/Machine';
import { IOPort } from './IOPort';
import { CommandHistory } from '@/core/CommandHistory';
import type { ICommand } from '@/interfaces/ICommand';
import { CELL_SIZE_PX, TUNNEL_TIERS } from '@/utils/Constants';
import { isRoadCell, getRoadCellInwardDirection } from '@/simulation/FactoryBorderContext';

export type PlacementTool = 'belt' | 'tunnel' | 'exchanger' | 'machine' | 'delete' | 'entry' | 'exit' | 'select' | 'none';

export class PlacementSystem {
  private factory: Factory;
  private commandHistory: CommandHistory;

  currentTool: PlacementTool = 'none';
  currentBeltTier: number = 1;

  /** Currently selected machine definition for 'machine' tool */
  currentMachineDef: MachineDefinition | null = null;
  /** Current machine rotation (0-3) */
  machineRotation: number = 0;
  /** Factory function to create Machine instances (injected by Game) */
  machineFactory: ((def: MachineDefinition, pos: Vector2) => Machine) | null = null;

  private ghostPosition: Vector2 | null = null;
  private isValid = false;
  private _lastRejection = '';

  /** Callback fired when placement is invalid, with a reason string */
  onPlacementRejected: ((reason: string) => void) | null = null;
  /** Callback fired when an entity is deleted. Receives the entity and its grid position. */
  onEntityDeleted: ((entity: import('@/interfaces/IGridPlaceable').IGridPlaceable, pos: Vector2) => void) | null = null;

  // Drag-paint state
  private isDragging = false;
  private dragCells: Vector2[] = [];
  private lastDragCell: Vector2 | null = null;
  private lastDragDirection: Direction = Direction.Right;
  private justFinishedDrag = false;
  /** Number of NEW belts placed during the current drag (excludes reorients) */
  private _dragBeltsPlaced = 0;

  // Tunnel two-step state
  private pendingTunnelEntry: TunnelEntry | null = null;

  constructor(factory: Factory, commandHistory: CommandHistory) {
    this.factory = factory;
    this.commandHistory = commandHistory;
  }

  setTool(tool: PlacementTool): void {
    this.currentTool = tool;
    this.ghostPosition = null;
    this.cancelDrag();
    // Clear pending tunnel when switching tools
    if (tool !== 'tunnel') {
      this.pendingTunnelEntry = null;
    }
  }

  /** Rotate the current placement direction CW */
  rotateDirection(): void {
    if (this.currentTool === 'machine') {
      this.machineRotation = (this.machineRotation + 1) % 4;
    } else {
      this.lastDragDirection = rotateDirectionCW(this.lastDragDirection);
    }
  }

  get lastDirection(): Direction {
    return this.lastDragDirection;
  }

  /** Number of new belts placed during the last drag (reset on next startDrag) */
  get dragBeltsPlaced(): number {
    return this._dragBeltsPlaced;
  }

  /** Whether we're waiting for the tunnel exit placement */
  get isPlacingTunnelExit(): boolean {
    return this.pendingTunnelEntry !== null;
  }

  /** Get the pending tunnel entry position for ghost rendering */
  get pendingTunnelEntryPos(): Vector2 | null {
    return this.pendingTunnelEntry?.position ?? null;
  }

  get pendingTunnelDir(): Direction | null {
    return this.pendingTunnelEntry?.direction ?? null;
  }

  updateGhost(worldX: number, worldY: number): { position: Vector2; valid: boolean } | null {
    const gridX = Math.floor(worldX / CELL_SIZE_PX);
    const gridY = Math.floor(worldY / CELL_SIZE_PX);
    const pos = new Vector2(gridX, gridY);

    this.ghostPosition = pos;

    switch (this.currentTool) {
      case 'belt': {
        this.isValid = this.factory.grid.isInBounds(pos) && !this.factory.grid.isOccupied(pos);
        break;
      }
      case 'delete': {
        this.isValid = this.factory.grid.isOccupied(pos) || this.factory.hasIOPortAt(pos);
        break;
      }
      case 'tunnel': {
        if (this.pendingTunnelEntry) {
          // Placing exit: must be along the entry's direction axis, within range, and empty
          this.isValid = this.isValidTunnelExit(pos);
        } else {
          // Placing entry: just needs empty cell
          this.isValid = this.factory.grid.isInBounds(pos) && !this.factory.grid.isOccupied(pos);
        }
        break;
      }
      case 'exchanger': {
        const splitter = new Exchanger(pos, this.lastDragDirection, 1);
        this.isValid = splitter.canPlaceAt(this.factory.grid, pos);
        break;
      }
      case 'machine': {
        this.isValid = this.isValidMachinePlacement(pos);
        break;
      }
      case 'entry':
      case 'exit': {
        const ctx = this.factory.borderContext;
        this.isValid = isRoadCell(ctx, pos) && !this.factory.hasIOPortAt(pos);
        break;
      }
      default:
        this.isValid = false;
    }

    // During drag, continue placing belts or deleting
    if (this.isDragging && (this.currentTool === 'belt' || this.currentTool === 'delete')) {
      this.dragTo(pos);
    }

    return { position: pos, valid: this.isValid };
  }

  private isValidTunnelExit(pos: Vector2): boolean {
    if (!this.pendingTunnelEntry) return false;
    if (!this.factory.grid.isInBounds(pos) || this.factory.grid.isOccupied(pos)) return false;

    const entry = this.pendingTunnelEntry;
    const dir = entry.direction;
    const dirVec = directionToVector(dir);

    // Must be along the tunnel direction axis (straight line from entry)
    const diff = pos.subtract(entry.position);
    if (dirVec.x !== 0) {
      // Horizontal tunnel: same y, positive distance in direction
      if (diff.y !== 0) return false;
      if (dirVec.x > 0 && diff.x <= 0) return false;
      if (dirVec.x < 0 && diff.x >= 0) return false;
    } else {
      // Vertical tunnel: same x, positive distance in direction
      if (diff.x !== 0) return false;
      if (dirVec.y > 0 && diff.y <= 0) return false;
      if (dirVec.y < 0 && diff.y >= 0) return false;
    }

    const distance = Math.abs(diff.x) + Math.abs(diff.y);
    const maxRange = TUNNEL_TIERS[entry.tier as keyof typeof TUNNEL_TIERS]?.range ?? 3;
    return distance >= 2 && distance <= maxRange;
  }

  private getEffectiveMachineSize(): { w: number; h: number } {
    const def = this.currentMachineDef;
    if (!def) return { w: 1, h: 1 };
    return this.machineRotation % 2 === 0
      ? { w: def.width, h: def.height }
      : { w: def.height, h: def.width };
  }

  private isValidMachinePlacement(pos: Vector2): boolean {
    if (!this.currentMachineDef) return false;
    const { w, h } = this.getEffectiveMachineSize();
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const cell = new Vector2(pos.x + dx, pos.y + dy);
        if (!this.factory.grid.isInBounds(cell) || this.factory.grid.isOccupied(cell)) return false;
      }
    }
    return true;
  }

  /** Get the cells the current machine tool would occupy at the given position */
  getMachineCells(pos: Vector2): Vector2[] {
    const { w, h } = this.getEffectiveMachineSize();
    const cells: Vector2[] = [];
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        cells.push(new Vector2(pos.x + dx, pos.y + dy));
      }
    }
    return cells;
  }

  // --- Drag Paint ---

  startDrag(worldX: number, worldY: number): void {
    if (this.currentTool !== 'belt' && this.currentTool !== 'delete') return;
    this.isDragging = true;
    this.dragCells = [];
    this.lastDragCell = null;
    this._dragBeltsPlaced = 0;

    const gridX = Math.floor(worldX / CELL_SIZE_PX);
    const gridY = Math.floor(worldY / CELL_SIZE_PX);
    const pos = new Vector2(gridX, gridY);

    if (this.currentTool === 'delete') {
      this.executeDeleteAt(pos);
      this.lastDragCell = pos;
      return;
    }

    // Belt mode
    if (!this.factory.grid.isInBounds(pos)) return;

    if (this.factory.grid.isOccupied(pos)) {
      const entity = this.factory.grid.getAt(pos);
      if (entity instanceof Belt) {
        this.lastDragCell = pos;
        this.lastDragDirection = entity.direction;
      }
      return;
    }

    this.dragCells.push(pos);
    this.lastDragCell = pos;
  }

  private dragTo(pos: Vector2): void {
    if (!this.isDragging) return;

    if (this.currentTool === 'delete') {
      if (!this.lastDragCell || !this.lastDragCell.equals(pos)) {
        this.executeDeleteAt(pos);
        this.lastDragCell = pos;
      }
      return;
    }

    if (!this.lastDragCell) return;
    if (this.lastDragCell.equals(pos)) return;

    const dx = pos.x - this.lastDragCell.x;
    const dy = pos.y - this.lastDragCell.y;
    if (Math.abs(dx) + Math.abs(dy) !== 1) return;

    if (!this.factory.grid.isInBounds(pos)) return;

    const direction = this.vectorToDirection(dx, dy);
    this.lastDragDirection = direction;

    // Check if target cell has an existing belt we can reorient
    const existingAtPos = this.factory.grid.getAt(pos);
    const canPlaceAtPos = !existingAtPos;
    const canReorientPos = existingAtPos instanceof Belt;

    if (!canPlaceAtPos && !canReorientPos) return;

    // Place or reorient the previous drag cell
    if (this.dragCells.length === 1 && this.dragCells[0].equals(this.lastDragCell)) {
      this.placeOrReorientBelt(this.lastDragCell, direction);
      this.dragCells.length = 0;
    }

    this.dragCells.push(pos);
    this.lastDragCell = pos;

    if (this.dragCells.length >= 2) {
      const prev = this.dragCells[this.dragCells.length - 2];
      const curr = this.dragCells[this.dragCells.length - 1];
      const d = this.vectorToDirection(curr.x - prev.x, curr.y - prev.y);
      this.placeOrReorientBelt(prev, d);
      this.dragCells = [curr];
    }

    this.factory.updateBeltShapes();
  }

  endDrag(): void {
    if (!this.isDragging) return;

    if (this.currentTool === 'belt' && this.dragCells.length === 1) {
      this.placeOrReorientBelt(this.dragCells[0], this.lastDragDirection);
    }

    this.isDragging = false;
    this.justFinishedDrag = true;
    this.dragCells = [];
    this.lastDragCell = null;
    this.factory.updateBeltShapes();
  }

  cancelDrag(): void {
    this.isDragging = false;
    this.dragCells = [];
    this.lastDragCell = null;
  }

  get dragging(): boolean {
    return this.isDragging;
  }

  private vectorToDirection(dx: number, dy: number): Direction {
    if (dx === 1) return Direction.Right;
    if (dx === -1) return Direction.Left;
    if (dy === 1) return Direction.Down;
    return Direction.Up;
  }

  private placeOrReorientBelt(pos: Vector2, direction: Direction): void {
    const existing = this.factory.grid.getAt(pos);
    if (existing instanceof Belt) {
      if (existing.direction !== direction) {
        this.commandHistory.execute(new ReorientBeltCommand(existing, direction));
      }
    } else if (!existing) {
      const belt = new Belt(pos, direction, this.currentBeltTier);
      this.commandHistory.execute(new PlaceBeltCommand(this.factory, belt));
      this._dragBeltsPlaced++;
    }
  }

  private executeDeleteAt(pos: Vector2): void {
    const entity = this.factory.grid.getAt(pos) ?? this.factory.getIOPortAt(pos);
    if (entity) {
      this.onEntityDeleted?.(entity, pos);
      this.commandHistory.execute(new RemoveEntityCommand(this.factory, entity, pos));
    }
  }

  inferBeltDirection(pos: Vector2): Direction {
    // Priority 1: If this cell is an exit port's internal target, point toward the exit
    for (const port of this.factory.getIOPorts()) {
      if (port.portType === 'output' && port.internalPosition.equals(pos)) {
        return oppositeDirection(port.direction);
      }
    }

    // Priority 2: Splitter output feeds into this position — continue in splitter's direction
    for (const exchanger of this.factory.getExchangers()) {
      if (exchanger.output0.equals(pos) || exchanger.output1.equals(pos)) {
        return exchanger.direction;
      }
    }

    // Priority 3: Tunnel exit output feeds into this position — continue in exit's direction
    for (const exit of this.factory.getTunnelExits()) {
      if (exit.outputPosition.equals(pos)) {
        return exit.direction;
      }
    }

    // Priority 4: Machine output feeds into this position — continue away from machine
    for (const machine of this.factory.getMachines()) {
      if (machine.getOutputAdjacentCells().some(c => c.equals(pos))) {
        // Find the direction away from the machine center
        for (const dir of ALL_DIRECTIONS) {
          const behind = pos.add(directionToVector(oppositeDirection(dir)));
          if (machine.getCells().some(c => c.add(machine.position).equals(behind))) {
            return dir;
          }
        }
      }
    }

    // Priority 5: Continue from a belt that feeds into this position
    for (const dir of ALL_DIRECTIONS) {
      const neighborPos = pos.add(directionToVector(dir));
      const neighbor = this.factory.grid.getAt(neighborPos);
      if (neighbor instanceof Belt && neighbor.outputPosition.equals(pos)) {
        return neighbor.direction;
      }
    }

    // Priority 5: Adjacent exit port — point toward it
    for (const dir of ALL_DIRECTIONS) {
      const neighborPos = pos.add(directionToVector(dir));
      const port = this.factory.getIOPortAt(neighborPos);
      if (port && port.portType === 'output') return dir;
    }

    // Priority 6: If this cell is a splitter's input, point into the splitter
    for (const exchanger of this.factory.getExchangers()) {
      if (exchanger.input0.equals(pos) || exchanger.input1.equals(pos)) {
        return exchanger.direction;
      }
    }

    // Priority 7: If this cell is a tunnel entry's position's back, point toward it
    for (const entry of this.factory.getTunnelEntries()) {
      const backPos = entry.position.add(directionToVector(oppositeDirection(entry.direction)));
      if (backPos.equals(pos)) {
        return entry.direction;
      }
    }

    // Priority 8: Adjacent machine input — point toward it
    for (const machine of this.factory.getMachines()) {
      if (machine.getInputAdjacentCells().some(c => c.equals(pos))) {
        // Find the direction toward the machine
        for (const dir of ALL_DIRECTIONS) {
          const targetPos = pos.add(directionToVector(dir));
          if (machine.getCells().some(c => c.add(machine.position).equals(targetPos))) {
            return dir;
          }
        }
      }
    }

    // Priority 9: Adjacent belt with no feeder — point toward it
    for (const dir of ALL_DIRECTIONS) {
      const neighborPos = pos.add(directionToVector(dir));
      const neighbor = this.factory.grid.getAt(neighborPos);
      if (neighbor instanceof Belt) {
        let hasPrev = false;
        for (const d2 of ALL_DIRECTIONS) {
          const n2Pos = neighbor.position.add(directionToVector(d2));
          const n2 = this.factory.grid.getAt(n2Pos);
          if (n2 instanceof Belt && n2.outputPosition.equals(neighbor.position)) {
            hasPrev = true;
            break;
          }
        }
        if (!hasPrev) return dir;
      }
    }

    // Priority 9: Adjacent entry port — point away from it
    for (const dir of ALL_DIRECTIONS) {
      const neighborPos = pos.add(directionToVector(dir));
      const port = this.factory.getIOPortAt(neighborPos);
      if (port && port.portType === 'input') {
        return oppositeDirection(dir);
      }
    }

    return this.lastDragDirection;
  }

  // --- Single click execute ---

  private rejectCurrentPlacement(): void {
    const pos = this.ghostPosition!;
    const inBounds = this.factory.grid.isInBounds(pos);
    const occupied = inBounds && this.factory.grid.isOccupied(pos);
    const isRoad = inBounds && isRoadCell(this.factory.borderContext, pos);

    switch (this.currentTool) {
      case 'belt':
        if (!inBounds) this.emitRejection('Out of bounds');
        else if (isRoad) this.emitRejection('Cannot place a belt on a road cell');
        else if (occupied) this.emitRejection('Cell already occupied');
        else this.emitRejection('Cannot place here');
        break;
      case 'exchanger':
        if (!inBounds) this.emitRejection('Out of bounds');
        else if (occupied) this.emitRejection('Cell already occupied');
        else this.emitRejection('Not enough room for the exchanger');
        break;
      case 'entry':
      case 'exit': {
        const label = this.currentTool === 'entry' ? 'an entry' : 'an exit';
        if (!inBounds) this.emitRejection('Out of bounds');
        else if (!isRoad) this.emitRejection(`Place ${label} on a border road cell`);
        else if (this.factory.hasIOPortAt(pos)) this.emitRejection('A port already exists here');
        break;
      }
      case 'tunnel':
        if (!inBounds) this.emitRejection('Out of bounds');
        else if (occupied) this.emitRejection('Cell already occupied');
        else this.emitRejection('Invalid tunnel position');
        break;
      case 'machine':
        if (!inBounds) this.emitRejection('Out of bounds');
        else if (occupied) this.emitRejection('Cell already occupied');
        else this.emitRejection('Not enough room for the machine');
        break;
    }
  }

  private emitRejection(reason: string): void {
    if (reason === this._lastRejection) return;
    this._lastRejection = reason;
    this.onPlacementRejected?.(reason);
  }

  private clearRejection(): void {
    this._lastRejection = '';
  }

  execute(): boolean {
    if (!this.ghostPosition) return false;
    if (!this.isValid) {
      this.rejectCurrentPlacement();
      return false;
    }
    if (this.isDragging) return false;
    if (this.justFinishedDrag) {
      this.justFinishedDrag = false;
      return false;
    }

    this.clearRejection();
    const pos = this.ghostPosition;

    switch (this.currentTool) {
      case 'belt': {
        const direction = this.inferBeltDirection(pos);
        const belt = new Belt(pos, direction, this.currentBeltTier);
        this.commandHistory.execute(new PlaceBeltCommand(this.factory, belt));
        this.factory.updateBeltShapes();
        return true;
      }
      case 'delete': {
        const entity = this.factory.grid.getAt(pos) ?? this.factory.getIOPortAt(pos);
        if (!entity) return false;
        this.onEntityDeleted?.(entity, pos);
        this.commandHistory.execute(new RemoveEntityCommand(this.factory, entity, pos));
        this.factory.updateBeltShapes();
        return true;
      }
      case 'tunnel': {
        if (this.pendingTunnelEntry) {
          // Second click: place exit and link
          const entry = this.pendingTunnelEntry;
          const exit = new TunnelExit(pos, entry.direction);
          entry.pair = exit;
          const cmd = new PlaceTunnelPairCommand(this.factory, entry, exit);
          this.commandHistory.execute(cmd);
          this.pendingTunnelEntry = null;
          this.factory.updateBeltShapes();
          return true;
        } else {
          // First click: create entry but don't place yet, wait for exit
          const direction = this.lastDragDirection;
          this.pendingTunnelEntry = new TunnelEntry(pos, direction, this.currentBeltTier);
          return true;
        }
      }
      case 'exchanger': {
        const direction = this.lastDragDirection;
        const splitter = new Exchanger(pos, direction, this.currentBeltTier);
        if (!splitter.canPlaceAt(this.factory.grid, pos)) return false;
        this.commandHistory.execute(new PlaceExchangerCommand(this.factory, splitter));
        this.factory.updateBeltShapes();
        return true;
      }
      case 'machine': {
        if (!this.isValidMachinePlacement(pos)) return false;
        if (!this.currentMachineDef || !this.machineFactory) return false;
        const machine = this.machineFactory(this.currentMachineDef, pos);
        machine.rotation = this.machineRotation;
        this.commandHistory.execute(new PlaceMachineCommand(this.factory, machine));
        return true;
      }
      case 'entry':
      case 'exit': {
        const ctx = this.factory.borderContext;
        const inwardDir = getRoadCellInwardDirection(ctx, pos);
        if (inwardDir === null) return false;
        const portType = this.currentTool === 'entry' ? 'input' : 'output';
        const port = new IOPort(pos, portType, inwardDir);
        this.commandHistory.execute(new PlaceIOPortCommand(this.factory, port));
        this.factory.updateBeltShapes();
        return true;
      }
    }
    return false;
  }
}

// --- Commands ---

class PlaceBeltCommand implements ICommand {
  readonly description = 'Place belt';
  constructor(private factory: Factory, private belt: Belt) {}
  execute(): void { this.factory.addBelt(this.belt); }
  undo(): void { this.factory.removeEntity(this.belt); this.factory.updateBeltShapes(); }
}

class ReorientBeltCommand implements ICommand {
  readonly description = 'Reorient belt';
  private oldDirection: Direction;
  constructor(private belt: Belt, private newDirection: Direction) {
    this.oldDirection = belt.direction;
  }
  execute(): void { this.belt.direction = this.newDirection; }
  undo(): void { this.belt.direction = this.oldDirection; }
}

class PlaceIOPortCommand implements ICommand {
  readonly description = 'Place IO port';
  constructor(private factory: Factory, private port: IOPort) {}
  execute(): void { this.factory.addIOPort(this.port); }
  undo(): void { this.factory.removeEntity(this.port); this.factory.updateBeltShapes(); }
}

class PlaceTunnelPairCommand implements ICommand {
  readonly description = 'Place tunnel';
  constructor(private factory: Factory, private entry: TunnelEntry, private exit: TunnelExit) {}
  execute(): void {
    this.factory.addTunnelEntry(this.entry);
    this.factory.addTunnelExit(this.exit);
  }
  undo(): void {
    this.factory.removeEntity(this.exit);
    this.factory.removeEntity(this.entry);
    this.factory.updateBeltShapes();
  }
}

class PlaceExchangerCommand implements ICommand {
  readonly description = 'Place exchanger';
  constructor(private factory: Factory, private exchanger: Exchanger) {}
  execute(): void { this.factory.addExchanger(this.exchanger); }
  undo(): void { this.factory.removeEntity(this.exchanger); this.factory.updateBeltShapes(); }
}

class PlaceMachineCommand implements ICommand {
  readonly description = 'Place machine';
  constructor(private factory: Factory, private machine: Machine) {}
  execute(): void { this.factory.addMachine(this.machine); }
  undo(): void { this.factory.removeEntity(this.machine); }
}

class RemoveEntityCommand implements ICommand {
  readonly description = 'Remove entity';
  private entity;
  private position;

  constructor(private factory: Factory, entity: import('@/interfaces/IGridPlaceable').IGridPlaceable, position: Vector2) {
    this.entity = entity;
    this.position = position;
  }

  execute(): void { this.factory.removeEntity(this.entity); this.factory.updateBeltShapes(); }
  undo(): void { this.factory.grid.place(this.entity, this.position); this.factory.updateBeltShapes(); }
}
