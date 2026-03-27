import { Texture } from 'pixi.js';
import { TextureCache } from './TextureCache';

/**
 * Pure functions for resolving tile sprites based on neighbor connectivity.
 * Used by FactoryRenderer (border roads).
 */

/**
 * Road spritesheet layout (6 frames of 16x16 in a row):
 *   0: deadend_left   1: horizontal   2: deadend_right
 *   3: deadend_up     4: vertical     5: deadend_down
 */

/** Pick road texture frame based on cardinal neighbor connectivity. */
export function getRoadSpriteInfo(up: boolean, down: boolean, left: boolean, right: boolean):
    { tex: Texture | null; rotation: number } {

  // Map connectivity patterns to the 6 available frames
  let frameIdx: number;

  const h = left || right;
  const v = up || down;

  if (h && v) {
    // T-junction or crossroad: pick dominant axis (horizontal wins)
    frameIdx = 1; // horizontal
  } else if (left && right) {
    frameIdx = 1; // horizontal
  } else if (up && down) {
    frameIdx = 4; // vertical
  } else if (left && !right) {
    frameIdx = 2; // deadend_right (open end faces right)
  } else if (right && !left) {
    frameIdx = 0; // deadend_left (open end faces left)
  } else if (up && !down) {
    frameIdx = 5; // deadend_down (open end faces down)
  } else if (down && !up) {
    frameIdx = 3; // deadend_up (open end faces up)
  } else {
    // Isolated: use horizontal as fallback
    frameIdx = 1;
  }

  const tex = TextureCache.roadFrames[frameIdx] ?? null;
  return { tex, rotation: 0 };
}
