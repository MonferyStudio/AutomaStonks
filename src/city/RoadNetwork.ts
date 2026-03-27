import { Vector2 } from '@/utils/Vector2';
import { ALL_DIRECTIONS, directionToVector, type Direction } from '@/utils/Direction';

export class RoadNetwork {
  private roads = new Set<string>();
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  addRoad(pos: Vector2): void {
    if (this.inBounds(pos)) {
      this.roads.add(pos.toKey());
    }
  }

  removeRoad(pos: Vector2): void {
    this.roads.delete(pos.toKey());
  }

  isRoad(pos: Vector2): boolean {
    return this.roads.has(pos.toKey());
  }

  inBounds(pos: Vector2): boolean {
    return pos.x >= 0 && pos.x < this.width && pos.y >= 0 && pos.y < this.height;
  }

  getRoadNeighbors(pos: Vector2): Vector2[] {
    const neighbors: Vector2[] = [];
    for (const dir of ALL_DIRECTIONS) {
      const neighbor = pos.add(directionToVector(dir));
      if (this.isRoad(neighbor)) {
        neighbors.push(neighbor);
      }
    }
    return neighbors;
  }

  isAdjacentToRoad(pos: Vector2): boolean {
    return this.getRoadNeighbors(pos).length > 0;
  }

  findPath(from: Vector2, to: Vector2): Vector2[] | null {
    if (!this.isRoad(from) || !this.isRoad(to)) return null;

    const fromKey = from.toKey();
    const toKey = to.toKey();
    if (fromKey === toKey) return [from];

    // node map: key → { pos, g, f, parent key }
    const allNodes = new Map<string, { pos: Vector2; g: number; f: number; parent: string | null }>();
    const openKeys = new Set<string>();
    const closedKeys = new Set<string>();

    allNodes.set(fromKey, { pos: from, g: 0, f: from.manhattanDistance(to), parent: null });
    openKeys.add(fromKey);

    while (openKeys.size > 0) {
      // Pick open node with lowest f
      let bestKey = '';
      let bestF = Infinity;
      for (const key of openKeys) {
        const n = allNodes.get(key)!;
        if (n.f < bestF) { bestF = n.f; bestKey = key; }
      }

      if (bestKey === toKey) {
        // Reconstruct path
        const path: Vector2[] = [];
        let cur: string | null = bestKey;
        while (cur !== null) {
          path.push(allNodes.get(cur)!.pos);
          cur = allNodes.get(cur)!.parent;
        }
        path.reverse();
        return path;
      }

      openKeys.delete(bestKey);
      closedKeys.add(bestKey);
      const current = allNodes.get(bestKey)!;

      for (const neighbor of this.getRoadNeighbors(current.pos)) {
        const nKey = neighbor.toKey();
        if (closedKeys.has(nKey)) continue;

        const g = current.g + 1;
        const existing = allNodes.get(nKey);

        if (!existing || g < existing.g) {
          allNodes.set(nKey, {
            pos: neighbor,
            g,
            f: g + neighbor.manhattanDistance(to),
            parent: bestKey,
          });
          openKeys.add(nKey);
        }
      }
    }

    return null;
  }

  getPathDistance(from: Vector2, to: Vector2): number {
    const path = this.findPath(from, to);
    return path ? path.length - 1 : -1;
  }

  getAllRoads(): Vector2[] {
    return [...this.roads].map((key) => Vector2.fromKey(key));
  }

  get roadCount(): number {
    return this.roads.size;
  }

  get gridWidth(): number {
    return this.width;
  }

  get gridHeight(): number {
    return this.height;
  }
}
