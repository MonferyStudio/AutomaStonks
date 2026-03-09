import { Vector2 } from '@/utils/Vector2';
import type { BuildingType } from './CityNode';
import type { Polyomino } from '@/simulation/Polyomino';

let nextSlotId = 0;

export class CitySlot {
  readonly id: string;
  readonly slotType: BuildingType;
  readonly position: Vector2;
  readonly polyominoId: string;
  readonly polyomino: Polyomino;
  cost: number;

  purchased: boolean = false;
  buildingNodeId: string | null = null;

  constructor(
    slotType: BuildingType,
    position: Vector2,
    polyominoId: string,
    polyomino: Polyomino,
    cost: number,
  ) {
    this.id = `cslot_${nextSlotId++}`;
    this.slotType = slotType;
    this.position = position;
    this.polyominoId = polyominoId;
    this.polyomino = polyomino;
    this.cost = cost;
  }
}
