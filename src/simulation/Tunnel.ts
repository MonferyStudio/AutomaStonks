import { Vector2 } from '@/utils/Vector2';
import { Direction, directionToVector } from '@/utils/Direction';
import type { ITickable } from '@/interfaces/ITickable';
import type { IGridPlaceable } from '@/interfaces/IGridPlaceable';
import type { Grid } from './Grid';
import type { ItemStack } from './ItemStack';
import { TUNNEL_TIERS } from '@/utils/Constants';

let nextTunnelId = 0;

export class TunnelEntry implements ITickable, IGridPlaceable {
  readonly id: string;
  position: Vector2;
  direction: Direction;
  tier: number;
  sleeping: boolean = false;
  pair: TunnelExit | null = null;
  item: ItemStack | null = null;

  constructor(position: Vector2, direction: Direction, tier: number = 1) {
    this.id = `tunnel_in_${nextTunnelId++}`;
    this.position = position;
    this.direction = direction;
    this.tier = tier;
  }

  get maxRange(): number {
    return TUNNEL_TIERS[this.tier as keyof typeof TUNNEL_TIERS]?.range ?? 3;
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

  canAcceptItem(): boolean {
    return this.item === null && this.pair !== null;
  }

  acceptItem(item: ItemStack): boolean {
    if (!this.canAcceptItem()) return false;
    this.item = item;
    this.wake();
    return true;
  }

  onTick(_deltaTicks: number): void {
    if (!this.item || !this.pair) {
      this.sleep();
      return;
    }

    if (this.pair.canAcceptItem()) {
      this.pair.receiveItem(this.item);
      this.item = null;
      this.sleep();
    }
  }

  wake(): void { this.sleeping = false; }
  sleep(): void { this.sleeping = true; }
}

export class TunnelExit implements ITickable, IGridPlaceable {
  readonly id: string;
  position: Vector2;
  direction: Direction;
  sleeping: boolean = false;
  item: ItemStack | null = null;

  constructor(position: Vector2, direction: Direction) {
    this.id = `tunnel_out_${nextTunnelId++}`;
    this.position = position;
    this.direction = direction;
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

  canAcceptItem(): boolean {
    return this.item === null;
  }

  receiveItem(item: ItemStack): void {
    this.item = item;
    this.wake();
  }

  extractItem(): ItemStack | null {
    const item = this.item;
    this.item = null;
    this.sleep();
    return item;
  }

  onTick(_deltaTicks: number): void {
    if (!this.item) this.sleep();
  }

  wake(): void { this.sleeping = false; }
  sleep(): void { this.sleeping = true; }
}

export function createTunnelPair(
  entryPos: Vector2,
  exitPos: Vector2,
  direction: Direction,
  tier: number = 1,
): { entry: TunnelEntry; exit: TunnelExit } | null {
  const distance = entryPos.manhattanDistance(exitPos);
  const maxRange = TUNNEL_TIERS[tier as keyof typeof TUNNEL_TIERS]?.range ?? 3;
  if (distance > maxRange) return null;

  const entryVec = directionToVector(direction);
  const diff = exitPos.subtract(entryPos);
  if (diff.x !== 0 && diff.y !== 0) return null;
  if (diff.x !== entryVec.x * distance && diff.y !== entryVec.y * distance) return null;

  const entry = new TunnelEntry(entryPos, direction, tier);
  const exit = new TunnelExit(exitPos, direction);
  entry.pair = exit;
  return { entry, exit };
}
