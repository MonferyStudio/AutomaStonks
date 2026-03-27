import { Assets, Rectangle, Texture, ImageSource } from 'pixi.js';
import machinesData from '@/data/machines.json';
import resourcesData from '@/data/resources.json';
import { TRUCK_COLORS, TRUCK_BASE_DARK, TRUCK_BASE_LIGHT } from '@/data/truckColors';
import type { CityLayoutData } from '@/city/CityLayoutData';

/**
 * Centralized texture cache for all game sprites.
 * Handles loading, caching, and belt animation state.
 */
export class TextureCache {
  // Belt animation frames (16 frames of 16x16)
  static beltStraightFrames: Texture[] = [];
  static beltCurveFrames: Texture[] = [];
  static beltEntryFrames: Texture[] = [];
  static beltExitFrames: Texture[] = [];
  static readonly BELT_FRAME_COUNT = 16;
  static beltAnimFrame = 0;
  private static beltAnimTimer = 0;
  private static readonly BELT_ANIM_SPEED = 120; // ms per frame

  // Single-tile textures
  static wallCellTex: Texture | null = null;
  static bgCellTex: Texture | null = null;

  // Road spritesheet frames (6 frames: deadend_left, horizontal, deadend_right, deadend_up, vertical, deadend_down)
  static roadFrames: Texture[] = [];

  // City map images (keyed by city ID, e.g. "city_bramfeld")
  static cityMaps: Map<string, Texture> = new Map();

  // Truck sprites: key = `${spriteKey}_${colorId}`, value = [up, down, left, right]
  static truckFrames: Map<string, Texture[]> = new Map();

  // World map sprite (pixel art, scaled up ×8)
  static worldMapTex: Texture | null = null;

  // Exchanger animation frames (16 frames of 16x32)
  static exchangerFrames: Texture[] = [];

  // Machine sprites (keyed by machine ID, e.g. "machine_cutter")
  static machineTextures: Map<string, Texture> = new Map();

  // Item/resource sprites (keyed by resource ID, e.g. "plank", "wood_log")
  static itemTextures: Map<string, Texture> = new Map();

  private static loaded = false;

  static async loadTextures(): Promise<void> {
    if (TextureCache.loaded) return;

    const frameW = 16;
    const frameH = 16;

    // Load belt spritesheets (256x16, 16 frames of 16x16 each)
    const beltSheets = await Promise.all([
      Assets.load<Texture>('sprites/factory/belt_straight.png'),
      Assets.load<Texture>('sprites/factory/belt_curve.png'),
      Assets.load<Texture>('sprites/factory/belt_entry.png'),
      Assets.load<Texture>('sprites/factory/belt_exit.png'),
    ]);
    const [straightSheet, curveSheet, entrySheet, exitSheet] = beltSheets;

    const targets: [typeof straightSheet, Texture[]][] = [
      [straightSheet, TextureCache.beltStraightFrames],
      [curveSheet, TextureCache.beltCurveFrames],
      [entrySheet, TextureCache.beltEntryFrames],
      [exitSheet, TextureCache.beltExitFrames],
    ];
    for (const [sheet, framesArr] of targets) {
      sheet.source.scaleMode = 'nearest';
      for (let i = 0; i < TextureCache.BELT_FRAME_COUNT; i++) {
        framesArr.push(new Texture({
          source: sheet.source,
          frame: new Rectangle(i * frameW, 0, frameW, frameH),
        }));
      }
    }

    // Load exchanger spritesheet (256x32, 16 frames of 16x32)
    try {
      const exchSheet = await Assets.load<Texture>('sprites/factory/belt_exchanger.png');
      exchSheet.source.scaleMode = 'nearest';
      for (let i = 0; i < TextureCache.BELT_FRAME_COUNT; i++) {
        TextureCache.exchangerFrames.push(new Texture({
          source: exchSheet.source,
          frame: new Rectangle(i * 16, 0, 16, 32),
        }));
      }
    } catch {
      // Exchanger spritesheet not available
    }

    // Load single-tile sprites
    TextureCache.wallCellTex = await Assets.load<Texture>('sprites/factory/wall_cell.png');
    TextureCache.wallCellTex.source.scaleMode = 'nearest';

    TextureCache.bgCellTex = await Assets.load<Texture>('sprites/factory/background_cell.png');
    TextureCache.bgCellTex.source.scaleMode = 'nearest';

    // Load world map sprite (pixel art 500×350, scaled ×8 at render time)
    try {
      TextureCache.worldMapTex = await Assets.load<Texture>('sprites/world/world_map.png');
      TextureCache.worldMapTex.source.scaleMode = 'nearest';
    } catch {
      // World map sprite not yet available
    }

    // Load road spritesheet (96x16, 6 frames of 16x16 in a row)
    // Order: deadend_left(0), horizontal(1), deadend_right(2), deadend_up(3), vertical(4), deadend_down(5)
    const roadSheet = await Assets.load<Texture>('sprites/city/road_spritesheet.png');
    roadSheet.source.scaleMode = 'nearest';
    for (let i = 0; i < 6; i++) {
      TextureCache.roadFrames.push(new Texture({
        source: roadSheet.source,
        frame: new Rectangle(i * 16, 0, 16, 16),
      }));
    }

    // Load city map images from JSON data (mapImage field)
    await TextureCache.loadCityMaps();

    // Load truck spritesheets for all tiers and palette-swap for all color variants
    const truckSheets = ['small_truck', 'medium_truck', 'large_truck', 'heavy_truck'];
    for (const sheetKey of truckSheets) {
      try {
        const baseSheet = await Assets.load<Texture>(`sprites/city/${sheetKey}.png`);
        baseSheet.source.scaleMode = 'nearest';
        const baseSource = baseSheet.source.resource as HTMLImageElement | HTMLCanvasElement;
        const fw = Math.floor(baseSheet.width / 4);
        const fh = baseSheet.height;

        for (const colorDef of TRUCK_COLORS) {
          const swapped = TextureCache.paletteSwap(baseSource, baseSheet.width, baseSheet.height, colorDef.dark, colorDef.light);
          const imgSource = new ImageSource({ resource: swapped, scaleMode: 'nearest' });
          const frames: Texture[] = [];
          for (let i = 0; i < 4; i++) {
            frames.push(new Texture({
              source: imgSource,
              frame: new Rectangle(i * fw, 0, fw, fh),
            }));
          }
          TextureCache.truckFrames.set(`${sheetKey}_${colorDef.id}`, frames);
        }
      } catch {
        // Sprite not yet available for this tier
      }
    }

    // Load machine sprites (try loading for each known machine ID)
    await TextureCache.loadMachineTextures();

    // Load item/resource sprites
    await TextureCache.loadItemTextures();

    TextureCache.loaded = true;
  }

