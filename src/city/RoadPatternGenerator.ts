import { Vector2 } from '@/utils/Vector2';
import { RoadNetwork } from './RoadNetwork';
import type { CityTypeDefinition } from '@/world/CityType';

/**
 * Generates road patterns for city layouts.
 * Supports grid, boulevard, ring, and organic patterns.
 * Extracted from CityGenerator to follow SRP.
 */

type RoadPattern = 'grid' | 'boulevard' | 'ring' | 'organic';

const CITY_TYPE_ROAD_PATTERN: Record<string, RoadPattern> = {
  forest: 'organic',
  coastal: 'boulevard',
  industrial: 'grid',
  agricultural: 'grid',
  mining: 'organic',
  metropolis: 'grid',
};

export function generateRoads(
  network: RoadNetwork, rng: () => number,
  cityType: CityTypeDefinition, roadComplexity: number,
  W: number, H: number,
): void {
  const pattern = CITY_TYPE_ROAD_PATTERN[cityType.id] ?? 'grid';

  switch (pattern) {
    case 'grid': addGridRoads(network, rng, W, H, roadComplexity); break;
    case 'boulevard': addBoulevardRoads(network, rng, W, H, roadComplexity); break;
    case 'ring': addRingRoads(network, rng, W, H, roadComplexity); break;
    case 'organic': addOrganicRoads(network, rng, W, H, roadComplexity); break;
  }

  if (roadComplexity >= 2) {
    addDeadEnds(network, rng, W, H, 1 + Math.floor(rng() * 3));
  }

  // Thin → reconnect → thin again (reconnection can create new 2x2 blocks)
  thinRoads(network);
  ensureConnectivity(network, W, H);
  thinRoads(network);
}

/** Returns true if placing a road at pos would create a 2-wide parallel segment. */
function wouldCreateDoubleWidth(network: RoadNetwork, pos: Vector2): boolean {
  for (const [ox, oy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
    const a = new Vector2(pos.x + ox, pos.y + oy);
    const b = new Vector2(a.x + 1, a.y);
    const c = new Vector2(a.x, a.y + 1);
    const d = new Vector2(a.x + 1, a.y + 1);
    const isRoadOrSelf = (v: Vector2) => v.equals(pos) || network.isRoad(v);
    if (isRoadOrSelf(a) && isRoadOrSelf(b) && isRoadOrSelf(c) && isRoadOrSelf(d)) {
      return true;
    }
  }
  return false;
}

/** Remove roads that form 2x2 blocks. Pick the cell with fewest neighbors to remove. */
function thinRoads(network: RoadNetwork): void {
  let changed = true;
  while (changed) {
    changed = false;
    const roads = network.getAllRoads();
    for (const pos of roads) {
      if (!network.isRoad(pos)) continue;

      const r = new Vector2(pos.x + 1, pos.y);
      const b = new Vector2(pos.x, pos.y + 1);
      const d = new Vector2(pos.x + 1, pos.y + 1);

      if (network.isRoad(r) && network.isRoad(b) && network.isRoad(d)) {
        const candidates = [pos, r, b, d];
        let bestCell = candidates[0];
        let minNeighbors = Infinity;
        for (const cell of candidates) {
          const n = network.getRoadNeighbors(cell).length;
          if (n < minNeighbors) {
            minNeighbors = n;
            bestCell = cell;
          }
        }
        network.removeRoad(bestCell);
        changed = true;
        break;
      }
    }
  }
}

/** Find disconnected components and bridge them with L-shaped paths. */
function ensureConnectivity(network: RoadNetwork, _W: number, _H: number): void {
  const components = findComponents(network);
  if (components.length <= 1) return;

  const largest = components.reduce((a, b) => a.length > b.length ? a : b);
  const connected = new Set(largest.map(p => p.toKey()));

  for (const comp of components) {
    if (comp === largest) continue;

    let bestDist = Infinity;
    let bestFrom: Vector2 | null = null;
    let bestTo: Vector2 | null = null;

    for (const a of comp) {
      for (const b of largest) {
        const dist = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        if (dist < bestDist) {
          bestDist = dist;
          bestFrom = a;
          bestTo = b;
        }
      }
    }

    if (!bestFrom || !bestTo) continue;

    const dx = bestTo.x > bestFrom.x ? 1 : -1;
    let cx = bestFrom.x;
    while (cx !== bestTo.x) {
      cx += dx;
      const pos = new Vector2(cx, bestFrom.y);
      network.addRoad(pos);
      connected.add(pos.toKey());
    }
    const dy = bestTo.y > bestFrom.y ? 1 : -1;
    let cy = bestFrom.y;
    while (cy !== bestTo.y) {
      cy += dy;
      const pos = new Vector2(bestTo.x, cy);
      network.addRoad(pos);
      connected.add(pos.toKey());
    }

    for (const p of comp) connected.add(p.toKey());
  }
}

/** Flood-fill to find connected components. */
function findComponents(network: RoadNetwork): Vector2[][] {
  const roads = network.getAllRoads();
  const visited = new Set<string>();
  const components: Vector2[][] = [];

  for (const start of roads) {
    if (visited.has(start.toKey())) continue;

    const component: Vector2[] = [];
    const queue = [start];
    visited.add(start.toKey());

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);

      for (const neighbor of network.getRoadNeighbors(current)) {
        const key = neighbor.toKey();
        if (!visited.has(key)) {
          visited.add(key);
          queue.push(neighbor);
        }
      }
    }

    components.push(component);
  }

  return components;
}

