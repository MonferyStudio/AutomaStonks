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
import { eventBus } from '@/core/EventBus';

let nextMachineId = 0;

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
}

export type MachineState = 'idle' | 'waiting_input' | 'processing' | 'output_ready' | 'blocked';

export class Machine implements ITickable, IGridPlaceable {
  readonly id: string;
  position: Vector2;
  readonly definition: MachineDefinition;
  sleeping: boolean = false;

  inputSlots: (ItemStack | null)[];
  outputSlots: (ItemStack | null)[];

  private stateMachine: StateMachine<Machine>;
  private currentRecipe: RecipeDefinition | null = null;
  private processingProgress = 0;
  private recipeRegistry: RecipeRegistry;
  private recipeBook: RecipeBook;
  factoryId: string = '';

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
    this.stateMachine.addTransition('output_ready', 'blocked', (m) => !m.hasOutputSpace());
    this.stateMachine.addTransition('output_ready', 'idle', (m) => m.outputSlots.every((s) => s === null));
    this.stateMachine.addTransition('blocked', 'output_ready', (m) => m.hasOutputSpace());
  }

  get state(): string {
    return this.stateMachine.currentStateName;
  }

  getCells(): Vector2[] {
    const cells: Vector2[] = [];
    for (let y = 0; y < this.definition.height; y++) {
      for (let x = 0; x < this.definition.width; x++) {
        cells.push(new Vector2(x, y));
      }
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

  canAcceptItem(slotIndex: number = -1): boolean {
    if (slotIndex >= 0) return this.inputSlots[slotIndex] === null;
    return this.inputSlots.some((s) => s === null);
  }

  acceptItem(item: ItemStack, slotIndex: number = -1): boolean {
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
    return item;
  }

  hasAnyInput(): boolean {
    return this.inputSlots.some((s) => s !== null);
  }

  hasOutputSpace(): boolean {
    return this.outputSlots.some((s) => s === null);
  }

  tryStartRecipe(): boolean {
    const inputIds = this.inputSlots
      .filter((s): s is ItemStack => s !== null)
      .map((s) => s.resourceId);

    if (inputIds.length === 0) return false;

    const recipe = this.recipeRegistry.findRecipe(this.definition.operationType, inputIds);
    if (recipe) {
      this.currentRecipe = recipe;
    } else {
      this.currentRecipe = this.recipeRegistry.getDustOutputForMachine(this.definition.operationType);
    }

    this.processingProgress = 0;
    return true;
  }

  private completeRecipe(): void {
    if (!this.currentRecipe) return;

    for (let i = 0; i < this.inputSlots.length; i++) {
      this.inputSlots[i] = null;
    }

    for (const output of this.currentRecipe.outputs) {
      const slotIdx = this.outputSlots.findIndex((s) => s === null);
      if (slotIdx >= 0) {
        this.outputSlots[slotIdx] = new ItemStack(output.resourceId, output.quantity);
      }
    }

    if (this.currentRecipe.id.startsWith('dust_')) {
      // Invalid recipe produced dust
    } else {
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
    if (this.state === 'processing' && this.currentRecipe) {
      this.processingProgress += deltaTicks;
      if (this.processingProgress >= this.currentRecipe.processingTicks) {
        this.completeRecipe();
      }
    }
    this.stateMachine.update(deltaTicks);
  }

  wake(): void { this.sleeping = false; }
  sleep(): void { this.sleeping = true; }
}

class IdleState implements IState<Machine> {
  readonly name = 'idle';
  enter(m: Machine): void { m.sleep(); }
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
  enter(): void {}
  update(): void {}
  exit(): void {}
}

class BlockedState implements IState<Machine> {
  readonly name = 'blocked';
  enter(): void {}
  update(): void {}
  exit(): void {}
}
