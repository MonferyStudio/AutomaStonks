import { Vector2 } from '@/utils/Vector2';
import { Direction, directionToVector, rotateDirectionCW, rotateDirectionCCW, oppositeDirection } from '@/utils/Direction';
import type { ITickable } from '@/interfaces/ITickable';
import type { IGridPlaceable } from '@/interfaces/IGridPlaceable';
import type { Grid } from './Grid';
import type { ItemStack } from './ItemStack';

let nextSplitterId = 0;

export type SplitterMode = 'alternate' | 'filter' | 'ratio';

/**
 * Unified splitter/merger (Factorio-style).
 * 1x2 entity perpendicular to flow direction.
 * 2 input lanes (back) + 2 output lanes (front).
 * Acts as splitter, merger, or passthrough depending on belt connections.
 */
export class Splitter implements ITickable, IGridPlaceable {
  readonly id: string;
  position: Vector2;
  direction: Direction;
  tier: number;
  sleeping: boolean = false;
  mode: SplitterMode = 'alternate';

  /** Items on lane 0 (left) and lane 1 (right) */
  lane0: ItemStack | null = null;
  lane1: ItemStack | null = null;
  outputToggle = false;
  filterResourceId: string | null = null;
  ratio: [number, number] = [1, 1];
  private ratioCounter = 0;

  constructor(position: Vector2, direction: Direction, tier: number = 1) {
    this.id = `splitter_${nextSplitterId++}`;
    this.position = position;
    this.direction = direction;
    this.tier = tier;
  }

  /** Cells are perpendicular to direction: origin + one step CW */
  getCells(): Vector2[] {
    const perp = directionToVector(rotateDirectionCW(this.direction));
    return [Vector2.ZERO, perp];
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

  /** Position of lane 0 cell (this.position) */
  get cell0(): Vector2 { return this.position; }
  /** Position of lane 1 cell (perpendicular offset) */
  get cell1(): Vector2 {
    return this.position.add(directionToVector(rotateDirectionCW(this.direction)));
  }

  /** Input position for lane 0 (behind cell0) */
  get input0(): Vector2 {
    return this.cell0.add(directionToVector(oppositeDirection(this.direction)));
  }
  /** Input position for lane 1 (behind cell1) */
  get input1(): Vector2 {
    return this.cell1.add(directionToVector(oppositeDirection(this.direction)));
  }
  /** Output position for lane 0 (in front of cell0) */
  get output0(): Vector2 {
    return this.cell0.add(directionToVector(this.direction));
  }
  /** Output position for lane 1 (in front of cell1) */
  get output1(): Vector2 {
    return this.cell1.add(directionToVector(this.direction));
  }

  canAcceptItem(lane: 0 | 1 = 0): boolean {
    return lane === 0 ? this.lane0 === null : this.lane1 === null;
  }

  acceptItem(item: ItemStack, lane: 0 | 1 = 0): boolean {
    if (lane === 0) {
      if (this.lane0 !== null) return false;
      this.lane0 = item;
    } else {
      if (this.lane1 !== null) return false;
      this.lane1 = item;
    }
    this.wake();
    return true;
  }

  getOutputSide(): 'left' | 'right' {
    switch (this.mode) {
      case 'alternate':
        return this.outputToggle ? 'right' : 'left';
      case 'filter': {
        const item = this.lane0 ?? this.lane1;
        if (item && this.filterResourceId && item.resourceId === this.filterResourceId) {
          return 'left';
        }
        return 'right';
      }
      case 'ratio': {
        const total = this.ratio[0] + this.ratio[1];
        const side = this.ratioCounter < this.ratio[0] ? 'left' : 'right';
        this.ratioCounter = (this.ratioCounter + 1) % total;
        return side;
      }
    }
  }

  onTick(_deltaTicks: number): void {
    if (!this.lane0 && !this.lane1) {
      this.sleep();
    }
  }

  extractItem(lane: 0 | 1): ItemStack | null {
    if (lane === 0) {
      const item = this.lane0;
      this.lane0 = null;
      if (!this.lane0 && !this.lane1) this.sleep();
      return item;
    } else {
      const item = this.lane1;
      this.lane1 = null;
      if (!this.lane0 && !this.lane1) this.sleep();
      return item;
    }
  }

  wake(): void { this.sleeping = false; }
  sleep(): void { this.sleeping = true; }
}
