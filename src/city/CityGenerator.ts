import { Vector2 } from '@/utils/Vector2';
import { RoadNetwork } from './RoadNetwork';
import { CitySlot } from './CitySlot';
import { CityNode } from './CityNode';
import { Polyomino } from '@/simulation/Polyomino';
import { generateRoads } from './RoadPatternGenerator';
import type { CityTypeDefinition } from '@/world/CityType';
import type { PolyominoRegistry } from '@/simulation/PolyominoRegistry';

export interface CityLayout {
  roadNetwork: RoadNetwork;
  factorySlots: CitySlot[];
  shopSlots: CitySlot[];
  storageSlots: CitySlot[];
  decorations: CityNode[];
  width: number;
  height: number;
}

// --- Tier configuration ---

interface TierConfig {
  width: number;
  height: number;
  factoryPolyIds: string[];
  factoryCosts: number[];
  shopPolyIds: string[];
  shopCosts: number[];
  houseCount: [number, number];
  treeCount: [number, number];
  parkCount: [number, number];
  roadComplexity: number;
}

const TIER_CONFIGS: TierConfig[] = [
  // Tier 0 — starter village
  {
    width: 14, height: 10,
    factoryPolyIds: ['mono_1', 'dom_I', 'tro_I'],
    factoryCosts: [40, 60, 70],
    shopPolyIds: ['mono_1', 'dom_I'],
    shopCosts: [0, 0],
    houseCount: [4, 6], treeCount: [6, 10], parkCount: [0, 1],
    roadComplexity: 0,
  },
  // Tier 1
  {
    width: 16, height: 12,
    factoryPolyIds: ['mono_1', 'dom_I', 'tro_I', 'tro_L', 'tet_O'],
    factoryCosts: [50, 70, 80, 70, 90],
    shopPolyIds: ['mono_1', 'dom_I', 'tro_I'],
    shopCosts: [0, 0, 0],
    houseCount: [6, 10], treeCount: [6, 12], parkCount: [1, 2],
    roadComplexity: 1,
  },
  // Tier 2
  {
    width: 18, height: 13,
    factoryPolyIds: ['dom_I', 'tro_I', 'tro_L', 'tet_O', 'tet_T', 'tet_L', 'tet_J'],
    factoryCosts: [70, 80, 70, 90, 100, 100, 100],
    shopPolyIds: ['mono_1', 'dom_I', 'tro_I', 'tro_L'],
    shopCosts: [0, 0, 0, 0],
    houseCount: [8, 12], treeCount: [8, 14], parkCount: [1, 2],
    roadComplexity: 1,
  },
  // Tier 3
  {
    width: 20, height: 14,
    factoryPolyIds: ['tro_I', 'tro_L', 'tet_O', 'tet_T', 'tet_L', 'tet_J', 'tet_S', 'tet_Z'],
    factoryCosts: [80, 70, 90, 100, 100, 100, 100, 100],
    shopPolyIds: ['dom_I', 'tro_I', 'tro_L', 'mono_1'],
    shopCosts: [0, 0, 0, 0],
    houseCount: [10, 14], treeCount: [8, 16], parkCount: [1, 3],
    roadComplexity: 2,
  },
  // Tier 4
  {
    width: 22, height: 15,
    factoryPolyIds: ['tro_L', 'tet_O', 'tet_T', 'tet_L', 'tet_J', 'tet_S', 'tet_Z', 'pent_P', 'pent_T'],
    factoryCosts: [70, 90, 100, 100, 100, 100, 100, 150, 150],
    shopPolyIds: ['dom_I', 'tro_I', 'tro_L', 'mono_1'],
    shopCosts: [0, 0, 0, 0],
    houseCount: [12, 18], treeCount: [10, 16], parkCount: [1, 3],
    roadComplexity: 2,
  },
  // Tier 5
  {
    width: 24, height: 16,
    factoryPolyIds: ['tet_T', 'tet_L', 'tet_J', 'tet_S', 'tet_Z', 'pent_P', 'pent_T', 'pent_F'],
    factoryCosts: [100, 100, 100, 100, 100, 150, 150, 180],
    shopPolyIds: ['dom_I', 'tro_I', 'tro_L', 'tet_O'],
    shopCosts: [0, 0, 0, 0],
    houseCount: [14, 20], treeCount: [10, 18], parkCount: [2, 3],
    roadComplexity: 3,
  },
];

const HOUSE_POLYOMINOS = ['mono_1', 'mono_1', 'mono_1', 'dom_I', 'dom_I', 'tro_L'];
const HOUSE_COLOR = 0x356840;

