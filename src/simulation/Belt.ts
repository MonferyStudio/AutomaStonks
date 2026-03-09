import { Vector2 } from '@/utils/Vector2';
import { Direction, directionToVector, oppositeDirection } from '@/utils/Direction';
import type { ITickable } from '@/interfaces/ITickable';
import type { IGridPlaceable } from '@/interfaces/IGridPlaceable';
import type { Grid } from './Grid';
import type { ItemStack } from './ItemStack';

let nextBeltId = 0;

export type BeltShape = 'straight' | 'curve_cw' | 'curve_ccw';

export class Belt implements ITickable, IGridPlaceable {
  readonly id: string;
  position: Vector2;
  direction: Direction;
  tier: number;
  sleeping: boolean = false;

  item: ItemStack | null = null;
  progress: number = 0;
  shape: BeltShape = 'straight';
  inputDirection: Direction;

  constructor(position: Vector2, direction: Direction, tier: number = 1) {
    this.id = `belt_${nextBeltId++}`;
    this.position = position;
    this.direction = direction;
    this.tier = tier;
    this.inputDirection = oppositeDirection(direction);
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

  get outputPosition(): Vector2 {
    return this.position.add(directionToVector(this.direction));
  }

  get inputPosition(): Vector2 {
    return this.position.add(directionToVector(this.inputDirection));
  }

  get speed(): number {
    return this.tier;
  }

  canAcceptItem(): boolean {
    return this.item === null;
  }

  acceptItem(item: ItemStack): boolean {
    if (this.item !== null) return false;
    this.item = item;
    this.progress = 0;
    this.wake();
    return true;
  }

  onTick(_deltaTicks: number): void {
    if (!this.item) {
      this.sleep();
      return;
    }

    this.progress += this.speed;

    if (this.progress >= 10) {
      this.progress = 10;
    }
  }

  isReadyToTransfer(): boolean {
    return this.item !== null && this.progress >= 10;
  }

  extractItem(): ItemStack | null {
    const item = this.item;
    this.item = null;
    this.progress = 0;
    if (!this.item) {
      this.sleep();
    }
    return item;
  }

  updateShape(prevBelt: Belt | null, _nextBelt: Belt | null): void {
    if (!prevBelt) {
      this.shape = 'straight';
      this.inputDirection = oppositeDirection(this.direction);
      return;
    }

    // inputDirection points TOWARD the previous belt's cell
    const dx = prevBelt.position.x - this.position.x;
    const dy = prevBelt.position.y - this.position.y;
    if (dx === -1) this.inputDirection = Direction.Left;
    else if (dx === 1) this.inputDirection = Direction.Right;
    else if (dy === -1) this.inputDirection = Direction.Up;
    else this.inputDirection = Direction.Down;

    // Straight if input and output are on opposite sides
    if (this.inputDirection === oppositeDirection(this.direction)) {
      this.shape = 'straight';
    } else {
      const prevVec = directionToVector(prevBelt.direction);
      const cross = prevVec.x * directionToVector(this.direction).y -
                    prevVec.y * directionToVector(this.direction).x;
      this.shape = cross > 0 ? 'curve_cw' : 'curve_ccw';
    }
  }

  wake(): void {
    this.sleeping = false;
  }

  sleep(): void {
    this.sleeping = true;
  }
}
