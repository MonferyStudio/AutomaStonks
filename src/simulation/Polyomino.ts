import { Vector2 } from '@/utils/Vector2';
import { POLYOMINO_MAX_BBOX } from '@/utils/Constants';

export class Polyomino {
  readonly cells: readonly Vector2[];
  readonly cellCount: number;
  readonly boundingBox: { width: number; height: number };
  private cellSet: Set<string>;

  constructor(cells: Vector2[]) {
    const normalized = Polyomino.normalize(cells);
    this.cells = Object.freeze(normalized);
    this.cellCount = normalized.length;
    this.cellSet = new Set(normalized.map((c) => c.toKey()));

    let maxX = 0;
    let maxY = 0;
    for (const cell of normalized) {
      if (cell.x > maxX) maxX = cell.x;
      if (cell.y > maxY) maxY = cell.y;
    }
    this.boundingBox = { width: maxX + 1, height: maxY + 1 };
  }

  hasCell(pos: Vector2): boolean {
    return this.cellSet.has(pos.toKey());
  }

  hasCellAt(x: number, y: number): boolean {
    return this.cellSet.has(`${x},${y}`);
  }

  rotate90CW(): Polyomino {
    const rotated = this.cells.map((c) => new Vector2(-c.y, c.x));
    return new Polyomino(rotated);
  }

  rotate90CCW(): Polyomino {
    const rotated = this.cells.map((c) => new Vector2(c.y, -c.x));
    return new Polyomino(rotated);
  }

  rotate180(): Polyomino {
    const rotated = this.cells.map((c) => new Vector2(-c.x, -c.y));
    return new Polyomino(rotated);
  }

  mirror(): Polyomino {
    const mirrored = this.cells.map((c) => new Vector2(-c.x, c.y));
    return new Polyomino(mirrored);
  }

  getAllRotations(): Polyomino[] {
    const rotations: Polyomino[] = [this];
    let current: Polyomino = this;
    for (let i = 0; i < 3; i++) {
      current = current.rotate90CW();
      if (!rotations.some((r) => r.equals(current))) {
        rotations.push(current);
      }
    }
    return rotations;
  }

  getExteriorEdges(): { cell: Vector2; direction: Vector2 }[] {
    const edges: { cell: Vector2; direction: Vector2 }[] = [];
    const neighbors = [Vector2.UP, Vector2.DOWN, Vector2.LEFT, Vector2.RIGHT];

    for (const cell of this.cells) {
      for (const dir of neighbors) {
        const neighbor = cell.add(dir);
        if (!this.hasCell(neighbor)) {
          edges.push({ cell, direction: dir });
        }
      }
    }
    return edges;
  }

  isConnected(): boolean {
    if (this.cellCount <= 1) return true;

    const visited = new Set<string>();
    const queue: Vector2[] = [this.cells[0]];
    visited.add(this.cells[0].toKey());

    const neighbors = [Vector2.UP, Vector2.DOWN, Vector2.LEFT, Vector2.RIGHT];

    while (queue.length > 0) {
      const current = queue.pop()!;
      for (const dir of neighbors) {
        const neighbor = current.add(dir);
        const key = neighbor.toKey();
        if (this.cellSet.has(key) && !visited.has(key)) {
          visited.add(key);
          queue.push(neighbor);
        }
      }
    }

    return visited.size === this.cellCount;
  }

  fitsInBoundingBox(): boolean {
    return (
      this.boundingBox.width <= POLYOMINO_MAX_BBOX &&
      this.boundingBox.height <= POLYOMINO_MAX_BBOX
    );
  }

  isValid(): boolean {
    return this.cellCount > 0 && this.isConnected() && this.fitsInBoundingBox();
  }

  equals(other: Polyomino): boolean {
    if (this.cellCount !== other.cellCount) return false;
    for (const cell of this.cells) {
      if (!other.hasCell(cell)) return false;
    }
    return true;
  }

  toKey(): string {
    return this.cells
      .map((c) => c.toKey())
      .sort()
      .join('|');
  }

  static normalize(cells: Vector2[]): Vector2[] {
    if (cells.length === 0) return [];
    let minX = Infinity;
    let minY = Infinity;
    for (const c of cells) {
      if (c.x < minX) minX = c.x;
      if (c.y < minY) minY = c.y;
    }
    return cells.map((c) => new Vector2(c.x - minX, c.y - minY));
  }

  static fromPattern(pattern: string): Polyomino {
    const cells: Vector2[] = [];
    const lines = pattern.trim().split('\n');
    for (let y = 0; y < lines.length; y++) {
      for (let x = 0; x < lines[y].length; x++) {
        if (lines[y][x] === 'X' || lines[y][x] === '#') {
          cells.push(new Vector2(x, y));
        }
      }
    }
    return new Polyomino(cells);
  }
}