function getTierConfig(unlockCost: number): TierConfig {
  const tier = Math.min(unlockCost, TIER_CONFIGS.length - 1);
  return TIER_CONFIGS[tier];
}

export class CityGenerator {
  private polyRegistry: PolyominoRegistry;

  constructor(polyRegistry: PolyominoRegistry) {
    this.polyRegistry = polyRegistry;
  }

  generate(cityType: CityTypeDefinition, seed: number = Date.now(), unlockCost: number = 0): CityLayout {
    const rng = this.createRng(seed);
    const tier = getTierConfig(unlockCost);
    const W = tier.width;
    const H = tier.height;
    const roadNetwork = new RoadNetwork(W, H);

    generateRoads(roadNetwork, rng, cityType, tier.roadComplexity, W, H);

    const occupied = new Set<string>();
    for (const road of roadNetwork.getAllRoads()) {
      occupied.add(road.toKey());
    }

    const factorySlots = this.placeSlotsSmart(
      'factory', cityType.factorySlots, roadNetwork, occupied, rng,
      tier.factoryPolyIds, tier.factoryCosts, false, W, H,
    );

    const shopSlots = this.placeSlotsSmart(
      'shop', cityType.shopSlots, roadNetwork, occupied, rng,
      tier.shopPolyIds, tier.shopCosts, true, W, H,
    );

    const decorations = this.placeDecorations(roadNetwork, occupied, rng, tier, W, H);

    return { roadNetwork, factorySlots, shopSlots, storageSlots: [], decorations, width: W, height: H };
  }

  // =====================
  //   SMART PLACEMENT
  // =====================

  private placeSlotsSmart(
    type: 'factory' | 'shop', count: number,
    roadNetwork: RoadNetwork, occupied: Set<string>,
    rng: () => number, polyIds: string[], costs: number[],
    prePurchased: boolean, W: number, H: number,
  ): CitySlot[] {
    const slots: CitySlot[] = [];
    const candidateSites = this.findCandidateSites(roadNetwork, occupied, W, H);

    for (let attempt = 0; attempt < count * 50 && slots.length < count; attempt++) {
      if (candidateSites.length === 0) break;
      const siteIdx = Math.floor(rng() * candidateSites.length);
      const pos = candidateSites[siteIdx];

      const polyIdx = Math.floor(rng() * polyIds.length);
      const polyId = polyIds[polyIdx];
      const poly = this.polyRegistry.get(polyId);
      if (!poly) continue;

      const rotations = poly.getAllRotations();
      let bestRotated: Polyomino | null = null;
      let bestScore = -Infinity;

      for (const rotated of rotations) {
        const cells = rotated.cells.map(c => c.add(pos));
        const fits = cells.every(c =>
          c.x >= 1 && c.x < W - 1 && c.y >= 1 && c.y < H - 1 && !occupied.has(c.toKey()),
        );
        if (!fits) continue;

        const adjacentToRoad = cells.some(c => roadNetwork.isAdjacentToRoad(c));
        if (!adjacentToRoad) continue;

        const score = this.scorePlacement(rotated, pos, roadNetwork, occupied, W, H);
        if (score > bestScore) {
          bestScore = score;
          bestRotated = rotated;
        }
      }

      if (!bestRotated) continue;

      const cells = bestRotated.cells.map(c => c.add(pos));
      for (const c of cells) occupied.add(c.toKey());

      // Remove placed cells from candidates
      const placedKeys = new Set(cells.map(c => c.toKey()));
      for (let i = candidateSites.length - 1; i >= 0; i--) {
        if (placedKeys.has(candidateSites[i].toKey())) {
          candidateSites.splice(i, 1);
        }
      }

      const cost = costs[polyIdx] ?? 100;
      const slot = new CitySlot(type, pos, polyId, bestRotated, cost);
      if (prePurchased) slot.purchased = true;
      slots.push(slot);
    }

    return slots;
  }

  private findCandidateSites(roadNetwork: RoadNetwork, occupied: Set<string>, W: number, H: number): Vector2[] {
    const sites: Vector2[] = [];
    for (let x = 1; x < W - 1; x++) {
      for (let y = 1; y < H - 1; y++) {
        const pos = new Vector2(x, y);
        if (occupied.has(pos.toKey())) continue;
        if (roadNetwork.isAdjacentToRoad(pos)) sites.push(pos);
      }
    }
    return sites;
  }

