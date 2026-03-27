import { Vector2 } from '@/utils/Vector2';
import { Direction, directionToVector, oppositeDirection } from '@/utils/Direction';
import type { ITickable } from '@/interfaces/ITickable';
import type { IGridPlaceable } from '@/interfaces/IGridPlaceable';
import type { Grid } from './Grid';
import type { ItemStack } from './ItemStack';

let nextBeltId = 0;

export type BeltShape = 'straight' | 'curve_cw' | 'curve_ccw';

export interface BeltSlot {
  item: ItemStack;
  progress: number;
}

export class Belt implements ITickable, IGridPlaceable {
  readonly id: string;
  position: Vector2;
  direction: Direction;
  tier: number;
  sleeping: boolean = false;

  /** Items on the belt, sorted front-first (index 0 = closest to output) */
  slots: BeltSlot[] = [];
  shape: BeltShape = 'straight';
  inputDirection: Direction;

  constructor(position: Vector2, direction: Direction, tier: number = 1) {
    this.id = `belt_${nextBeltId++}`;
    this.position = position;
    this.direction = direction;
    this.tier = tier;
    this.inputDirection = oppositeDirection(direction);
  }

  /** Front item (compatibility getter) */
  get item(): ItemStack | null {
    return this.slots.length > 0 ? this.slots[0].item : null;
  }

  /** Front item progress (compatibility getter) */
  get progress(): number {
    return this.slots.length > 0 ? this.slots[0].progress : 0;
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
    return this.slots.length === 0;
  }

  acceptItem(item: ItemStack): boolean {
    if (!this.canAcceptItem()) return false;
    this.slots.push({ item, progress: 0 });
    this.wake();
    return true;
  }

  onTick(_deltaTicks: number): void {
    if (this.slots.length === 0) {
      this.sleep();
      return;
    }

    const slot = this.slots[0];
    slot.progress = Math.min(slot.progress + this.speed, 10);
  }

  isReadyToTransfer(): boolean {
    return this.slots.length > 0 && this.slots[0].progress >= 10;
  }

  peekItem(): ItemStack | null {
    return this.slots.length > 0 ? this.slots[0].item : null;
  }

  extractItem(): ItemStack | null {
    if (this.slots.length === 0) return null;
    const front = this.slots.shift()!;
    if (this.slots.length === 0) this.sleep();
    return front.item;
  }

  /** Extract all items (for deletion recovery) */
  extractAllItems(): ItemStack[] {
    const items = this.slots.map(s => s.item);
    this.slots = [];
    this.sleep();
    return items;
  }

  /**
   * @param prevBelt  The belt feeding into this one (if any)
   * @param _nextBelt The belt after this one (unused for now)
   * @param sourceDir Optional override: direction FROM which items arrive (for machine/exchanger sources)
   */
  updateShape(prevBelt: Belt | null, _nextBelt: Belt | null, sourceDir?: Direction): void {
    // Determine inputDirection from prevBelt position or explicit sourceDir
    let feedDir: Direction | null = null;

    if (prevBelt) {
      const dx = prevBelt.position.x - this.position.x;
      const dy = prevBelt.position.y - this.position.y;
      if (dx === -1) feedDir = Direction.Left;
      else if (dx === 1) feedDir = Direction.Right;
      else if (dy === -1) feedDir = Direction.Up;
      else feedDir = Direction.Down;
    } else if (sourceDir !== undefined) {
      feedDir = sourceDir;
    }

    if (feedDir === null) {
      this.shape = 'straight';
      this.inputDirection = oppositeDirection(this.direction);
      return;
    }

    this.inputDirection = feedDir;

    // Straight if input and output are on opposite sides
    if (this.inputDirection === oppositeDirection(this.direction)) {
      this.shape = 'straight';
    } else {
      // Determine curve direction using cross product
      // For belt sources, use prevBelt's direction; for machine sources, use the feed direction (toward this belt)
      const incomingVec = prevBelt
        ? directionToVector(prevBelt.direction)
        : directionToVector(oppositeDirection(feedDir));
      const cross = incomingVec.x * directionToVector(this.direction).y -
                    incomingVec.y * directionToVector(this.direction).x;
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
