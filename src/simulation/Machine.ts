import { Vector2 } from '@/utils/Vector2';
import type { ITickable } from '@/interfaces/ITickable';
import type { IGridPlaceable } from '@/interfaces/IGridPlaceable';
import type { Grid } from './Grid';
import { ItemStack } from './ItemStack';
import { StateMachine, type IState } from './StateMachine';
import type { RecipeDefinition } from './Recipe';
import type { RecipeRegistry } from './RecipeRegistry';
import type { RecipeBook } from './RecipeBook';
import { DUST_RESOURCE_ID } from './Dust';
import { Direction, directionToVector, rotateDirectionCW } from '@/utils/Direction';
import { eventBus } from '@/core/EventBus';

let nextMachineId = 0;

const DIR_FROM_STRING: Record<string, Direction> = {
  up: Direction.Up,
  right: Direction.Right,
  down: Direction.Down,
  left: Direction.Left,
};

export interface MachinePortDefinition {
  /** Local cell x (0-based, relative to machine origin in base orientation) */
  x: number;
  /** Local cell y */
  y: number;
  /** Outward direction (where items come from / go to) */
  direction: 'up' | 'down' | 'left' | 'right';
  /** Port type */
  type: 'input' | 'output';
}

export interface MachineDefinition {
  id: string;
  type: string;
  name: string;
  operationType: string;
  width: number;
  height: number;
  inputSlots: number;
  outputSlots: number;
  color: number;
  cost: number;
  requiredLevel?: number;
  /** Explicit port layout. If omitted, uses edge-based fallback (left=input, right=output). */
  ports?: MachinePortDefinition[];
}

export type MachineState = 'idle' | 'waiting_input' | 'processing' | 'output_ready' | 'blocked';

export class Machine implements ITickable, IGridPlaceable {
  readonly id: string;
  position: Vector2;
  readonly definition: MachineDefinition;
  sleeping: boolean = false;

  /** Rotation: 0=0°, 1=90°CW, 2=180°, 3=270°CW */
  rotation: number = 0;

  inputSlots: (ItemStack | null)[];
  outputSlots: (ItemStack | null)[];
  /** Pending output items waiting for a free output slot (when recipe qty > outputSlots) */
  private pendingOutputs: ItemStack[] = [];

  private stateMachine: StateMachine<Machine>;
  currentRecipe: RecipeDefinition | null = null;
  processingProgress = 0;
  private recipeRegistry: RecipeRegistry;
  private recipeBook: RecipeBook;
  factoryId: string = '';

  /** For assembler machines: the player-selected recipe id. Null = not configured. */
  selectedRecipeId: string | null = null;

  /** Effective width after rotation */
  get effectiveWidth(): number {
    return this.rotation % 2 === 0 ? this.definition.width : this.definition.height;
  }
  /** Effective height after rotation */
  get effectiveHeight(): number {
    return this.rotation % 2 === 0 ? this.definition.height : this.definition.width;
  }

  constructor(
    definition: MachineDefinition,
    position: Vector2,
    recipeRegistry: RecipeRegistry,
    recipeBook: RecipeBook,
  ) {
    this.id = `machine_${nextMachineId++}`;
    this.definition = definition;
    this.position = position;
    this.recipeRegistry = recipeRegistry;
    this.recipeBook = recipeBook;

    this.inputSlots = new Array(definition.inputSlots).fill(null);
    this.outputSlots = new Array(definition.outputSlots).fill(null);

    this.stateMachine = new StateMachine<Machine>(this);
    this.setupStateMachine();
    this.stateMachine.setState('idle');
  }

  private setupStateMachine(): void {
    this.stateMachine
      .addState(new IdleState())
      .addState(new WaitingInputState())
      .addState(new ProcessingState())
      .addState(new OutputReadyState())
      .addState(new BlockedState());

    this.stateMachine.addTransition('idle', 'waiting_input', (m) => m.hasAnyInput());
    this.stateMachine.addTransition('waiting_input', 'processing', (m) => m.tryStartRecipe());
    this.stateMachine.addTransition('waiting_input', 'idle', (m) => !m.hasAnyInput());
    this.stateMachine.addTransition('processing', 'output_ready', (m) => m.processingProgress >= (m.currentRecipe?.processingTicks ?? 10));
    this.stateMachine.addTransition('output_ready', 'idle', (m) => m.outputSlots.every((s) => s === null) && m.pendingOutputs.length === 0);
    this.stateMachine.addTransition('output_ready', 'blocked', (m) => !m.hasOutputSpace());
    this.stateMachine.addTransition('blocked', 'output_ready', (m) => m.hasOutputSpace());
  }

