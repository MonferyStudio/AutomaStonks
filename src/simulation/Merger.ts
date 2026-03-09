import { Vector2 } from '@/utils/Vector2';
import { Direction, directionToVector, rotateDirectionCW, rotateDirectionCCW } from '@/utils/Direction';
import type { ITickable } from '@/interfaces/ITickable';
import type { IGridPlaceable } from '@/interfaces/IGridPlaceable';
import type { Grid } from './Grid';
import type { ItemStack } from './ItemStack';

let nextMergerId = 0;

export class Merger implements ITickable, IGridPlaceable {
  readonly id: string;
  position: Vector2;
  direction: Direction;
  sleeping: boolean = false;

  item: ItemStack | null = null;
  private inputToggle = false;

  constructor(position: Vector2, direction: Direction) {
    this.id = `merger_${nextMergerId++}`;
    this.position = position;
    this.direction = direction;
  }

  getCells(): Vector2[] {
    const perpCW = directionToVector(rotateDirectionCW(this.direction));
    return [Vector2.ZERO, perpCW];
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

  get outputPosition(): Vector2 {
    return this.position.add(directionToVector(this.direction));
  }

  get inputLeftPosition(): Vector2 {
    const inDir = rotateDirectionCCW(this.direction);
    return this.position.add(directionToVector(inDir));
  }

  get inputRightPosition(): Vector2 {
    const inDir = rotateDirectionCW(this.direction);
    const perpCW = directionToVector(rotateDirectionCW(this.direction));
    return this.position.add(perpCW).add(directionToVector(inDir));
  }

  canAcceptItem(): boolean {
    return this.item === null;
  }

  acceptItem(item: ItemStack): boolean {
    if (this.item !== null) return false;
    this.item = item;
    this.wake();
    return true;
  }

  extractItem(): ItemStack | null {
    const item = this.item;
    this.item = null;
    this.sleep();
    return item;
  }

  get preferredInput(): 'left' | 'right' {
    this.inputToggle = !this.inputToggle;
    return this.inputToggle ? 'left' : 'right';
  }

  onTick(_deltaTicks: number): void {
    if (!this.item) this.sleep();
  }

  wake(): void { this.sleeping = false; }
  sleep(): void { this.sleeping = true; }
}