/** Grid: horizontal + vertical streets. Complexity adds more streets + jitter. */
function addGridRoads(network: RoadNetwork, rng: () => number, W: number, H: number, complexity: number): void {
  const hCount = (H >= 14 ? 3 : 2) + (complexity >= 3 ? 1 : 0);
  const hSpacing = Math.floor(H / (hCount + 1));
  const hYs: number[] = [];
  for (let i = 1; i <= hCount; i++) {
    const y = i * hSpacing;
    const jitter = complexity >= 1 && i > 1 && i < hCount ? Math.floor(rng() * 3) - 1 : 0;
    hYs.push(Math.max(2, Math.min(H - 3, y + jitter)));
  }

  const vCount = (W >= 20 ? 4 : W >= 16 ? 3 : 2) + (complexity >= 2 ? 1 : 0);
  const vSpacing = Math.floor(W / (vCount + 1));
  const vXs: number[] = [];
  for (let i = 1; i <= vCount; i++) {
    const x = i * vSpacing;
    const jitter = complexity >= 1 && i > 1 && i < vCount ? Math.floor(rng() * 3) - 1 : 0;
    vXs.push(Math.max(2, Math.min(W - 3, x + jitter)));
  }

  const minX = vXs[0];
  const maxX = vXs[vXs.length - 1];
  const minY = hYs[0];
  const maxY = hYs[hYs.length - 1];

  for (const y of hYs) {
    for (let x = minX; x <= maxX; x++) network.addRoad(new Vector2(x, y));
  }
  for (const x of vXs) {
    for (let y = minY; y <= maxY; y++) network.addRoad(new Vector2(x, y));
  }
}

/** Boulevard: one main road + perpendicular side streets. */
function addBoulevardRoads(network: RoadNetwork, rng: () => number, W: number, H: number, complexity: number): void {
  const horizontal = rng() > 0.5;

  if (horizontal) {
    const y = Math.floor(H / 2);
    for (let x = 2; x < W - 2; x++) network.addRoad(new Vector2(x, y));

    const count = 3 + complexity + Math.floor(rng() * 2);
    const spacing = Math.floor((W - 6) / (count + 1));
    for (let i = 1; i <= count; i++) {
      const x = Math.min(2 + i * spacing + Math.floor(rng() * 2), W - 2);
      const top = Math.max(1, y - 2 - Math.floor(rng() * 3));
      const bot = Math.min(H - 2, y + 2 + Math.floor(rng() * 3));
      for (let sy = top; sy <= bot; sy++) network.addRoad(new Vector2(x, sy));
    }
  } else {
    const x = Math.floor(W / 2);
    for (let y = 2; y < H - 2; y++) network.addRoad(new Vector2(x, y));

    const count = 2 + complexity + Math.floor(rng() * 2);
    const spacing = Math.floor((H - 6) / (count + 1));
    for (let i = 1; i <= count; i++) {
      const y = Math.min(2 + i * spacing + Math.floor(rng() * 2), H - 2);
      const left = Math.max(1, x - 2 - Math.floor(rng() * 3));
      const right = Math.min(W - 2, x + 2 + Math.floor(rng() * 3));
      for (let sx = left; sx <= right; sx++) network.addRoad(new Vector2(sx, y));
    }
  }
}