  get state(): string {
    return this.stateMachine.currentStateName;
  }

  getCells(): Vector2[] {
    const cells: Vector2[] = [];
    const w = this.effectiveWidth;
    const h = this.effectiveHeight;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        cells.push(new Vector2(x, y));
      }
    }
    return cells;
  }

  // --- Port system ---

  /** World-space cells just outside the input ports of this machine. */
  getInputAdjacentCells(): Vector2[] {
    if (this.definition.ports) {
      return this.getPortAdjacentCells('input');
    }
    return this.getEdgeAdjacentCells(this.getRotatedDirection(Direction.Left));
  }

  /** World-space cells just outside the output ports of this machine. */
  getOutputAdjacentCells(): Vector2[] {
    if (this.definition.ports) {
      return this.getPortAdjacentCells('output');
    }
    return this.getEdgeAdjacentCells(this.getRotatedDirection(Direction.Right));
  }

  /** Rotate a base direction by the machine's current rotation. */
  private getRotatedDirection(baseDir: Direction): Direction {
    let dir = baseDir;
    for (let i = 0; i < this.rotation; i++) dir = rotateDirectionCW(dir);
    return dir;
  }

  /** Compute world-space adjacent cells for ports of a given type. */
  private getPortAdjacentCells(type: 'input' | 'output'): Vector2[] {
    const ports = this.definition.ports!.filter(p => p.type === type);
    const baseW = this.definition.width;
    const baseH = this.definition.height;

    return ports.map(p => {
      let lx = p.x;
      let ly = p.y;
      let dir = DIR_FROM_STRING[p.direction];
      let curW = baseW;
      let curH = baseH;

      // Apply rotation steps
      for (let i = 0; i < this.rotation; i++) {
        // Rotate position 90° CW within curW × curH bounding box
        const newX = curH - 1 - ly;
        const newY = lx;
        lx = newX;
        ly = newY;
        // Swap dimensions
        const tmp = curW;
        curW = curH;
        curH = tmp;
        // Rotate direction
        dir = rotateDirectionCW(dir);
      }

      const dv = directionToVector(dir);
      return new Vector2(this.position.x + lx + dv.x, this.position.y + ly + dv.y);
    });
  }

  /** Fallback: edge-based adjacent cells for machines without explicit ports. */
  private getEdgeAdjacentCells(dir: Direction): Vector2[] {
    const eW = this.effectiveWidth;
    const eH = this.effectiveHeight;
    const px = this.position.x;
    const py = this.position.y;
    const cells: Vector2[] = [];

    switch (dir) {
      case Direction.Left:
        for (let j = 0; j < eH; j++) cells.push(new Vector2(px - 1, py + j));
        break;
      case Direction.Right:
        for (let j = 0; j < eH; j++) cells.push(new Vector2(px + eW, py + j));
        break;
      case Direction.Up:
        for (let i = 0; i < eW; i++) cells.push(new Vector2(px + i, py - 1));
        break;
      case Direction.Down:
        for (let i = 0; i < eW; i++) cells.push(new Vector2(px + i, py + eH));
        break;
    }
    return cells;
  }

  canPlaceAt(grid: Grid, position: Vector2): boolean {
    return this.getCells()
      .map((c) => c.add(position))
      .every((c) => grid.isInBounds(c) && !grid.isOccupied(c));
  }

  getRotatedCells(rotation: number): Vector2[] {
    let cells = this.getCells();
    for (let i = 0; i < rotation; i++) {
      cells = cells.map((c) => c.rotate90CW());
    }
    return cells;
  }

  /** Whether this machine type requires manual recipe selection (assembler). */
  get needsRecipeSelection(): boolean {
    return this.definition.operationType === 'assemble';
  }

  /** Get the allowed input resource ids based on the selected recipe (assembler only). */
  private getAllowedInputs(): Set<string> | null {
    if (!this.needsRecipeSelection || !this.selectedRecipeId) return null;
    const recipe = this.recipeRegistry.get(this.selectedRecipeId);
    if (!recipe) return null;
    return new Set(recipe.inputs.map(i => i.resourceId));
  }

  canAcceptItem(slotIndex: number = -1, resourceId?: string): boolean {
    // Block input while the machine is busy
    const st = this.state;
    if (st === 'processing' || st === 'output_ready' || st === 'blocked') return false;

    // Assembler without selected recipe rejects everything
    if (this.needsRecipeSelection && !this.selectedRecipeId) return false;

    // Assembler: only accept resources required by the selected recipe
    if (this.needsRecipeSelection && resourceId) {
      const allowed = this.getAllowedInputs();
      if (allowed && !allowed.has(resourceId)) return false;
    }

    if (slotIndex >= 0) {
      const slot = this.inputSlots[slotIndex];
      return slot === null || (resourceId !== undefined && slot.resourceId === resourceId);
    }
    // Accept if there's an empty slot OR a stackable slot with the same resource
    if (this.inputSlots.some((s) => s === null)) return true;
    if (resourceId !== undefined) {
      return this.inputSlots.some((s) => s !== null && s.resourceId === resourceId);
    }
    return false;
  }

  acceptItem(item: ItemStack, slotIndex: number = -1): boolean {
    // Try to stack into an existing slot with the same resource first
    if (slotIndex < 0) {
      const stackIdx = this.inputSlots.findIndex(
        (s) => s !== null && s.resourceId === item.resourceId
      );
      if (stackIdx >= 0) {
        this.inputSlots[stackIdx]!.quantity += item.quantity;
        this.wake();
        return true;
      }
    }

    // Otherwise find an empty slot
    let idx = slotIndex;
    if (idx < 0) {
      idx = this.inputSlots.findIndex((s) => s === null);
    }
    if (idx < 0 || idx >= this.inputSlots.length) return false;
    if (this.inputSlots[idx] !== null) return false;

    this.inputSlots[idx] = item;
    this.wake();
    return true;
  }

  extractOutput(slotIndex: number = -1): ItemStack | null {
    let idx = slotIndex;
    if (idx < 0) {
      idx = this.outputSlots.findIndex((s) => s !== null);
    }
    if (idx < 0 || idx >= this.outputSlots.length) return null;

    const item = this.outputSlots[idx];
    this.outputSlots[idx] = null;

    // Refill from pending buffer if available
    if (this.pendingOutputs.length > 0) {
      const freeIdx = this.outputSlots.findIndex((s) => s === null);
      if (freeIdx >= 0) {
        this.outputSlots[freeIdx] = this.pendingOutputs.shift()!;
      }
    }

    return item;
  }

  hasAnyInput(): boolean {
    return this.inputSlots.some((s) => s !== null);
  }

  hasOutputSpace(): boolean {
    return this.outputSlots.some((s) => s === null);
  }

  tryStartRecipe(): boolean {
    const filledSlots = this.inputSlots.filter((s): s is ItemStack => s !== null);
    if (filledSlots.length === 0) return false;

    // Assembler: use the player-selected recipe directly
    if (this.needsRecipeSelection) {
      if (!this.selectedRecipeId) return false;
      const recipe = this.recipeRegistry.get(this.selectedRecipeId);
      if (!recipe) return false;
      if (this.hasRequiredInputs(recipe)) {
        this.currentRecipe = recipe;
        this.processingProgress = 0;
        return true;
      }
      return false; // Wait for more items
    }

    // Build expanded input list (respecting quantities in slots)
    const inputIds: string[] = [];
    for (const slot of filledSlots) {
      for (let i = 0; i < slot.quantity; i++) {
        inputIds.push(slot.resourceId);
      }
    }

    const recipe = this.recipeRegistry.findRecipe(this.definition.operationType, inputIds);
    if (recipe) {
      // Verify all required quantities are met
      if (this.hasRequiredInputs(recipe)) {
        this.currentRecipe = recipe;
      } else {
        // Not enough items yet — wait for more
        return false;
      }
    } else {
      // Check if current inputs could partially match a recipe (waiting for more items)
      if (this.recipeRegistry.hasPartialMatch(this.definition.operationType, inputIds)) {
        return false; // Wait for more items
      }
      // No possible recipe — produce dust
      this.currentRecipe = this.recipeRegistry.getDustOutputForMachine(this.definition.operationType);
    }

    this.processingProgress = 0;
    return true;
  }

  /** Check that input slots contain at least the quantities required by the recipe. */
  private hasRequiredInputs(recipe: RecipeDefinition): boolean {
    // Build a map of required quantities
    const required = new Map<string, number>();
    for (const inp of recipe.inputs) {
      required.set(inp.resourceId, (required.get(inp.resourceId) ?? 0) + inp.quantity);
    }
    // Build a map of available quantities
    const available = new Map<string, number>();
    for (const slot of this.inputSlots) {
      if (slot) {
        available.set(slot.resourceId, (available.get(slot.resourceId) ?? 0) + slot.quantity);
      }
    }
    // Check all requirements are met
    for (const [resId, qty] of required) {
      if ((available.get(resId) ?? 0) < qty) return false;
    }
    return true;
  }

  /** Called by OutputReadyState when processing→output_ready transition fires. */
  finishProcessing(): void {
    if (!this.currentRecipe) return;

    // Consume exact quantities required by the recipe
    for (const inp of this.currentRecipe.inputs) {
      let remaining = inp.quantity;
      for (let i = 0; i < this.inputSlots.length && remaining > 0; i++) {
        const slot = this.inputSlots[i];
        if (slot && slot.resourceId === inp.resourceId) {
          const consume = Math.min(slot.quantity, remaining);
          slot.quantity -= consume;
          remaining -= consume;
          if (slot.quantity <= 0) {
            this.inputSlots[i] = null;
          }
        }
      }
    }
    // For dust recipes (no explicit inputs), clear all slots
    if (this.currentRecipe.inputs.length === 0) {
      for (let i = 0; i < this.inputSlots.length; i++) {
        this.inputSlots[i] = null;
      }
    }

    for (const output of this.currentRecipe.outputs) {
      // Emit individual items (quantity 1 each) into separate output slots
      for (let q = 0; q < output.quantity; q++) {
        const slotIdx = this.outputSlots.findIndex((s) => s === null);
        if (slotIdx >= 0) {
          this.outputSlots[slotIdx] = new ItemStack(output.resourceId, 1);
        } else {
          // No free slot — buffer for later
          this.pendingOutputs.push(new ItemStack(output.resourceId, 1));
        }
      }
    }

    if (!this.currentRecipe.id.startsWith('dust_')) {
      this.recipeBook.discover(this.currentRecipe.id);
      eventBus.emit('ItemProduced', {
        factoryId: this.factoryId,
        recipeId: this.currentRecipe.id,
        itemId: this.currentRecipe.outputs[0]?.resourceId ?? DUST_RESOURCE_ID,
        quantity: this.currentRecipe.outputs[0]?.quantity ?? 1,
      });
    }

    this.currentRecipe = null;
    this.processingProgress = 0;
  }

  onTick(deltaTicks: number): void {
    const prevState = this.state;
    if (this.state === 'processing' && this.currentRecipe) {
      this.processingProgress += deltaTicks;
    }
    this.stateMachine.update(deltaTicks);
    if (this.state !== prevState) {
      console.log(`[Machine ${this.id}] ${prevState} → ${this.state} | inputs=${this.inputSlots.map(s => s?.resourceId ?? '-')} outputs=${this.outputSlots.map(s => s?.resourceId ?? '-')}`);
    }
  }

  wake(): void { this.sleeping = false; }
  sleep(): void { this.sleeping = true; }
}

class IdleState implements IState<Machine> {
  readonly name = 'idle';
  enter(m: Machine): void {
    if (!m.hasAnyInput()) m.sleep();
  }
  update(): void {}
  exit(m: Machine): void { m.wake(); }
}

class WaitingInputState implements IState<Machine> {
  readonly name = 'waiting_input';
  enter(): void {}
  update(): void {}
  exit(): void {}
}

class ProcessingState implements IState<Machine> {
  readonly name = 'processing';
  enter(): void {}
  update(): void {}
  exit(): void {}
}

class OutputReadyState implements IState<Machine> {
  readonly name = 'output_ready';
  enter(m: Machine): void { m.finishProcessing(); }
  update(): void {}
  exit(): void {}
}

class BlockedState implements IState<Machine> {
  readonly name = 'blocked';
  enter(): void {}
  update(): void {}
  exit(): void {}
}
