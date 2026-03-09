import { Vector2 } from '@/utils/Vector2';
import { Polyomino } from '@/simulation/Polyomino';
import { RoadNetwork } from './RoadNetwork';
import { CitySlot } from './CitySlot';
import { CityNode } from './CityNode';
import type { CityLayout } from './CityGenerator';
import type { PolyominoRegistry } from '@/simulation/PolyominoRegistry';

// ─── JSON-serializable data types ────────────────────────────

export interface CityLayoutData {
  width: number;
  height: number;
  bgColor?: string;
  roads: [number, number][];
  factorySlots: SlotData[];
  shopSlots: SlotData[];
  storageSlots?: SlotData[];
  decorations: DecorationData[];
}

export interface SlotData {
  position: [number, number];
  polyominoId: string;
  cells: [number, number][];
  cost: number;
}

export interface DecorationData {
  type: 'house' | 'decoration';
  position: [number, number];
  polyominoId: string;
  cells: [number, number][];
  name: string;
  color: string;
}

// ─── Serialize: CityLayout → CityLayoutData ──────────────────

export function serializeCityLayout(layout: CityLayout, bgColor?: number): CityLayoutData {
  return {
    width: layout.width,
    height: layout.height,
    bgColor: bgColor != null ? '0x' + bgColor.toString(16).padStart(6, '0') : undefined,
    roads: layout.roadNetwork.getAllRoads().map(r => [r.x, r.y]),
    factorySlots: layout.factorySlots.map(serializeSlot),
    shopSlots: layout.shopSlots.map(serializeSlot),
    storageSlots: layout.storageSlots.map(serializeSlot),
    decorations: layout.decorations.map(serializeDecoration),
  };
}

function serializeSlot(slot: CitySlot): SlotData {
  return {
    position: [slot.position.x, slot.position.y],
    polyominoId: slot.polyominoId,
    cells: slot.polyomino.cells.map(c => [c.x, c.y]),
    cost: slot.cost,
  };
}

function serializeDecoration(node: CityNode): DecorationData {
  return {
    type: node.buildingType as 'house' | 'decoration',
    position: [node.position.x, node.position.y],
    polyominoId: node.polyominoId,
    cells: node.polyomino.cells.map(c => [c.x, c.y]),
    name: node.name,
    color: '0x' + node.color.toString(16).padStart(6, '0'),
  };
}

// ─── Deserialize: CityLayoutData → CityLayout ───────────────

export function deserializeCityLayout(data: CityLayoutData): CityLayout {
  const roadNetwork = new RoadNetwork(data.width, data.height);
  for (const [x, y] of data.roads) {
    roadNetwork.addRoad(new Vector2(x, y));
  }

  const factorySlots = data.factorySlots.map(s => deserializeSlot(s, 'factory'));
  const shopSlots = data.shopSlots.map(s => {
    const slot = deserializeSlot(s, 'shop');
    slot.purchased = true;
    return slot;
  });

  const storageSlots = (data.storageSlots ?? []).map(s => {
    const slot = deserializeSlot(s, 'storage');
    slot.purchased = true;
    return slot;
  });

  const decorations = data.decorations.map(deserializeDecoration);

  return {
    roadNetwork,
    factorySlots,
    shopSlots,
    storageSlots,
    decorations,
    width: data.width,
    height: data.height,
  };
}

function deserializeSlot(data: SlotData, type: 'factory' | 'shop' | 'storage'): CitySlot {
  const pos = new Vector2(data.position[0], data.position[1]);
  const cells = data.cells.map(([x, y]) => new Vector2(x, y));
  const poly = new Polyomino(cells);
  return new CitySlot(type, pos, data.polyominoId, poly, data.cost);
}

function deserializeDecoration(data: DecorationData): CityNode {
  const pos = new Vector2(data.position[0], data.position[1]);
  const cells = data.cells.map(([x, y]) => new Vector2(x, y));
  const poly = new Polyomino(cells);
  const color = parseInt(data.color.replace('0x', ''), 16);
  return new CityNode(data.type, pos, poly, data.polyominoId, data.name, color);
}

/** Parse bgColor string from data, returns undefined if not set */
export function parseBgColor(data: CityLayoutData): number | undefined {
  if (!data.bgColor) return undefined;
  return parseInt(data.bgColor.replace('0x', ''), 16);
}
