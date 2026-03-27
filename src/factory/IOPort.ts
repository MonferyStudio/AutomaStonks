import { Vector2 } from '@/utils/Vector2';
import { Direction, directionToVector } from '@/utils/Direction';
import type { IGridPlaceable } from '@/interfaces/IGridPlaceable';
import type { Grid } from '@/simulation/Grid';
import { ItemStack } from '@/simulation/ItemStack';

let nextPortId = 0;

export type IOPortType = 'input' | 'output';

export class IOPort implements IGridPlaceable {
  readonly id: string;
  position: Vector2;
  readonly portType: IOPortType;
  readonly direction: Direction;
  resourceFilter: string | null = null;

  /** Single-item buffer for input ports */
  buffer: ItemStack | null = null;
  /** Multi-item buffer for output ports */
  bufferQueue: ItemStack[] = [];
  readonly bufferSize: number = 10;

  constructor(position: Vector2, portType: IOPortType, direction: Direction) {
    this.id = `ioport_${nextPortId++}`;
    this.position = position;
    this.portType = portType;
    this.direction = direction;
  }

  getCells(): Vector2[] {
    return [Vector2.ZERO];
  }

  canPlaceAt(grid: Grid, position: Vector2): boolean {
    return grid.isInBounds(position) && !grid.isOccupied(position);
  }

  getRotatedCells(_rotation: number): Vector2[] {
    return [Vector2.ZERO];
  }

  get internalPosition(): Vector2 {
    return this.position.add(directionToVector(this.direction));
  }

  /** Total quantity of items in the output buffer */
  get bufferCount(): number {
    return this.bufferQueue.reduce((sum, s) => sum + s.quantity, 0);
  }

  canAcceptItem(): boolean {
    if (this.portType === 'input') {
      return this.buffer === null;
    }
    // Output port: check buffer capacity
    return this.bufferCount < this.bufferSize;
  }

  acceptItem(item: ItemStack): boolean {
    if (this.resourceFilter && item.resourceId !== this.resourceFilter) return false;

    if (this.portType === 'input') {
      if (this.buffer !== null) return false;
      this.buffer = item;
      return true;
    }

    // Output port: stack into buffer queue
    if (this.bufferCount >= this.bufferSize) return false;
    const existing = this.bufferQueue.find(s => s.resourceId === item.resourceId);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      this.bufferQueue.push(new ItemStack(item.resourceId, item.quantity));
    }
    return true;
  }

  /** Extract one item (qty 1) from the port */
  extractItem(): ItemStack | null {
    if (this.portType === 'input') {
      const item = this.buffer;
      this.buffer = null;
      return item;
    }

    // Output port: extract 1 from the first stack
    if (this.bufferQueue.length === 0) return null;
    const stack = this.bufferQueue[0];
    const item = new ItemStack(stack.resourceId, 1);
    stack.quantity--;
    if (stack.quantity <= 0) {
      this.bufferQueue.shift();
    }
    return item;
  }

  hasItem(): boolean {
    if (this.portType === 'input') {
      return this.buffer !== null;
    }
    return this.bufferQueue.length > 0;
  }
}
