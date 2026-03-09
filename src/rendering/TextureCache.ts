import { Assets, Rectangle, Texture } from 'pixi.js';

/**
 * Centralized texture cache for all game sprites.
 * Handles loading, caching, and belt animation state.
 */
export class TextureCache {
  // Belt animation frames
  static beltStraightFrames: Texture[] = [];
  static beltCurveFrames: Texture[] = [];
  static readonly BELT_FRAME_COUNT = 8;
  static beltAnimFrame = 0;
  private static beltAnimTimer = 0;
  private static readonly BELT_ANIM_SPEED = 120; // ms per frame

  // Single-tile textures
  static wallCellTex: Texture | null = null;
  static bgCellTex: Texture | null = null;
  static beltEntryTex: Texture | null = null;
  static beltExitTex: Texture | null = null;

  // Road textures
  static roadStraightTex: Texture | null = null;
  static roadCurveTex: Texture | null = null;
  static roadDeadendTex: Texture | null = null;
  static roadTjunctionTex: Texture | null = null;
  static roadCrossroadTex: Texture | null = null;

  // Building spritesheets (keyed by building type)
  static buildingFrames: Map<string, Texture[]> = new Map();

  private static loaded = false;

  static async loadTextures(): Promise<void> {
    if (TextureCache.loaded) return;

    const frameW = 32;
    const frameH = 32;

    // Load straight belt spritesheet (256x32, 8 frames of 32x32)
    const straightSheet = await Assets.load<Texture>('sprites/belt_straight.png');
    straightSheet.source.scaleMode = 'nearest';
    for (let i = 0; i < TextureCache.BELT_FRAME_COUNT; i++) {
      TextureCache.beltStraightFrames.push(new Texture({
        source: straightSheet.source,
        frame: new Rectangle(i * frameW, 0, frameW, frameH),
      }));
    }

    // Load curve belt spritesheet (256x32, 8 frames of 32x32)
    const curveSheet = await Assets.load<Texture>('sprites/belt_curve.png');
    curveSheet.source.scaleMode = 'nearest';
    for (let i = 0; i < TextureCache.BELT_FRAME_COUNT; i++) {
      TextureCache.beltCurveFrames.push(new Texture({
        source: curveSheet.source,
        frame: new Rectangle(i * frameW, 0, frameW, frameH),
      }));
    }

    // Load single-tile sprites
    TextureCache.wallCellTex = await Assets.load<Texture>('sprites/wall_cell.png');
    TextureCache.wallCellTex.source.scaleMode = 'nearest';

    TextureCache.bgCellTex = await Assets.load<Texture>('sprites/background_cell.png');
    TextureCache.bgCellTex.source.scaleMode = 'nearest';

    const [entryTex, exitTex] = await Promise.all([
      Assets.load<Texture>('sprites/belt_entry.png'),
      Assets.load<Texture>('sprites/belt_exit.png'),
    ]);
    entryTex.source.scaleMode = 'nearest';
    exitTex.source.scaleMode = 'nearest';
    TextureCache.beltEntryTex = entryTex;
    TextureCache.beltExitTex = exitTex;

    // Load road sprites
    const roadNames = ['road_straight', 'road_curve', 'road_deadend', 'road_tjunction', 'road_crossroad'] as const;
    const roadTextures = await Promise.all(roadNames.map(n => Assets.load<Texture>(`sprites/${n}.png`)));
    for (const tex of roadTextures) tex.source.scaleMode = 'nearest';
    [TextureCache.roadStraightTex, TextureCache.roadCurveTex, TextureCache.roadDeadendTex,
     TextureCache.roadTjunctionTex, TextureCache.roadCrossroadTex] = roadTextures;

    // Load building spritesheets (dynamic grid of 32×32 tiles)
    const buildingTypes = ['shop', 'factory', 'storage', 'house'] as const;
    for (const type of buildingTypes) {
      try {
        const sheet = await Assets.load<Texture>(`sprites/${type}_spritesheet.png`);
        sheet.source.scaleMode = 'nearest';
        const frames: Texture[] = [];
        const cols = Math.floor(sheet.width / 32);
        const rows = Math.floor(sheet.height / 32);
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            frames.push(new Texture({
              source: sheet.source,
              frame: new Rectangle(col * 32, row * 32, 32, 32),
            }));
          }
        }
        TextureCache.buildingFrames.set(type, frames);
      } catch {
        // Spritesheet not yet available, skip
      }
    }

    TextureCache.loaded = true;
  }

  /** Call each frame to advance belt animation */
  static updateBeltAnimation(deltaMs: number): void {
    TextureCache.beltAnimTimer += deltaMs;
    if (TextureCache.beltAnimTimer >= TextureCache.BELT_ANIM_SPEED) {
      TextureCache.beltAnimTimer -= TextureCache.BELT_ANIM_SPEED;
      TextureCache.beltAnimFrame = (TextureCache.beltAnimFrame + 1) % TextureCache.BELT_FRAME_COUNT;
    }
  }

  /** Get building frames for a building type. Returns null if not loaded. */
  static getBuildingFrames(type: string): Texture[] | null {
    return TextureCache.buildingFrames.get(type) ?? null;
  }
}
