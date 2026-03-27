import { Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import { COLORS, FONT_UI, FONT_MONO } from '@/utils/Constants';
import { formatNumber } from '@/utils/formatNumber';
import type { WorldMap, WorldCity } from './WorldMap';
import { TextureCache } from '@/rendering/TextureCache';

const TEXT_RESOLUTION = 4;
const CITY_SIZE = 32; // half-size of the city outer frame
const CITY_INNER_PAD = 6; // padding between frame and inner colored block
const CITY_CORNER = 8; // corner radius of city frame
const SHADOW_DX = 3;
const SHADOW_DY = 5;

export class WorldRenderer {
  readonly container: Container;

  private terrainLayer: Container;
  private connectionLayer: Container;
  private cityLayer: Container;
  private labelLayer: Container;

  private dirty = true;
  private terrainDrawn = false;

  constructor() {
    this.container = new Container();
    this.container.sortableChildren = true;

    this.terrainLayer = new Container();
    this.terrainLayer.zIndex = 0;
    this.connectionLayer = new Container();
    this.connectionLayer.zIndex = 1;
    this.cityLayer = new Container();
    this.cityLayer.zIndex = 2;
    this.labelLayer = new Container();
    this.labelLayer.zIndex = 3;

    this.container.addChild(this.terrainLayer, this.connectionLayer, this.cityLayer, this.labelLayer);
  }

  markDirty(): void {
    this.dirty = true;
  }

  render(worldMap: WorldMap): void {
    if (!this.terrainDrawn) {
      this.renderTerrain();
    }

    if (!this.dirty) return;
    this.dirty = false;

    this.connectionLayer.removeChildren().forEach(c => c.destroy({ children: true }));
    this.cityLayer.removeChildren().forEach(c => c.destroy({ children: true }));
    this.labelLayer.removeChildren().forEach(c => c.destroy({ children: true }));

    this.renderConnections(worldMap);
    this.renderCities(worldMap);
  }

  private renderTerrain(): void {
    this.terrainLayer.removeChildren().forEach(c => c.destroy({ children: true }));
    const tex = TextureCache.worldMapTex;
    if (!tex) return;
    const sprite = new Sprite(tex);
    sprite.scale.set(8); // 500×350 pixel art → 4000×2800 world
    this.terrainLayer.addChild(sprite);
    this.terrainDrawn = true;
  }

  private renderConnections(worldMap: WorldMap): void {
    const connections = worldMap.getConnections();

    // Collect segments for intersection detection
    type Seg = { fx: number; fy: number; tx: number; ty: number; unlocked: boolean };
    const segments: Seg[] = [];

    for (const conn of connections) {
      const fromCity = worldMap.getCity(conn.fromCityId);
      const toCity = worldMap.getCity(conn.toCityId);
      if (!fromCity || !toCity) continue;

      const bothUnlocked = fromCity.unlocked && toCity.unlocked;
      const fx = fromCity.position.x;
      const fy = fromCity.position.y;
      const tx = toCity.position.x;
      const ty = toCity.position.y;

      segments.push({ fx, fy, tx, ty, unlocked: bothUnlocked });

      const g = new Graphics();

      if (bothUnlocked) {
        // Outer glow — soft white halo
        g.moveTo(fx, fy);
        g.lineTo(tx, ty);
        g.stroke({ color: 0xffffff, alpha: 0.15, width: 18, cap: 'round' });

        // Road body — dark, solid
        g.moveTo(fx, fy);
        g.lineTo(tx, ty);
        g.stroke({ color: 0x3a3a4a, alpha: 0.55, width: 6, cap: 'round' });

        // Center line — subtle white stripe
        g.moveTo(fx, fy);
        g.lineTo(tx, ty);
        g.stroke({ color: 0xffffff, alpha: 0.12, width: 1.5, cap: 'round' });
      } else {
        // Locked road — dashed style via segments
        const dx = tx - fx;
        const dy = ty - fy;
        const len = Math.sqrt(dx * dx + dy * dy);
        const dashLen = 12;
        const gapLen = 10;
        const ux = dx / len;
        const uy = dy / len;

        let d = 0;
        while (d < len) {
          const startD = d;
          const endD = Math.min(d + dashLen, len);
          g.moveTo(fx + ux * startD, fy + uy * startD);
          g.lineTo(fx + ux * endD, fy + uy * endD);
          d += dashLen + gapLen;
        }
        g.stroke({ color: 0x555555, alpha: 0.25, width: 3, cap: 'round' });
      }

      this.connectionLayer.addChild(g);

      // Distance badge at midpoint
      const midX = (fx + tx) / 2;
      const midY = (fy + ty) / 2;

      if (bothUnlocked) {
        // Small pill background for distance
        const pill = new Graphics();
        pill.roundRect(midX - 14, midY - 9, 28, 18, 9);
        pill.fill({ color: 0x3a3a4a, alpha: 0.65 });
        this.connectionLayer.addChild(pill);
      }

      const distLabel = new Text({
        text: String(conn.distance),
        style: new TextStyle({
          fontFamily: FONT_UI,
          fontSize: bothUnlocked ? 10 : 8,
          fontWeight: '700',
          fill: bothUnlocked ? 0xffffff : 0x777777,
        }),
        resolution: TEXT_RESOLUTION,
      });
      distLabel.anchor.set(0.5);
      distLabel.position.set(midX, midY);
      this.connectionLayer.addChild(distLabel);
    }

    // Detect and render intersections
    this.renderIntersections(segments);
  }

  private renderIntersections(segments: { fx: number; fy: number; tx: number; ty: number; unlocked: boolean }[]): void {
    const intersections: { x: number; y: number; anyUnlocked: boolean }[] = [];

    for (let i = 0; i < segments.length; i++) {
      for (let j = i + 1; j < segments.length; j++) {
        const a = segments[i];
        const b = segments[j];
        const pt = segmentIntersection(a.fx, a.fy, a.tx, a.ty, b.fx, b.fy, b.tx, b.ty);
        if (pt) {
          intersections.push({ x: pt.x, y: pt.y, anyUnlocked: a.unlocked || b.unlocked });
        }
      }
    }

    for (const inter of intersections) {
      const g = new Graphics();
      const r = 8;

      if (inter.anyUnlocked) {
        // Glow behind intersection
        g.circle(inter.x, inter.y, r + 6);
        g.fill({ color: 0xffffff, alpha: 0.1 });

        // Dark circle
        g.circle(inter.x, inter.y, r);
        g.fill({ color: 0x3a3a4a, alpha: 0.7 });

        // Inner dot
        g.circle(inter.x, inter.y, 3);
        g.fill({ color: 0xffffff, alpha: 0.35 });
      } else {
        // Subtle locked intersection
        g.circle(inter.x, inter.y, 5);
        g.fill({ color: 0x555555, alpha: 0.3 });
      }

      this.connectionLayer.addChild(g);
    }
  }

  private renderCities(worldMap: WorldMap): void {
    for (const city of worldMap.getCities()) {
      const { x, y } = city.position;

      if (city.unlocked) {
        this.renderUnlockedCity(city, x, y);
      } else {
        this.renderLockedCity(city, x, y, this.cityLayer);
      }
    }
  }

  private renderUnlockedCity(city: WorldCity, x: number, y: number): void {
    const color = city.cityType.color;
    const s = CITY_SIZE;
    const pad = CITY_INNER_PAD;
    const r = CITY_CORNER;

    const g = new Graphics();

    // Drop shadow
    g.roundRect(x - s + SHADOW_DX, y - s + SHADOW_DY, s * 2, s * 2, r);
    g.fill({ color: 0x000000, alpha: 0.18 });

    // Dark frame
    g.roundRect(x - s, y - s, s * 2, s * 2, r);
    g.fill(0x3a3a4a);

    // Flat inner colored block
    const inner = s - pad;
    g.roundRect(x - inner, y - inner, inner * 2, inner * 2, r - 2);
    g.fill(color);

    this.cityLayer.addChild(g);

    // Initials in center of block
    const initials = getInitials(city.name);
    const initialsLabel = new Text({
      text: initials,
      style: new TextStyle({
        fontFamily: FONT_UI,
        fontSize: 16,
        fontWeight: '800',
        fill: 0xffffff,
      }),
      resolution: TEXT_RESOLUTION,
    });
    initialsLabel.anchor.set(0.5);
    initialsLabel.position.set(x, y);
    initialsLabel.alpha = 0.85;
    this.cityLayer.addChild(initialsLabel);

    // City name below
    const nameLabel = new Text({
      text: city.name,
      style: new TextStyle({
        fontFamily: FONT_UI,
        fontSize: 14,
        fontWeight: '800',
        fill: 0x3a3a4a,
      }),
      resolution: TEXT_RESOLUTION,
    });
    nameLabel.anchor.set(0.5, 0);
    nameLabel.position.set(x, y + s + 6);
    this.labelLayer.addChild(nameLabel);

    // Interactive hit area
    g.eventMode = 'static';
    g.cursor = 'pointer';
  }

  private renderLockedCity(city: WorldCity, x: number, y: number, layer: Container): void {
    const s = CITY_SIZE * 0.75;
    const r = CITY_CORNER - 1;

    const g = new Graphics();

    // Drop shadow
    g.roundRect(x - s + SHADOW_DX, y - s + SHADOW_DY, s * 2, s * 2, r);
    g.fill({ color: 0x000000, alpha: 0.1 });

    // Dark frame (muted)
    g.roundRect(x - s, y - s, s * 2, s * 2, r);
    g.fill({ color: 0x3a3a4a, alpha: 0.45 });

    // Dashed inner border (empty slot indicator)
    g.roundRect(x - s + 5, y - s + 5, (s - 5) * 2, (s - 5) * 2, r - 2);
    g.stroke({ color: 0x666666, alpha: 0.35, width: 1.5 });

    // Lock icon
    g.roundRect(x - 5, y - 1, 10, 8, 2);
    g.fill({ color: COLORS.ACCENT_YELLOW, alpha: 0.8 });
    // Shackle: moveTo the arc start to avoid a stray line from (0,0)
    g.moveTo(x - 4.5, y - 1);
    g.arc(x, y - 1, 4.5, Math.PI, 0);
    g.stroke({ color: COLORS.ACCENT_YELLOW, alpha: 0.8, width: 2 });

    layer.addChild(g);

    // Cost label
    const costLabel = new Text({
      text: formatNumber(city.unlockCost),
      style: new TextStyle({
        fontFamily: FONT_MONO,
        fontSize: 10,
        fontWeight: '700',
        fill: COLORS.ACCENT_YELLOW,
      }),
      resolution: TEXT_RESOLUTION,
    });
    costLabel.anchor.set(0.5, 0);
    costLabel.position.set(x, y + s + 6);
    layer.addChild(costLabel);
  }

  getCityAtPosition(worldX: number, worldY: number, worldMap: WorldMap): WorldCity | null {
    const s = CITY_SIZE;
    for (const city of worldMap.getCities()) {
      const dx = Math.abs(worldX - city.position.x);
      const dy = Math.abs(worldY - city.position.y);
      if (dx <= s && dy <= s) {
        return city;
      }
    }
    return null;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

function getInitials(name: string): string {
  const words = name.split(/\s+/);
  if (words.length === 1) {
    return name.slice(0, 2).toUpperCase();
  }
  return words.map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

/** Returns the intersection point of two line segments, or null if they don't cross.
 *  Ignores shared endpoints (segments meeting at a city). */
function segmentIntersection(
  ax1: number, ay1: number, ax2: number, ay2: number,
  bx1: number, by1: number, bx2: number, by2: number,
): { x: number; y: number } | null {
  // Skip if segments share an endpoint (meeting at same city)
  const EPS = 1;
  if ((Math.abs(ax1 - bx1) < EPS && Math.abs(ay1 - by1) < EPS) ||
      (Math.abs(ax1 - bx2) < EPS && Math.abs(ay1 - by2) < EPS) ||
      (Math.abs(ax2 - bx1) < EPS && Math.abs(ay2 - by1) < EPS) ||
      (Math.abs(ax2 - bx2) < EPS && Math.abs(ay2 - by2) < EPS)) {
    return null;
  }

  const dx1 = ax2 - ax1, dy1 = ay2 - ay1;
  const dx2 = bx2 - bx1, dy2 = by2 - by1;
  const denom = dx1 * dy2 - dy1 * dx2;

  if (Math.abs(denom) < 0.001) return null; // parallel

  const t = ((bx1 - ax1) * dy2 - (by1 - ay1) * dx2) / denom;
  const u = ((bx1 - ax1) * dy1 - (by1 - ay1) * dx1) / denom;

  // Strict interior (exclude endpoints with margin)
  const margin = 0.02;
  if (t <= margin || t >= 1 - margin || u <= margin || u >= 1 - margin) return null;

  return { x: ax1 + t * dx1, y: ay1 + t * dy1 };
}
