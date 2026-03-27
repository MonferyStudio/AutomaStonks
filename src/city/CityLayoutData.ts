import { Vector2 } from '@/utils/Vector2';
import { RoadNetwork } from './RoadNetwork';
import { CitySlot, type SlotBounds } from './CitySlot';

// ─── Runtime layout (used everywhere in the game) ────────────

export interface CityLayout {
  roadNetwork: RoadNetwork;
  factorySlots: CitySlot[];
  shopSlots: CitySlot[];
  storageSlots: CitySlot[];
  width: number;
  height: number;
  cameraBounds?: { x: number; y: number; w: number; h: number };
  zoomLimits?: { min: number; max: number };
}

// ─── JSON-serializable data types ────────────────────────────

export interface CityLayoutData {
  width: number;
  height: number;
  bgColor?: string;
  /** Map image filename in sprites/city/ (e.g. "Bramfeld.png"). Auto-loaded as background. */
  mapImage?: string;
  /** Camera bounds in world pixels: [x, y, w, h] */
  cameraBounds?: [number, number, number, number];
  /** Zoom limits: [min, max] */
  zoomLimits?: [number, number];
  roads: [number, number][];
  factorySlots: SlotData[];
  shopSlots: SlotData[];
  storageSlots?: SlotData[];
}

export interface SlotData {
  position: [number, number];
  /** Rectangle bounds: [x, y, w, h] offset from position (cell units) */
  bounds?: [number, number, number, number];
  /** Compound hitbox: list of pixel rects in Tiled map coords (16px/cell): [[x,y,w,h], ...] */
  pixelZones?: [number, number, number, number][];
  /** Factory interior grid size: [w, h] */
  interiorSize?: [number, number];
  /** Manual truck stop position: [x, y] in city grid */
  truckStop?: [number, number];
  /** Manual border cells: [[x, y, "wall"|"road"], ...] in factory grid coords */
  manualBorder?: [number, number, string][];
  cost: number;
  /** Shop configuration (only present on shop slots) */
  shopConfig?: ShopConfigData;

  // Legacy fields (backward compat — used if bounds is absent)
  polyominoId?: string;
  cells?: [number, number][];
}

export interface ShopConfigData {
  name: string;
  color: number;
  description: string;
  priceModifier: number;
  acceptedCategories?: string[];
  acceptedItems?: string[];
  /** Resource ID → price modifier */
  itemPriceModifiers: Record<string, number>;
}

// ─── Serialize: CityLayout → CityLayoutData ──────────────────

export function serializeCityLayout(layout: CityLayout, bgColor?: number): CityLayoutData {
  const data: CityLayoutData = {
    width: layout.width,
    height: layout.height,
    bgColor: bgColor != null ? '0x' + bgColor.toString(16).padStart(6, '0') : undefined,
    roads: layout.roadNetwork.getAllRoads().map(r => [r.x, r.y]),
    factorySlots: layout.factorySlots.map(serializeSlot),
    shopSlots: layout.shopSlots.map(serializeSlot),
    storageSlots: layout.storageSlots.map(serializeSlot),
  };
  if (layout.cameraBounds) {
    data.cameraBounds = [layout.cameraBounds.x, layout.cameraBounds.y, layout.cameraBounds.w, layout.cameraBounds.h];
  }
  if (layout.zoomLimits) {
    data.zoomLimits = [layout.zoomLimits.min, layout.zoomLimits.max];
  }
  return data;
}

function serializeSlot(slot: CitySlot): SlotData {
  const data: SlotData = {
    position: [slot.position.x, slot.position.y],
    bounds: [slot.bounds.x, slot.bounds.y, slot.bounds.w, slot.bounds.h],
    cost: slot.cost,
  };
  if (slot.pixelZones.length > 0) {
    data.pixelZones = slot.pixelZones.map(z => [z.x, z.y, z.w, z.h] as [number, number, number, number]);
  }
  if (slot.interiorSize) {
    data.interiorSize = [slot.interiorSize.w, slot.interiorSize.h];
  }
  if (slot.truckStop) {
    data.truckStop = [slot.truckStop.x, slot.truckStop.y];
  }
  if (slot.manualBorder.length > 0) {
    data.manualBorder = slot.manualBorder.map(b => [b.x, b.y, b.type]);
  }
  if (slot.shopConfig) {
    data.shopConfig = slot.shopConfig;
  }
  return data;
}

// ─── Deserialize: CityLayoutData → CityLayout ───────────────

export function deserializeCityLayout(data: CityLayoutData): CityLayout {
  const roadNetwork = new RoadNetwork(data.width, data.height);
  for (const [x, y] of data.roads) {
    roadNetwork.addRoad(new Vector2(x, y));
  }

  const factorySlots = data.factorySlots.map((s, i) => {
    const slot = deserializeSlot(s, 'factory');
    slot.slotIndex = i;
    return slot;
  });
  const shopSlots = data.shopSlots.map((s, i) => {
    const slot = deserializeSlot(s, 'shop');
    slot.slotIndex = i;
    slot.purchased = true;
    return slot;
  });

  const storageSlots = (data.storageSlots ?? []).map((s, i) => {
    const slot = deserializeSlot(s, 'storage');
    slot.slotIndex = i;
    return slot;
  });

  const layout: CityLayout = {
    roadNetwork,
    factorySlots,
    shopSlots,
    storageSlots,
    width: data.width,
    height: data.height,
  };
  if (data.cameraBounds) {
    layout.cameraBounds = { x: data.cameraBounds[0], y: data.cameraBounds[1], w: data.cameraBounds[2], h: data.cameraBounds[3] };
  }
  if (data.zoomLimits) {
    layout.zoomLimits = { min: data.zoomLimits[0], max: data.zoomLimits[1] };
  }
  return layout;
}

function deserializeSlot(data: SlotData, type: 'factory' | 'shop' | 'storage'): CitySlot {
  const pos = new Vector2(data.position[0], data.position[1]);

  let bounds: SlotBounds;
  if (data.bounds) {
    bounds = { x: data.bounds[0], y: data.bounds[1], w: data.bounds[2], h: data.bounds[3] };
  } else if (data.cells) {
    // Legacy: compute bounding rect from cells
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [cx, cy] of data.cells) {
      if (cx < minX) minX = cx;
      if (cy < minY) minY = cy;
      if (cx > maxX) maxX = cx;
      if (cy > maxY) maxY = cy;
    }
    bounds = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  } else {
    bounds = { x: 0, y: 0, w: 1, h: 1 };
  }

  const interiorSize = data.interiorSize
    ? { w: data.interiorSize[0], h: data.interiorSize[1] }
    : undefined;

  const slot = new CitySlot(type, pos, bounds, data.cost, interiorSize);

  if (data.pixelZones) {
    slot.pixelZones = data.pixelZones.map(z => ({ x: z[0], y: z[1], w: z[2], h: z[3] }));
  }
  if (data.manualBorder) {
    slot.manualBorder = data.manualBorder.map(b => ({ x: b[0] as number, y: b[1] as number, type: b[2] as 'wall' | 'road' }));
  }
  if (data.truckStop) {
    slot.truckStop = new Vector2(data.truckStop[0], data.truckStop[1]);
  }
  if (data.shopConfig) {
    slot.shopConfig = data.shopConfig;
  }
  return slot;
}

/** Parse bgColor string from data, returns undefined if not set */
export function parseBgColor(data: CityLayoutData): number | undefined {
  if (!data.bgColor) return undefined;
  return parseInt(data.bgColor.replace('0x', ''), 16);
}
