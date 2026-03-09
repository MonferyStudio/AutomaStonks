import { Graphics } from 'pixi.js';
import { Polyomino } from '@/simulation/Polyomino';
import { CELL_SIZE_PX, SHADOW_OFFSET, SHADOW_ALPHA, CONVEX_RADIUS_RATIO, CONCAVE_RADIUS_RATIO } from '@/utils/Constants';
import { Vector2 } from '@/utils/Vector2';

interface ContourPoint {
  x: number;
  y: number;
  convex: boolean;
}

export class PolyominoRenderer {
  drawPolyomino(g: Graphics, polyomino: Polyomino, color: number, cellSize: number = CELL_SIZE_PX): void {
    const contour = this.traceContour(polyomino, cellSize);
    if (contour.length < 3) return;

    const convexR = cellSize * CONVEX_RADIUS_RATIO;
    const concaveR = cellSize * CONCAVE_RADIUS_RATIO;

    // Shadow
    g.moveTo(contour[0].x + SHADOW_OFFSET, contour[0].y + SHADOW_OFFSET);
    for (let i = 0; i < contour.length; i++) {
      const curr = contour[i];
      const next = contour[(i + 1) % contour.length];
      g.lineTo(next.x + SHADOW_OFFSET, next.y + SHADOW_OFFSET);
    }
    g.closePath();
    g.fill({ color: 0x000000, alpha: SHADOW_ALPHA });

    // Main body
    this.drawRoundedContour(g, contour, convexR, concaveR);
    g.fill(color);

    // Highlight (top portion)
    g.rect(
      polyomino.cells[0].x * cellSize,
      polyomino.cells[0].y * cellSize,
      polyomino.boundingBox.width * cellSize,
      cellSize * 0.4,
    );
    g.fill({ color: 0xffffff, alpha: 0.1 });
  }

  private drawRoundedContour(
    g: Graphics,
    contour: ContourPoint[],
    convexR: number,
    concaveR: number,
  ): void {
    if (contour.length < 3) return;

    const getRadius = (pt: ContourPoint) => (pt.convex ? convexR : concaveR);

    const startPt = contour[0];
    const nextPt = contour[1];
    const r0 = getRadius(startPt);
    const dx = nextPt.x - startPt.x;
    const dy = nextPt.y - startPt.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const startX = startPt.x + (dx / len) * r0;
    const startY = startPt.y + (dy / len) * r0;

    g.moveTo(startX, startY);

    for (let i = 0; i < contour.length; i++) {
      const prev = contour[i];
      const curr = contour[(i + 1) % contour.length];
      const next = contour[(i + 2) % contour.length];

      const r = getRadius(curr);
      g.arcTo(curr.x, curr.y, next.x, next.y, r);
    }

    g.closePath();
  }

  private traceContour(polyomino: Polyomino, cellSize: number): ContourPoint[] {
    const points: ContourPoint[] = [];
    const cellSet = new Set(polyomino.cells.map((c) => c.toKey()));

    for (const cell of polyomino.cells) {
      const x = cell.x * cellSize;
      const y = cell.y * cellSize;

      const corners = [
        { dx: 0, dy: 0, adjacentCells: [[-1, -1], [-1, 0], [0, -1]] },
        { dx: 1, dy: 0, adjacentCells: [[0, -1], [1, 0], [1, -1]] },
        { dx: 1, dy: 1, adjacentCells: [[1, 0], [0, 1], [1, 1]] },
        { dx: 0, dy: 1, adjacentCells: [[-1, 0], [0, 1], [-1, 1]] },
      ];

      for (const corner of corners) {
        const cx = x + corner.dx * cellSize;
        const cy = y + corner.dy * cellSize;

        const neighborCount = corner.adjacentCells.filter(([ax, ay]) =>
          cellSet.has(new Vector2(cell.x + ax, cell.y + ay).toKey()),
        ).length;

        const isExterior = neighborCount < 3;
        if (isExterior) {
          const convex = neighborCount <= 1;
          if (!points.some((p) => Math.abs(p.x - cx) < 0.5 && Math.abs(p.y - cy) < 0.5)) {
            points.push({ x: cx, y: cy, convex });
          }
        }
      }
    }

    return this.sortContourClockwise(points);
  }

  private sortContourClockwise(points: ContourPoint[]): ContourPoint[] {
    if (points.length === 0) return points;

    let cx = 0;
    let cy = 0;
    for (const p of points) {
      cx += p.x;
      cy += p.y;
    }
    cx /= points.length;
    cy /= points.length;

    return points.sort((a, b) => {
      const angleA = Math.atan2(a.y - cy, a.x - cx);
      const angleB = Math.atan2(b.y - cy, b.x - cx);
      return angleA - angleB;
    });
  }
}
