import { Vector2 } from '@/utils/Vector2';
import { Polyomino } from '@/simulation/Polyomino';
import { CELL_SIZE_PX } from '@/utils/Constants';
import type { ShopConfigData } from './CityLayoutData';

export type BuildingType = 'factory' | 'shop' | 'storage';

export interface SlotBounds {
  x: number; // offset from position
  y: number;
  w: number; // width in cells
  h: number; // height in cells
}

/** Pixel-precise rectangle in Tiled map coordinates (16px/cell scale) */
export interface PixelRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MAP_PX_SCALE = 16; // Tiled map pixels per cell

let nextSlotId = 0;

export class CitySlot {
  readonly id: string;
  readonly slotType: BuildingType;
  readonly position: Vector2;
  readonly bounds: SlotBounds;
  cost: number;

  /** Stable index within its type array (factorySlots[0] → 0, etc.). Set during deserialization. */
  slotIndex: number = 0;

  /** Compound hitbox: list of pixel rects in Tiled coords (16px/cell). Overrides cell bounds for rendering & hit testing. */
  pixelZones: PixelRect[] = [];

  /** Factory interior grid dimensions (manual, independent of exterior bounds) */
  interiorSize: { w: number; h: number };

  /** Manual truck stop position in city grid coords */
  truckStop?: Vector2;

  purchased: boolean = false;
  buildingNodeId: string | null = null;

  /** Manual border definition: list of {x, y, type} in factory grid coords.
   *  When set, replaces auto-computed border from BorderContextComputer. */
  manualBorder: { x: number; y: number; type: 'wall' | 'road' }[] = [];

  /** Shop configuration (only for shop slots, loaded from city JSON) */
  shopConfig?: ShopConfigData;

  constructor(
    slotType: BuildingType,
    position: Vector2,
    bounds: SlotBounds,
    cost: number,
    interiorSize?: { w: number; h: number },
  ) {
    this.id = `cslot_${nextSlotId++}`;
    this.slotType = slotType;
    this.position = position;
    this.bounds = bounds;
    this.cost = cost;
    // Default interior size: bounds * FACTORY_CELL_RATIO (5)
    this.interiorSize = interiorSize ?? { w: bounds.w * 5, h: bounds.h * 5 };
  }

  /** Unique key for this slot: type + array index (e.g. "factory_0", "storage_1") */
  get slotKey(): string {
    return `${this.slotType}_${this.slotIndex}`;
  }

  /** Whether this slot uses pixel-precise zones */
  get hasPixelZones(): boolean {
    return this.pixelZones.length > 0;
  }

  /** Get all city grid cells occupied by this slot */
  getCells(): Vector2[] {
    const cells: Vector2[] = [];
    for (let dy = 0; dy < this.bounds.h; dy++) {
      for (let dx = 0; dx < this.bounds.w; dx++) {
        cells.push(new Vector2(
          this.bounds.x + dx,
          this.bounds.y + dy,
        ));
      }
    }
    return cells;
  }

  /** Check if a city grid position falls within this slot */
  containsGrid(gx: number, gy: number): boolean {
    const ax = this.position.x + this.bounds.x;
    const ay = this.position.y + this.bounds.y;
    return gx >= ax && gx < ax + this.bounds.w
        && gy >= ay && gy < ay + this.bounds.h;
  }

  /** Check if a world pixel position falls within this slot (uses pixelZones if available) */
  containsWorldPixel(wx: number, wy: number): boolean {
    if (this.hasPixelZones) {
      const scale = CELL_SIZE_PX / MAP_PX_SCALE;
      for (const z of this.pixelZones) {
        const rx = z.x * scale;
        const ry = z.y * scale;
        if (wx >= rx && wx < rx + z.w * scale && wy >= ry && wy < ry + z.h * scale) {
          return true;
        }
      }
      return false;
    }
    // Fallback to cell bounds
    const ax = (this.position.x + this.bounds.x) * CELL_SIZE_PX;
    const ay = (this.position.y + this.bounds.y) * CELL_SIZE_PX;
    return wx >= ax && wx < ax + this.bounds.w * CELL_SIZE_PX
        && wy >= ay && wy < ay + this.bounds.h * CELL_SIZE_PX;
  }

  /** Get all pixel zone rects scaled to world pixels */
  getWorldZones(): { x: number; y: number; w: number; h: number }[] {
    if (this.hasPixelZones) {
      const scale = CELL_SIZE_PX / MAP_PX_SCALE;
      return this.pixelZones.map(z => ({
        x: z.x * scale,
        y: z.y * scale,
        w: z.w * scale,
        h: z.h * scale,
      }));
    }
    return [{
      x: (this.position.x + this.bounds.x) * CELL_SIZE_PX,
      y: (this.position.y + this.bounds.y) * CELL_SIZE_PX,
      w: this.bounds.w * CELL_SIZE_PX,
      h: this.bounds.h * CELL_SIZE_PX,
    }];
  }

  /** Get bounding box of all zones in world pixels (for labels, badges, floating text) */
  getRenderRect(): { x: number; y: number; w: number; h: number } {
    const zones = this.getWorldZones();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const z of zones) {
      if (z.x < minX) minX = z.x;
      if (z.y < minY) minY = z.y;
      if (z.x + z.w > maxX) maxX = z.x + z.w;
      if (z.y + z.h > maxY) maxY = z.y + z.h;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  /** Generate a rectangular Polyomino matching the bounds (for Grid/Factory compat) */
  toPolyomino(): Polyomino {
    return Polyomino.fromRect(this.bounds.w, this.bounds.h);
  }

  /** Generate a rectangular Polyomino from interiorSize (for factory Grid) */
  toInteriorPolyomino(): Polyomino {
    return Polyomino.fromRect(this.interiorSize.w, this.interiorSize.h);
  }

  /** Cell count (area of bounds rectangle) */
  get cellCount(): number {
    return this.bounds.w * this.bounds.h;
  }
}
