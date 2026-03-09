import { Texture } from 'pixi.js';
import { TextureCache } from './TextureCache';

/**
 * Pure functions for resolving tile sprites based on neighbor connectivity.
 * Used by both FactoryRenderer (border roads) and CityRenderer (city roads + buildings).
 */

/**
 * Pick road texture + rotation based on cardinal neighbor connectivity.
 * Base orientations (0° rotation):
 *   straight: horizontal (L↔R)
 *   dead-end: open DOWN
 *   curve: DOWN+RIGHT
 *   t-junction: UP+DOWN+RIGHT (left closed)
 *   crossroad: all 4
 */
export function getRoadSpriteInfo(up: boolean, down: boolean, left: boolean, right: boolean):
    { tex: Texture | null; rotation: number } {
  const count = +up + +down + +left + +right;

  if (count === 4) {
    return { tex: TextureCache.roadCrossroadTex, rotation: 0 };
  }
  if (count === 3) {
    let rotation = 0;
    if (!left) rotation = 0;
    else if (!up) rotation = Math.PI / 2;
    else if (!right) rotation = Math.PI;
    else if (!down) rotation = -Math.PI / 2;
    return { tex: TextureCache.roadTjunctionTex, rotation };
  }
  if (count === 2) {
    if (up && down) return { tex: TextureCache.roadStraightTex, rotation: Math.PI / 2 };
    if (left && right) return { tex: TextureCache.roadStraightTex, rotation: 0 };
    if (down && right) return { tex: TextureCache.roadCurveTex, rotation: 0 };
    if (down && left) return { tex: TextureCache.roadCurveTex, rotation: Math.PI / 2 };
    if (up && left) return { tex: TextureCache.roadCurveTex, rotation: Math.PI };
    if (up && right) return { tex: TextureCache.roadCurveTex, rotation: -Math.PI / 2 };
  }
  if (count === 1) {
    if (down) return { tex: TextureCache.roadDeadendTex, rotation: 0 };
    if (left) return { tex: TextureCache.roadDeadendTex, rotation: Math.PI / 2 };
    if (up) return { tex: TextureCache.roadDeadendTex, rotation: Math.PI };
    if (right) return { tex: TextureCache.roadDeadendTex, rotation: -Math.PI / 2 };
  }
  return { tex: TextureCache.roadStraightTex, rotation: 0 };
}

// Spritesheet layout: 12 cols x 3 rows (32px tiles)
// Row 0: TL(0) Top(1) TR(2) CapUp(3) ?(4) ?(5) CapRight(6) TL+InnerBR(7) StripH(8) TR+InnerBL(9) ?(10) ?(11)
// Row 1: Left(12) Center(13) Right(14) StripV(15) InnerBL(16) InnerBR(17) Solo(18) CapRight(19) empty(20) CapLeft(21) LeftE+InnerTR(22) RightE+InnerTL(23)
// Row 2: BL(24) Bottom(25) BR(26) CapDown(27) InnerTL(28) InnerTR(29) empty(30-35)

/**
 * Get tile indices for a building cell based on its cardinal + diagonal neighbors.
 * Returns an array of indices: base tile first, then optional inner-corner overlays.
 */
export function getBuildingTileIndices(
  up: boolean, down: boolean, left: boolean, right: boolean,
  diagTL: boolean, diagTR: boolean, diagBL: boolean, diagBR: boolean,
): number[] {
  const indices: number[] = [];
  const count = +up + +down + +left + +right;

  // Solo — no neighbors
  if (count === 0) {
    indices.push(18);
    return indices;
  }

  // Caps — single neighbor
  if (count === 1) {
    if (down) indices.push(3);        // Cap up (neighbor below)
    else if (up) indices.push(27);    // Cap down (neighbor above)
    else if (right) indices.push(24); // Cap left (neighbor right) — uses BL-style tile
    else indices.push(6);             // Cap right (neighbor left)
    return indices;
  }

  // Strips — two opposite neighbors
  if (count === 2 && up && down) { indices.push(15); return indices; }
  if (count === 2 && left && right) { indices.push(8); return indices; }

  // Corners (2 missing adjacent edges) — use combined tiles with inner corners baked in
  if (!up && !left) {
    if (down && right && !diagBR) indices.push(7);  // TL + InnerBR combined
    else indices.push(0);                            // Plain TL
    return indices;
  }
  if (!up && !right) {
    if (down && left && !diagBL) indices.push(9);   // TR + InnerBL combined
    else indices.push(2);                            // Plain TR
    return indices;
  }
  if (!down && !left) {
    indices.push(24);                                // BL corner
    return indices;
  }
  if (!down && !right) {
    indices.push(26);                                // BR corner
    return indices;
  }

  // Edge and center tiles — inner corners via combined tiles or overlays
  const needInnerTL = up && left && !diagTL;
  const needInnerTR = up && right && !diagTR;
  const needInnerBL = down && left && !diagBL;
  const needInnerBR = down && right && !diagBR;

  if (!left) {
    // Left Edge — combined variant available for InnerTR
    if (needInnerTR) {
      indices.push(22);  // Left Edge + InnerTR combined
      if (needInnerBR) indices.push(17);  // Additional InnerBR overlay
    } else {
      indices.push(12);  // Plain Left Edge
      if (needInnerBR) indices.push(17);  // InnerBR overlay
    }
  } else if (!right) {
    // Right Edge — combined variant available for InnerTL
    if (needInnerTL) {
      indices.push(23);  // Right Edge + InnerTL combined
      if (needInnerBL) indices.push(16);  // Additional InnerBL overlay
    } else {
      indices.push(14);  // Plain Right Edge
      if (needInnerBL) indices.push(16);  // InnerBL overlay
    }
  } else if (!up) {
    // Top Edge
    indices.push(1);
    if (needInnerBL) indices.push(16);
    if (needInnerBR) indices.push(17);
  } else if (!down) {
    // Bottom Edge
    indices.push(25);
    if (needInnerTL) indices.push(28);
    if (needInnerTR) indices.push(29);
  } else {
    // Center
    indices.push(13);
    if (needInnerTL) indices.push(28);
    if (needInnerTR) indices.push(29);
    if (needInnerBL) indices.push(16);
    if (needInnerBR) indices.push(17);
  }

  return indices;
}