/** Ring: rectangular loop. Complexity adds cross streets inside. */
function addRingRoads(network: RoadNetwork, rng: () => number, W: number, H: number, complexity: number): void {
  const margin = 3 + Math.floor(rng() * 2);
  const x1 = margin;
  const x2 = W - 1 - margin;
  const y1 = margin;
  const y2 = H - 1 - margin;

  if (x2 <= x1 + 2 || y2 <= y1 + 2) return;

  for (let x = x1; x <= x2; x++) network.addRoad(new Vector2(x, y1));
  for (let x = x1; x <= x2; x++) network.addRoad(new Vector2(x, y2));
  for (let y = y1; y <= y2; y++) network.addRoad(new Vector2(x1, y));
  for (let y = y1; y <= y2; y++) network.addRoad(new Vector2(x2, y));

  const crossCount = Math.min(complexity, 2);
  if (crossCount >= 1) {
    const midX = Math.floor((x1 + x2) / 2);
    for (let y = y1; y <= y2; y++) network.addRoad(new Vector2(midX, y));
  }
  if (crossCount >= 2) {
    const midY = Math.floor((y1 + y2) / 2);
    for (let x = x1; x <= x2; x++) network.addRoad(new Vector2(x, midY));
  }
}

/** Organic: winding main road + branches. */
function addOrganicRoads(network: RoadNetwork, rng: () => number, W: number, H: number, complexity: number): void {
  let x = 2;
  let y = Math.floor(H / 2) + Math.floor(rng() * 3) - 1;

  while (x < W - 2) {
    network.addRoad(new Vector2(x, y));
    x++;
    if (rng() > 0.6) {
      const dy = rng() > 0.5 ? 1 : -1;
      const newY = y + dy;
      if (newY >= 2 && newY < H - 2) {
        const stepPos = new Vector2(x, newY);
        if (!wouldCreateDoubleWidth(network, stepPos)) {
          network.addRoad(new Vector2(x, y));
          y = newY;
          network.addRoad(stepPos);
        }
      }
    }
  }
  network.addRoad(new Vector2(x, y));

  const branchCount = 2 + complexity + Math.floor(rng() * 2);
  const roads = network.getAllRoads();
  for (let b = 0; b < branchCount && roads.length > 0; b++) {
    const base = roads[Math.floor(rng() * roads.length)];
    const dir = rng() > 0.5 ? 1 : -1;
    const len = 2 + Math.floor(rng() * (2 + complexity));
    for (let i = 1; i <= len; i++) {
      const by = base.y + i * dir;
      if (by >= 1 && by < H - 1) {
        const pos = new Vector2(base.x, by);
        if (!wouldCreateDoubleWidth(network, pos)) {
          network.addRoad(pos);
        }
      }
    }
  }
}

function addDeadEnds(network: RoadNetwork, rng: () => number, W: number, H: number, count: number): void {
  const roads = network.getAllRoads();
  if (roads.length === 0) return;

  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let i = 0; i < count; i++) {
    const base = roads[Math.floor(rng() * roads.length)];
    const dir = dirs[Math.floor(rng() * 4)];
    const len = 1 + Math.floor(rng() * 3);
    for (let j = 1; j <= len; j++) {
      const nx = base.x + dir[0] * j;
      const ny = base.y + dir[1] * j;
      if (nx >= 1 && nx < W - 1 && ny >= 1 && ny < H - 1) {
        const pos = new Vector2(nx, ny);
        if (!wouldCreateDoubleWidth(network, pos)) {
          network.addRoad(pos);
        }
      }
    }
  }
}
