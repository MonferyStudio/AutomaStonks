import { Vector2 } from './Vector2';
import { ALL_DIRECTIONS, directionToVector } from './Direction';
import type { Direction } from './Direction';

export class SpatialHash<T> {
  private map = new Map<string, T>();

  get(pos: Vector2): T | undefined {
    return this.map.get(pos.toKey());
  }

  set(pos: Vector2, entity: T): void {
    this.map.set(pos.toKey(), entity);
  }

  delete(pos: Vector2): boolean {
    return this.map.delete(pos.toKey());
  }

  has(pos: Vector2): boolean {
    return this.map.has(pos.toKey());
  }

  getNeighbor(pos: Vector2, dir: Direction): T | undefined {
    const neighborPos = pos.add(directionToVector(dir));
    return this.map.get(neighborPos.toKey());
  }

  getNeighbors(pos: Vector2): Map<Direction, T> {
    const result = new Map<Direction, T>();
    for (const dir of ALL_DIRECTIONS) {
      const neighbor = this.getNeighbor(pos, dir);
      if (neighbor !== undefined) {
        result.set(dir, neighbor);
      }
    }
    return result;
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }

  values(): IterableIterator<T> {
    return this.map.values();
  }

  entries(): IterableIterator<[string, T]> {
    return this.map.entries();
  }

  forEach(callback: (entity: T, key: string) => void): void {
    this.map.forEach(callback);
  }
}
