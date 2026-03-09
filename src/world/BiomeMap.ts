import { PerlinNoise } from './PerlinNoise';

export type BiomeType =
  | 'deep_ocean'
  | 'ocean'
  | 'beach'
  | 'plains'
  | 'forest'
  | 'dense_forest'
  | 'desert'
  | 'hills'
  | 'mountains'
  | 'snow';

export interface BiomeInfo {
  type: BiomeType;
  color: number;
  elevation: number;
  moisture: number;
}

/**
 * Visual bands — only 5 distinct colors for a clean vector look.
 * Game logic still uses the full BiomeType for city placement etc.
 */
type VisualBand = 'water' | 'shore' | 'low' | 'mid' | 'high';

const BAND_COLORS: Record<VisualBand, number> = {
  water: 0x9ac0d6,
  shore: 0xe0d4b8,
  low:   0xc4d6a0,
  mid:   0x9aba8c,
  high:  0xbcb4ac,
};

function toBand(type: BiomeType): VisualBand {
  switch (type) {
    case 'deep_ocean':
    case 'ocean':
      return 'water';
    case 'beach':
      return 'shore';
    case 'plains':
    case 'desert':
      return 'low';
    case 'forest':
    case 'dense_forest':
    case 'hills':
      return 'mid';
    case 'mountains':
    case 'snow':
      return 'high';
  }
}

const FIXED_SEED = 42;

export class BiomeMap {
  readonly width: number;
  readonly height: number;

  private elevationNoise: PerlinNoise;
  private moistureNoise: PerlinNoise;
  private continentNoise: PerlinNoise;
  private ridgeNoise: PerlinNoise;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;

    this.elevationNoise = new PerlinNoise(FIXED_SEED);
    this.moistureNoise = new PerlinNoise(FIXED_SEED + 31337);
    this.continentNoise = new PerlinNoise(FIXED_SEED + 12345);
    this.ridgeNoise = new PerlinNoise(FIXED_SEED + 55555);
  }

  /** Sample elevation at a pixel position [0, 1] */
  getElevation(px: number, py: number): number {
    const nx = px / this.width;
    const ny = py / this.height;

    // Continent shapes
    const continent = this.continentNoise.fbm(nx * 2.2, ny * 2.2, 3, 2, 0.55);
    const continent2 = this.continentNoise.fbm(nx * 3.5 + 10, ny * 3.5 + 10, 2, 2, 0.5);

    // Terrain detail
    const terrain = this.elevationNoise.fbm(nx * 5, ny * 5, 3, 2, 0.5);

    // Mountain ridges: squared absolute noise for concentrated peaks
    const ridgeRaw = this.ridgeNoise.fbm(nx * 3, ny * 3, 3, 2, 0.5);
    const ridge = ridgeRaw * ridgeRaw; // squaring emphasizes peaks

    let elevation = continent * 0.35 + continent2 * 0.1 + terrain * 0.15 + ridge * 0.4;

    // Edge falloff
    const edgeDist = this.edgeDistance(nx, ny);
    const edgeFalloff = smoothstep(0, 0.15, edgeDist);
    elevation = elevation * edgeFalloff - (1 - edgeFalloff) * 0.4;

    // Normalize and apply contrast to spread the range
    let norm = clamp((elevation + 0.9) / 1.8, 0, 1);
    // Contrast boost: push mid-values apart
    norm = norm * norm * (3 - 2 * norm); // smoothstep S-curve for more contrast
    return norm;
  }

  /** Sample moisture at a pixel position [0, 1] */
  getMoisture(px: number, py: number): number {
    const nx = px / this.width;
    const ny = py / this.height;
    const raw = this.moistureNoise.fbm(nx * 4, ny * 4, 4, 2, 0.45);
    return clamp((raw + 1) / 2, 0, 1);
  }

  /** Get biome info at a pixel position */
  getAt(px: number, py: number): BiomeInfo {
    const elevation = this.getElevation(px, py);
    const moisture = this.getMoisture(px, py);
    const type = classifyBiome(elevation, moisture);

    // Flat color per visual band
    const color = BAND_COLORS[toBand(type)];

    return { type, color, elevation, moisture };
  }

  /** Distance from edge of map, normalized [0, 0.5] */
  private edgeDistance(nx: number, ny: number): number {
    const dx = Math.min(nx, 1 - nx);
    const dy = Math.min(ny, 1 - ny);
    return Math.min(dx, dy);
  }

  /** Check if a position is on land */
  isLand(px: number, py: number): boolean {
    const elev = this.getElevation(px, py);
    return elev >= 0.36;
  }

  /** Check if a position is coastal (land next to water) */
  isCoastal(px: number, py: number): boolean {
    if (!this.isLand(px, py)) return false;
    const step = 16;
    for (const [dx, dy] of [[-step, 0], [step, 0], [0, -step], [0, step]]) {
      if (!this.isLand(px + dx, py + dy)) return true;
    }
    return false;
  }

  /** Generate a full terrain image as an offscreen Canvas */
  renderToCanvas(downscale = 1): HTMLCanvasElement {
    const w = Math.ceil(this.width / downscale);
    const h = Math.ceil(this.height / downscale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const px = x * downscale;
        const py = y * downscale;
        const biome = this.getAt(px, py);
        const color = biome.color;

        const idx = (y * w + x) * 4;
        data[idx] = (color >> 16) & 0xff;
        data[idx + 1] = (color >> 8) & 0xff;
        data[idx + 2] = color & 0xff;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }
}

function classifyBiome(elevation: number, moisture: number): BiomeType {
  if (elevation < 0.28) return 'deep_ocean';
  if (elevation < 0.36) return 'ocean';
  if (elevation < 0.40) return 'beach';

  if (elevation > 0.68) return 'snow';
  if (elevation > 0.58) return 'mountains';
  if (elevation > 0.50) return 'hills';

  if (moisture < 0.30) return 'desert';
  if (moisture < 0.48) return 'plains';
  if (moisture < 0.65) return 'forest';
  return 'dense_forest';
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
