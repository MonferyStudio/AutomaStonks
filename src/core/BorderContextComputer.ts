import { Vector2 } from '@/utils/Vector2';
import { Direction, ALL_DIRECTIONS, directionToVector } from '@/utils/Direction';
import { FACTORY_CELL_RATIO } from '@/utils/Constants';
import type { FactoryBorderContext, BorderEdge, BorderEdgeType } from '@/simulation/FactoryBorderContext';
import type { CitySlot } from '@/city/CitySlot';
import type { CityLayout } from '@/city/CityLayoutData';

/**
 * Computes the border context for a factory slot based on its city neighbors,
 * or uses manual border definitions when present.
 */
export function computeBorderContext(slot: CitySlot, layout?: CityLayout): FactoryBorderContext {
  // If manual border is defined, use it instead of auto-computing
  if (slot.manualBorder.length > 0) {
    return computeManualBorder(slot);
  }
  return computeAutoBorder(slot, layout);
}

/**
 * Build border context from manual border definitions on the slot.
 * Each entry specifies a factory-grid cell and whether it's a wall or road.
 * We generate edges for the full perimeter of the interior grid.
 */
function computeManualBorder(slot: CitySlot): FactoryBorderContext {
  const edges: BorderEdge[] = [];
  // Grid dimensions = interiorSize * FACTORY_CELL_RATIO
  const iw = slot.interiorSize.w * FACTORY_CELL_RATIO;
  const ih = slot.interiorSize.h * FACTORY_CELL_RATIO;

  // Build lookup of manual border types by position
  const manualMap = new Map<string, 'wall' | 'road'>();
  for (const b of slot.manualBorder) {
    manualMap.set(`${b.x},${b.y}`, b.type);
  }

  // Generate border cells around the perimeter (one cell outside the interior grid)
  // Top edge: y = -1, x from -1 to iw
  for (let x = -1; x <= iw; x++) {
    addBorderEdge(edges, manualMap, x, -1, iw, ih);
  }
  // Bottom edge: y = ih, x from -1 to iw
  for (let x = -1; x <= iw; x++) {
    addBorderEdge(edges, manualMap, x, ih, iw, ih);
  }
  // Left edge: x = -1, y from 0 to ih-1
  for (let y = 0; y < ih; y++) {
    addBorderEdge(edges, manualMap, -1, y, iw, ih);
  }
  // Right edge: x = iw, y from 0 to ih-1
  for (let y = 0; y < ih; y++) {
    addBorderEdge(edges, manualMap, iw, y, iw, ih);
  }

  return { edges };
}

function addBorderEdge(
  edges: BorderEdge[],
  manualMap: Map<string, 'wall' | 'road'>,
  bx: number, by: number,
  iw: number, ih: number,
): void {
  const key = `${bx},${by}`;
  const manualType = manualMap.get(key);
  const edgeType: BorderEdgeType = manualType === 'road' ? 'road' : 'empty';

  // Determine which interior cell this border cell is adjacent to, and the direction
  // A border cell can be adjacent to multiple interior cells (corners), but we pick
  // the primary adjacency based on position
  const dirs: { fx: number; fy: number; dir: Direction }[] = [];

  if (by === -1 && bx >= 0 && bx < iw) {
    dirs.push({ fx: bx, fy: 0, dir: Direction.Up });
  }
  if (by === ih && bx >= 0 && bx < iw) {
    dirs.push({ fx: bx, fy: ih - 1, dir: Direction.Down });
  }
  if (bx === -1 && by >= 0 && by < ih) {
    dirs.push({ fx: 0, fy: by, dir: Direction.Left });
  }
  if (bx === iw && by >= 0 && by < ih) {
    dirs.push({ fx: iw - 1, fy: by, dir: Direction.Right });
  }

  // Corner cells: adjacent to two interior cells
  // Top-left corner (-1, -1) → adjacent to (0,0) Up and Left
  // We generate both edges for corners
  for (const { fx, fy, dir } of dirs) {
    edges.push({
      factoryCell: new Vector2(fx, fy),
      direction: dir,
      type: edgeType,
    });
  }
}

/** Auto-compute border from city layout neighbors (original algorithm) */
function computeAutoBorder(slot: CitySlot, layout?: CityLayout): FactoryBorderContext {
  const edges: BorderEdge[] = [];

  // Build set of city cells occupied by this slot
  const slotCityCells = new Set(
    slot.getCells().map(c => c.add(slot.position).toKey()),
  );

  // Build set of all occupied city cells (other buildings)
  const occupiedCity = new Set<string>();
  if (layout) {
    for (const s of layout.factorySlots) {
      if (s === slot) continue;
      for (const c of s.getCells()) occupiedCity.add(c.add(s.position).toKey());
    }
    for (const s of layout.shopSlots) {
      for (const c of s.getCells()) occupiedCity.add(c.add(s.position).toKey());
    }
    for (const s of layout.storageSlots) {
      for (const c of s.getCells()) occupiedCity.add(c.add(s.position).toKey());
    }
  }

  const R = FACTORY_CELL_RATIO;

  for (const cell of slot.getCells()) {
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
