import { Vector2 } from '@/utils/Vector2';
import { SpatialHash } from '@/utils/SpatialHash';
import { Polyomino } from './Polyomino';
import type { IGridPlaceable } from '@/interfaces/IGridPlaceable';
import { FACTORY_CELL_RATIO } from '@/utils/Constants';

export class Grid {
  readonly shape: Polyomino;
  readonly cellSize: number;
  private entities = new SpatialHash<IGridPlaceable>();
  private shapeMask: Set<string>;

  constructor(shape: Polyomino, cellSize: number = FACTORY_CELL_RATIO) {
    this.shape = shape;
    this.cellSize = cellSize;
    this.shapeMask = new Set<string>();
    this.buildMask();
  }

  private buildMask(): void {
    for (const cell of this.shape.cells) {
      for (let dy = 0; dy < this.cellSize; dy++) {
        for (let dx = 0; dx < this.cellSize; dx++) {
          const x = cell.x * this.cellSize + dx;
          const y = cell.y * this.cellSize + dy;
          this.shapeMask.add(`${x},${y}`);
        }
      }
    }
  }

  isInBounds(pos: Vector2): boolean {
    return this.shapeMask.has(pos.toKey());
  }

  isOccupied(pos: Vector2): boolean {
    return this.entities.has(pos);
  }

  getAt(pos: Vector2): IGridPlaceable | undefined {
    return this.entities.get(pos);
  }

  canPlace(entity: IGridPlaceable, position: Vector2): boolean {
    const cells = entity.getCells().map((c) => c.add(position));
    for (const cell of cells) {
      if (!this.isInBounds(cell)) return false;
      if (this.entities.has(cell)) return false;
    }
    return true;
  }

  place(entity: IGridPlaceable, position: Vector2): boolean {
    if (!this.canPlace(entity, position)) return false;

    entity.position = position;
    const cells = entity.getCells().map((c) => c.add(position));
    for (const cell of cells) {
      this.entities.set(cell, entity);
    }
    return true;
  }

  remove(entity: IGridPlaceable): void {
    const cells = entity.getCells().map((c) => c.add(entity.position));
    for (const cell of cells) {
      this.entities.delete(cell);
    }
  }

  getAllEntities(): Set<IGridPlaceable> {
    const result = new Set<IGridPlaceable>();
    for (const entity of this.entities.values()) {
      result.add(entity);
    }
    return result;
  }

  getExteriorBorderCells(): Vector2[] {
    const result: Vector2[] = [];
    const directions = [Vector2.UP, Vector2.DOWN, Vector2.LEFT, Vector2.RIGHT];

    for (const key of this.shapeMask) {
      const pos = Vector2.fromKey(key);
      for (const dir of directions) {
        const neighbor = pos.add(dir);
        if (!this.shapeMask.has(neighbor.toKey())) {
          result.push(pos);
          break;
        }
      }
    }
    return result;
  }

  get width(): number {
    return this.shape.boundingBox.width * this.cellSize;
  }

  get height(): number {
    return this.shape.boundingBox.height * this.cellSize;
  }

  get totalCells(): number {
    return this.shapeMask.size;
  }

  clear(): void {
    this.entities.clear();
  }
}
