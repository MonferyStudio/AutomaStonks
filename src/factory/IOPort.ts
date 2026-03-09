import { Vector2 } from '@/utils/Vector2';
import { Direction, directionToVector } from '@/utils/Direction';
import type { IGridPlaceable } from '@/interfaces/IGridPlaceable';
import type { Grid } from '@/simulation/Grid';
import type { ItemStack } from '@/simulation/ItemStack';

let nextPortId = 0;

export type IOPortType = 'input' | 'output';

export class IOPort implements IGridPlaceable {
  readonly id: string;
  position: Vector2;
  readonly portType: IOPortType;
  readonly direction: Direction;
  resourceFilter: string | null = null;

  buffer: ItemStack | null = null;
  readonly bufferSize: number = 5;
  private bufferCount = 0;

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

  canAcceptItem(): boolean {
    return this.portType === 'input' && this.buffer === null;
  }

  acceptItem(item: ItemStack): boolean {
    if (!this.canAcceptItem()) return false;
    if (this.resourceFilter && item.resourceId !== this.resourceFilter) return false;
    this.buffer = item;
    this.bufferCount++;
    return true;
  }

  extractItem(): ItemStack | null {
    const item = this.buffer;
    this.buffer = null;
    return item;
  }

  hasItem(): boolean {
    return this.buffer !== null;
  }
}
