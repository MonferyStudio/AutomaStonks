import { Vector2 } from '@/utils/Vector2';
import { Polyomino } from '@/simulation/Polyomino';

export type BuildingType = 'factory' | 'shop' | 'storage' | 'house' | 'decoration';

let nextNodeId = 0;

export class CityNode {
  readonly id: string;
  readonly buildingType: BuildingType;
  readonly position: Vector2;
  readonly polyomino: Polyomino;
  readonly polyominoId: string;

  factoryId: string | null = null;
  shopId: string | null = null;
  storageId: string | null = null;
  name: string;
  color: number;

  constructor(
    buildingType: BuildingType,
    position: Vector2,
    polyomino: Polyomino,
    polyominoId: string,
    name: string,
    color: number,
  ) {
    this.id = `cnode_${nextNodeId++}`;
    this.buildingType = buildingType;
    this.position = position;
    this.polyomino = polyomino;
    this.polyominoId = polyominoId;
    this.name = name;
    this.color = color;
  }

  getCells(): Vector2[] {
    return this.polyomino.cells.map((c) => c.add(this.position));
  }

  isAdjacentTo(pos: Vector2): boolean {
    const cells = this.getCells();
    for (const cell of cells) {
      if (cell.manhattanDistance(pos) === 1) return true;
    }
    return false;
  }
}
