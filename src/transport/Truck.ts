import type { ItemStack } from '@/simulation/ItemStack';

let nextTruckId = 0;

export type TruckState = 'idle' | 'loading' | 'moving_to_dest' | 'unloading' | 'moving_to_origin';

/** Tier thresholds: level ranges that determine the truck sprite. */
export interface TruckTier {
  name: string;
  /** Minimum level (inclusive) for this tier */
  minLevel: number;
  /** Sprite key used by TextureCache (e.g. 'small_truck', 'medium_truck') */
  spriteKey: string;
}

export const TRUCK_TIERS: TruckTier[] = [
  { name: 'Small',  minLevel: 0,  spriteKey: 'small_truck' },
  { name: 'Medium', minLevel: 10, spriteKey: 'medium_truck' },
  { name: 'Large',  minLevel: 20, spriteKey: 'large_truck' },
  { name: 'Heavy',  minLevel: 30, spriteKey: 'heavy_truck' },
];

const MAX_LEVEL = 40;

/** Stat formulas — capacity grows fast, speed/load grow slowly */
const BASE_SPEED = 0.12;
const SPEED_PER_LEVEL = 0.008;
const BASE_CAPACITY = 10;
const CAPACITY_PER_LEVEL = 5;
/** Cumulative capacity bonus at each tier: index 0=none, 1=Medium, 2=Large, 3=Heavy */
const TIER_CAPACITY_BONUSES = [0, 30, 80, 180];
/** Cumulative load speed bonus (ticks reduction) at each tier */
const TIER_LOAD_BONUSES = [0, 5, 9, 13];
const BASE_LOAD_TICKS = 24;

export class Truck {
  readonly id: string;
  readonly index: number;

  level: number = 0;

  name: string = '';
  colorVariant: string = 'red';
  routeId: string | null = null;
  state: TruckState = 'idle';

  cargo: ItemStack[] = [];
  progress: number = 0;
  prevProgress: number = 0;
  prevState: TruckState = 'idle';
  loadProgress: number = 0;

  constructor(index: number, id?: string) {
    if (id) {
      this.id = id;
      const match = id.match(/^truck_(\d+)$/);
      if (match) nextTruckId = Math.max(nextTruckId, parseInt(match[1]) + 1);
    } else {
      this.id = `truck_${nextTruckId++}`;
    }
    this.index = index;
  }

  get speed(): number {
    return BASE_SPEED + SPEED_PER_LEVEL * this.level;
  }

  get maxCargo(): number {
    const tierIdx = Math.min(Math.floor(this.level / 10), TIER_CAPACITY_BONUSES.length - 1);
    let tierBonus = 0;
    for (let t = 1; t <= tierIdx; t++) tierBonus += TIER_CAPACITY_BONUSES[t];
    return BASE_CAPACITY + CAPACITY_PER_LEVEL * this.level + tierBonus;
  }

  /** Ticks needed to load/unload ONE batch of items */
  get loadTicks(): number {
    const tierIdx = Math.min(Math.floor(this.level / 10), TIER_LOAD_BONUSES.length - 1);
    let tierBonus = 0;
    for (let t = 1; t <= tierIdx; t++) tierBonus += TIER_LOAD_BONUSES[t];
    return Math.max(2, BASE_LOAD_TICKS - Math.floor((this.level % 10) * 0.7) - tierBonus);
  }

  /** Number of items loaded/unloaded per batch */
  get loadBatchSize(): number {
    const tierIdx = Math.min(Math.floor(this.level / 10), 3);
    return 1 + tierIdx * 2 + Math.floor(this.level / 5);
    // Lv0=1, Lv5=2, Lv10=5, Lv15=6, Lv20=9, Lv25=10, Lv30=13, Lv35=14, Lv40=15
  }

  get cargoCount(): number {
    return this.cargo.reduce((s, i) => s + i.quantity, 0);
  }

  get remainingCapacity(): number {
    return this.maxCargo - this.cargoCount;
  }

  get isMaxLevel(): boolean {
    return this.level >= MAX_LEVEL;
  }

  /** Current tier based on level */
  get tier(): TruckTier {
    let result = TRUCK_TIERS[0];
    for (const t of TRUCK_TIERS) {
      if (this.level >= t.minLevel) result = t;
    }
    return result;
  }

  /** Sprite key for the current tier */
  get spriteKey(): string {
    return this.tier.spriteKey;
  }

  /** Check if next upgrade crosses a tier boundary */
  get nextLevelTier(): TruckTier | null {
    if (this.isMaxLevel) return null;
    const nextLevel = this.level + 1;
    const nextTier = TRUCK_TIERS.find(t => t.minLevel === nextLevel);
    return nextTier ?? null;
  }

  serialize(): TruckSaveData {
    return {
      id: this.id,
      index: this.index,
      name: this.name,
      level: this.level,
      colorVariant: this.colorVariant,
      routeId: this.routeId,
      state: this.state,
      progress: this.progress,
      loadProgress: this.loadProgress,
      cargo: this.cargo.map(c => ({ resourceId: c.resourceId, quantity: c.quantity })),
    };
  }
}

export interface TruckSaveData {
  id: string;
  index: number;
  name?: string;
  level: number;
  /** @deprecated Old save compat */
  speedLevel?: number;
  /** @deprecated Old save compat */
  capacityLevel?: number;
  /** @deprecated Old save compat */
  loadLevel?: number;
  colorVariant: string;
  routeId: string | null;
  state: TruckState;
  progress: number;
  loadProgress: number;
  cargo: { resourceId: string; quantity: number }[];
}

/** Purchase cost for the Nth truck (0-indexed) */
export function truckPurchaseCost(truckCount: number): number {
  return Math.round(1000 * Math.pow(1.5, truckCount));
}

/** Upgrade cost for a truck at a given level.
 *  +10% per level, x5 to cross into a new tier — stays at that base after. */
export function truckUpgradeCost(truckIndex: number, currentLevel: number): number {
  let cost = 500;
  for (let i = 0; i <= currentLevel; i++) {
    if (i > 0) cost *= 1.1;
    // At tier boundary, multiply by 5 (and keep that as new base)
    if (i > 0 && i % 10 === 0) cost *= 5;
  }
  return Math.round(cost * Math.pow(1.2, truckIndex));
}
