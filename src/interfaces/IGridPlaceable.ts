import type { Vector2 } from '@/utils/Vector2';
import type { Grid } from '@/simulation/Grid';

export interface IGridPlaceable {
  readonly id: string;
  position: Vector2;
  getCells(): Vector2[];
  canPlaceAt(grid: Grid, position: Vector2): boolean;
  getRotatedCells(rotation: number): Vector2[];
}