  /** Try to load machine sprites from sprites/factory/{machineId}.png */
  static async loadMachineTextures(): Promise<void> {
    for (const m of machinesData) {
      try {
        const tex = await Assets.load<Texture>(`sprites/factory/${m.id}.png`);
        tex.source.scaleMode = 'nearest';
        TextureCache.machineTextures.set(m.id, tex);
      } catch {
        // No sprite for this machine, will use programmatic fallback
      }
    }
  }

  /** Get machine texture by ID. Returns null if not loaded. */
  static getMachineTexture(machineId: string): Texture | null {
    return TextureCache.machineTextures.get(machineId) ?? null;
  }

  /** Try to load item/resource sprites using the "sprite" field from resources.json */
  static async loadItemTextures(): Promise<void> {
    for (const r of resourcesData) {
      const spritePath = (r as Record<string, unknown>).sprite as string | undefined;
      if (!spritePath) continue; // No sprite defined, will use programmatic shape fallback
      try {
        const tex = await Assets.load<Texture>(`sprites/items/${spritePath}.png`);
        tex.source.scaleMode = 'nearest';
        TextureCache.itemTextures.set(r.id, tex);
      } catch {
        // Sprite file not found, will use programmatic shape fallback
      }
    }
  }

  /** Get item texture by resource ID. Returns null if not loaded. */
  static getItemTexture(resourceId: string): Texture | null {
    return TextureCache.itemTextures.get(resourceId) ?? null;
  }

  /** Load city map images by scanning city JSON files for mapImage fields */
  static async loadCityMaps(): Promise<void> {
    const cityModules = import.meta.glob<CityLayoutData>(
      '@/data/cities/*.json',
      { eager: true, import: 'default' },
    );
    for (const [path, data] of Object.entries(cityModules)) {
      if (!data.mapImage) continue;
      const match = path.match(/\/([^/]+)\.json$/);
      if (!match) continue;
      const cityId = match[1];
      try {
        const tex = await Assets.load<Texture>(`sprites/city/${data.mapImage}`);
        tex.source.scaleMode = 'nearest';
        TextureCache.cityMaps.set(cityId, tex);
      } catch {
        // Map image not found, city will use procedural rendering
      }
    }
  }

  /** Call each frame to advance belt animation */
  static updateBeltAnimation(deltaMs: number): void {
    TextureCache.beltAnimTimer += deltaMs;
    if (TextureCache.beltAnimTimer >= TextureCache.BELT_ANIM_SPEED) {
      TextureCache.beltAnimTimer -= TextureCache.BELT_ANIM_SPEED;
      TextureCache.beltAnimFrame = (TextureCache.beltAnimFrame + 1) % TextureCache.BELT_FRAME_COUNT;
    }
  }

  /** Get city map texture by city ID. Returns null if not loaded. */
  static getCityMap(cityId: string): Texture | null {
    return TextureCache.cityMaps.get(cityId) ?? null;
  }

  /** Get truck frames [up, down, left, right] for a sprite key + color variant. */
  static getTruckFrames(spriteKey: string, variant: string): Texture[] | null {
    return TextureCache.truckFrames.get(`${spriteKey}_${variant}`)
      ?? TextureCache.truckFrames.get(`small_truck_${variant}`)
      ?? null;
  }

  /** Palette-swap the red truck spritesheet to a new dark/light pair */
  private static paletteSwap(
    source: HTMLImageElement | HTMLCanvasElement,
    w: number, h: number,
    newDark: number, newLight: number,
  ): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(source, 0, 0);
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    const baseDR = (TRUCK_BASE_DARK >> 16) & 0xff;
    const baseDG = (TRUCK_BASE_DARK >> 8) & 0xff;
    const basoDB = TRUCK_BASE_DARK & 0xff;
    const baseLR = (TRUCK_BASE_LIGHT >> 16) & 0xff;
    const baseLG = (TRUCK_BASE_LIGHT >> 8) & 0xff;
    const baseLB = TRUCK_BASE_LIGHT & 0xff;

    const nDR = (newDark >> 16) & 0xff;
    const nDG = (newDark >> 8) & 0xff;
    const nDB = newDark & 0xff;
    const nLR = (newLight >> 16) & 0xff;
    const nLG = (newLight >> 8) & 0xff;
    const nLB = newLight & 0xff;

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (r === baseDR && g === baseDG && b === basoDB) {
        d[i] = nDR; d[i + 1] = nDG; d[i + 2] = nDB;
      } else if (r === baseLR && g === baseLG && b === baseLB) {
        d[i] = nLR; d[i + 1] = nLG; d[i + 2] = nLB;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    return canvas;
  }
}
