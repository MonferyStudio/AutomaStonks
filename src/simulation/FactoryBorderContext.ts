import { Vector2 } from '@/utils/Vector2';
import { Direction, directionToVector, oppositeDirection } from '@/utils/Direction';

export type BorderEdgeType = 'road' | 'building' | 'empty' | 'out_of_bounds';

export interface BorderEdge {
  /** Position in factory-grid coordinates (border cell just inside the factory) */
  factoryCell: Vector2;
  /** Direction pointing outward from the factory */
  direction: Direction;
  /** What lies on the other side */
  type: BorderEdgeType;
}

export interface FactoryBorderContext {
  edges: BorderEdge[];
}

/** Check if a position is a road cell just outside the factory grid */
export function isRoadCell(ctx: FactoryBorderContext, pos: Vector2): boolean {
  return ctx.edges.some(e => {
    if (e.type !== 'road') return false;
    const roadPos = e.factoryCell.add(directionToVector(e.direction));
    return roadPos.equals(pos);
  });
}

/**
 * Get the inward direction for a road cell (pointing into the factory).
 * Returns null if pos is not a road cell.
 */
export function getRoadCellInwardDirection(ctx: FactoryBorderContext, pos: Vector2): Direction | null {
  const edge = ctx.edges.find(e => {
    if (e.type !== 'road') return false;
    const roadPos = e.factoryCell.add(directionToVector(e.direction));
    return roadPos.equals(pos);
  });
  if (!edge) return null;
  // Inward = opposite of the outward direction
  return oppositeDirection(edge.direction);
}
