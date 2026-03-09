export const TICK_RATE = 10;
export const TICK_INTERVAL_MS = 1000 / TICK_RATE;
export const MAX_CATCHUP_TICKS = 5;

export const CELL_SIZE_PX = 64;
export const FACTORY_CELL_RATIO = 5;

export const POLYOMINO_MAX_BBOX = 5;

export const BELT_TIERS = {
  1: { speed: 1, color: 0x8892a4 },
  2: { speed: 2, color: 0x4dc9f6 },
  3: { speed: 4, color: 0xa855f7 },
} as const;

export const TUNNEL_TIERS = {
  1: { range: 3 },
  2: { range: 7 },
  3: { range: 15 },
} as const;

export const COLORS = {
  BG_PRIMARY: 0x1a1a2e,
  BG_SURFACE: 0x16213e,
  BG_CARD: 0x1c2541,
  TEXT_PRIMARY: 0xe8e8e8,
  TEXT_DIM: 0x8892a4,
  FACTORY: 0xff8c42,
  SHOP: 0x4dc9f6,
  STORAGE: 0x8B5E3C,
  HOUSE: 0x53d769,
  LOCKED: 0x4a5568,
  ACCENT_RED: 0xe94560,
  ACCENT_VIOLET: 0xa855f7,
  ACCENT_YELLOW: 0xf5c842,
  GRID_BG: 0x0d1525,
  GRID_LINE: 0xffffff,
  BELT: 0x2d3548,
  IO_INPUT: 0x53d769,
  IO_OUTPUT: 0xe94560,
} as const;

export const GRID_LINE_ALPHA = 0.03;
export const SHADOW_OFFSET = 3;
export const SHADOW_ALPHA = 0.35;
export const CONVEX_RADIUS_RATIO = 0.22;
export const CONCAVE_RADIUS_RATIO = 0.08;
