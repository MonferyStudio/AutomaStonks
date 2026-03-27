import { Vector2 } from '@/utils/Vector2';

let nextRouteId = 0;

export type RouteEndpointType = 'storage' | 'factory' | 'shop';

export class TruckRoute {
  readonly id: string;
  readonly fromSlotKey: string;   // e.g. "factory_0", "storage_1"
  readonly toSlotKey: string;     // e.g. "factory_0", "storage_1"
  readonly fromType: RouteEndpointType;
  readonly toType: RouteEndpointType;
  readonly path: Vector2[];
  readonly distance: number;      // path.length - 1

  resourceFilter: string | null = null;
  /** Item whitelist — only these resources are loaded. Empty = all allowed. */
  itemFilter: string[] = [];

  constructor(
    fromSlotKey: string, toSlotKey: string, path: Vector2[],
    fromType: RouteEndpointType = 'storage', toType: RouteEndpointType = 'factory',
    id?: string,
  ) {
    if (id) {
      this.id = id;
      const match = id.match(/^troute_(\d+)$/);
      if (match) nextRouteId = Math.max(nextRouteId, parseInt(match[1]) + 1);
    } else {
      this.id = `troute_${nextRouteId++}`;
    }
    this.fromSlotKey = fromSlotKey;
    this.toSlotKey = toSlotKey;
    this.fromType = fromType;
    this.toType = toType;
    this.path = path;
    this.distance = Math.max(1, path.length - 1);
  }

  /** Get world position + direction for a given progress along the path.
   *  Applies ease-in/ease-out for smooth acceleration and braking. */
  getPositionAndDirection(progress: number, reverse: boolean): { pos: Vector2; dir: Vector2 } {
    const len = this.path.length;
    if (len === 0) return { pos: Vector2.ZERO, dir: new Vector2(1, 0) };
    if (len === 1) return { pos: this.path[0], dir: new Vector2(1, 0) };

    const tLinear = Math.max(0, Math.min(1, progress / this.distance));
    // Smoothstep ease-in/ease-out: 3t² - 2t³
    const t = tLinear * tLinear * (3 - 2 * tLinear);
    const rawIdx = reverse ? (1 - t) * (len - 1) : t * (len - 1);
    const idx = Math.max(0, Math.min(Math.floor(rawIdx), len - 2));
    const frac = rawIdx - idx;

    const a = this.path[idx];
    const b = this.path[idx + 1];

    const pos = new Vector2(
      a.x + (b.x - a.x) * frac,
      a.y + (b.y - a.y) * frac,
    );

    let dx = b.x - a.x;
    let dy = b.y - a.y;
    if (reverse) { dx = -dx; dy = -dy; }
    const dir = (dx === 0 && dy === 0) ? new Vector2(1, 0) : new Vector2(dx, dy);
    return { pos, dir };
  }

  serialize(): TruckRouteSaveData {
    return {
      id: this.id,
      fromSlotKey: this.fromSlotKey,
      toSlotKey: this.toSlotKey,
      fromType: this.fromType,
      toType: this.toType,
      resourceFilter: this.resourceFilter,
      itemFilter: this.itemFilter,
      path: this.path.map(p => p.toKey()),
    };
  }
}

export interface TruckRouteSaveData {
  id: string;
  fromSlotKey: string;
  toSlotKey: string;
  fromType?: RouteEndpointType;
  toType?: RouteEndpointType;
  resourceFilter: string | null;
  itemFilter?: string[];
  path: string[];
}