  private scorePlacement(
    poly: Polyomino, pos: Vector2,
    roadNetwork: RoadNetwork, occupied: Set<string>,
    W: number, H: number,
  ): number {
    let score = 0;
    const cells = poly.cells.map(c => c.add(pos));

    // More road contact = better
    for (const cell of cells) {
      if (roadNetwork.isAdjacentToRoad(cell)) score += 3;
    }

    // Shape-context bonus
    score += this.shapeContextBonus(poly, pos, roadNetwork);

    // Edge penalty
    for (const cell of cells) {
      if (cell.x <= 1 || cell.x >= W - 2 || cell.y <= 1 || cell.y >= H - 2) score -= 2;
    }

    // Adjacent building penalty (prefer spacing)
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const cell of cells) {
      for (const d of dirs) {
        const neighbor = new Vector2(cell.x + d[0], cell.y + d[1]);
        if (occupied.has(neighbor.toKey()) && !roadNetwork.isRoad(neighbor) && !cells.some(c => c.equals(neighbor))) {
          score -= 2;
        }
      }
    }

    return score;
  }

  private shapeContextBonus(poly: Polyomino, pos: Vector2, roadNetwork: RoadNetwork): number {
    const bb = poly.boundingBox;
    const isWide = bb.width > bb.height;
    const isTall = bb.height > bb.width;

    const cells = poly.cells.map(c => c.add(pos));
    let hRoad = 0;
    let vRoad = 0;

    for (const cell of cells) {
      if (roadNetwork.isRoad(new Vector2(cell.x - 1, cell.y)) || roadNetwork.isRoad(new Vector2(cell.x + 1, cell.y))) hRoad++;
      if (roadNetwork.isRoad(new Vector2(cell.x, cell.y - 1)) || roadNetwork.isRoad(new Vector2(cell.x, cell.y + 1))) vRoad++;
    }

    if (isWide && hRoad > vRoad) return 3;
    if (isTall && vRoad > hRoad) return 3;
    return 1;
  }

  // =====================
  //   DECORATIONS
  // =====================

  private placeDecorations(
    roadNetwork: RoadNetwork, occupied: Set<string>,
    rng: () => number, tier: TierConfig,
    W: number, H: number,
  ): CityNode[] {
    const decorations: CityNode[] = [];

    // Houses
    const houseCount = tier.houseCount[0] + Math.floor(rng() * (tier.houseCount[1] - tier.houseCount[0] + 1));
    for (let attempt = 0; attempt < houseCount * 20 && decorations.filter(d => d.buildingType === 'house').length < houseCount; attempt++) {
      const polyIdx = Math.floor(rng() * HOUSE_POLYOMINOS.length);
      const polyId = HOUSE_POLYOMINOS[polyIdx];
      const poly = this.polyRegistry.get(polyId);
      if (!poly) continue;

      const x = 1 + Math.floor(rng() * (W - 3));
      const y = 1 + Math.floor(rng() * (H - 3));
      const pos = new Vector2(x, y);

      const cells = poly.cells.map(c => c.add(pos));
      const fits = cells.every(c =>
        c.x >= 1 && c.x < W - 1 && c.y >= 1 && c.y < H - 1 && !occupied.has(c.toKey()),
      );
      if (!fits) continue;

      const adjacentToRoad = cells.some(c => roadNetwork.isAdjacentToRoad(c));
      if (!adjacentToRoad) continue;

      for (const c of cells) occupied.add(c.toKey());
      decorations.push(new CityNode('house', pos, poly, polyId, 'House', HOUSE_COLOR));
    }

    // Trees
    const treeCount = tier.treeCount[0] + Math.floor(rng() * (tier.treeCount[1] - tier.treeCount[0] + 1));
    for (let attempt = 0; attempt < treeCount * 10 && decorations.filter(d => d.buildingType === 'decoration').length < treeCount; attempt++) {
      const x = Math.floor(rng() * W);
      const y = Math.floor(rng() * H);
      const pos = new Vector2(x, y);
      if (occupied.has(pos.toKey())) continue;

      occupied.add(pos.toKey());
      const mono = new Polyomino([new Vector2(0, 0)]);
      const shade = 0x1a4a20 + Math.floor(rng() * 0x153015);
      decorations.push(new CityNode('decoration', pos, mono, 'mono_1', 'Tree', shade));
    }

    // Parks
    const parkCount = tier.parkCount[0] + Math.floor(rng() * (tier.parkCount[1] - tier.parkCount[0] + 1));
    for (let i = 0; i < parkCount; i++) {
      const cx = 2 + Math.floor(rng() * (W - 4));
      const cy = 2 + Math.floor(rng() * (H - 4));
      for (let dx = 0; dx <= 1; dx++) {
        for (let dy = 0; dy <= 1; dy++) {
          if (rng() > 0.55) continue;
          const pos = new Vector2(cx + dx, cy + dy);
          if (occupied.has(pos.toKey())) continue;
          if (pos.x < 0 || pos.x >= W || pos.y < 0 || pos.y >= H) continue;

          occupied.add(pos.toKey());
          const mono = new Polyomino([new Vector2(0, 0)]);
          const shade = 0x1a5520 + Math.floor(rng() * 0x102010);
          decorations.push(new CityNode('decoration', pos, mono, 'mono_1', 'Park', shade));
        }
      }
    }

    return decorations;
  }

  // =====================
  //   PARTIAL REGENERATION
  // =====================

  /** Build occupied set from layout (roads + slots + decorations). */
  private buildOccupied(layout: CityLayout): Set<string> {
    const occupied = new Set<string>();
    for (const road of layout.roadNetwork.getAllRoads()) occupied.add(road.toKey());
    for (const slot of layout.factorySlots) {
      for (const c of slot.polyomino.cells) occupied.add(c.add(slot.position).toKey());
    }
    for (const slot of layout.shopSlots) {
      for (const c of slot.polyomino.cells) occupied.add(c.add(slot.position).toKey());
    }
    for (const slot of layout.storageSlots) {
      for (const c of slot.polyomino.cells) occupied.add(c.add(slot.position).toKey());
    }
    for (const deco of layout.decorations) {
      for (const c of deco.polyomino.cells) occupied.add(c.add(deco.position).toKey());
    }
    return occupied;
  }

  /** Remove specific items from occupied set. */
  private removeFromOccupied(occupied: Set<string>, slots: CitySlot[]): void;
  private removeFromOccupied(occupied: Set<string>, nodes: CityNode[]): void;
  private removeFromOccupied(occupied: Set<string>, items: (CitySlot | CityNode)[]): void {
    for (const item of items) {
      const pos = item.position;
      const poly = item instanceof CitySlot ? item.polyomino : item.polyomino;
      for (const c of poly.cells) occupied.delete(c.add(pos).toKey());
    }
  }

  regenerateRoads(layout: CityLayout, cityType: CityTypeDefinition, unlockCost: number = 0): void {
    const rng = this.createRng(Date.now());
    const tier = getTierConfig(unlockCost);
    for (const r of layout.roadNetwork.getAllRoads()) layout.roadNetwork.removeRoad(r);
    generateRoads(layout.roadNetwork, rng, cityType, tier.roadComplexity, layout.width, layout.height);
  }

  regenerateFactories(layout: CityLayout, unlockCost: number = 0): void {
    const rng = this.createRng(Date.now());
    const tier = getTierConfig(unlockCost);
    const occupied = this.buildOccupied(layout);
    this.removeFromOccupied(occupied, layout.factorySlots);
    layout.factorySlots.length = 0;

    const count = Math.max(tier.factoryPolyIds.length, 3);
    const newSlots = this.placeSlotsSmart(
      'factory', count, layout.roadNetwork, occupied, rng,
      tier.factoryPolyIds, tier.factoryCosts, false, layout.width, layout.height,
    );
    layout.factorySlots.push(...newSlots);
  }

  regenerateShops(layout: CityLayout, unlockCost: number = 0): void {
    const rng = this.createRng(Date.now());
    const tier = getTierConfig(unlockCost);
    const occupied = this.buildOccupied(layout);
    this.removeFromOccupied(occupied, layout.shopSlots);
    layout.shopSlots.length = 0;

    const count = Math.max(tier.shopPolyIds.length, 2);
    const newSlots = this.placeSlotsSmart(
      'shop', count, layout.roadNetwork, occupied, rng,
      tier.shopPolyIds, tier.shopCosts, true, layout.width, layout.height,
    );
    layout.shopSlots.push(...newSlots);
  }

  regenerateDecorations(layout: CityLayout, unlockCost: number = 0): void {
    const rng = this.createRng(Date.now());
    const tier = getTierConfig(unlockCost);
    const occupied = this.buildOccupied(layout);
    this.removeFromOccupied(occupied, layout.decorations);
    layout.decorations.length = 0;

    const newDecos = this.placeDecorations(layout.roadNetwork, occupied, rng, tier, layout.width, layout.height);
    layout.decorations.push(...newDecos);
  }

  // =====================
  //   UTILS
  // =====================

  private createRng(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0xffffffff;
    };
  }
}
