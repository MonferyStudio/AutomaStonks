import { Vector2 } from '@/utils/Vector2';
import { Direction, ALL_DIRECTIONS, directionToVector } from '@/utils/Direction';
import { FACTORY_CELL_RATIO } from '@/utils/Constants';
import type { FactoryBorderContext, BorderEdge, BorderEdgeType } from '@/simulation/FactoryBorderContext';
import type { CitySlot } from '@/city/CitySlot';
import type { CityLayout } from '@/city/CityGenerator';

/**
 * Computes the border context for a factory slot based on its city neighbors.
 * Extracted from Game.ts to follow SRP.
 */
export function computeBorderContext(slot: CitySlot, layout?: CityLayout): FactoryBorderContext {
  const edges: BorderEdge[] = [];

  // Build set of city cells occupied by this slot
  const slotCityCells = new Set(
    slot.polyomino.cells.map(c => c.add(slot.position).toKey()),
  );

  // Build set of all occupied city cells (other buildings)
  const occupiedCity = new Set<string>();
  if (layout) {
    for (const s of layout.factorySlots) {
      if (s === slot) continue;
      for (const c of s.polyomino.cells) occupiedCity.add(c.add(s.position).toKey());
    }
    for (const s of layout.shopSlots) {
      for (const c of s.polyomino.cells) occupiedCity.add(c.add(s.position).toKey());
    }
    for (const s of layout.storageSlots) {
      for (const c of s.polyomino.cells) occupiedCity.add(c.add(s.position).toKey());
    }
    for (const d of layout.decorations) {
      for (const c of d.polyomino.cells) occupiedCity.add(c.add(d.position).toKey());
    }
  }

  const R = FACTORY_CELL_RATIO;

  for (const cell of slot.polyomino.cells) {
    const cityCell = cell.add(slot.position);

    for (const dir of ALL_DIRECTIONS) {
      const neighbor = cityCell.add(directionToVector(dir));

      // Skip if neighbor is part of this same slot (internal edge)
      if (slotCityCells.has(neighbor.toKey())) continue;

      // Determine what's on the other side
      let type: BorderEdgeType = 'empty';
      if (layout) {
        if (!layout.roadNetwork.inBounds(neighbor)) {
          type = 'out_of_bounds';
        } else if (layout.roadNetwork.isRoad(neighbor)) {
          type = 'road';
        } else if (occupiedCity.has(neighbor.toKey())) {
          type = 'building';
        }
      }

      // Generate the FACTORY_CELL_RATIO border cells along this edge
      for (let i = 0; i < R; i++) {
        let fx: number, fy: number;
        switch (dir) {
          case Direction.Up:
            fx = cell.x * R + i;
            fy = cell.y * R;
            break;
          case Direction.Down:
            fx = cell.x * R + i;
            fy = cell.y * R + (R - 1);
            break;
          case Direction.Left:
            fx = cell.x * R;
            fy = cell.y * R + i;
            break;
          case Direction.Right:
            fx = cell.x * R + (R - 1);
            fy = cell.y * R + i;
            break;
        }
        edges.push({
          factoryCell: new Vector2(fx, fy),
          direction: dir,
          type,
        });
      }
    }
  }

  return { edges };
}
