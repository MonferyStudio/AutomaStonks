import { Vector2 } from '@/utils/Vector2';
import { WorldMap, type WorldConnection } from './WorldMap';
import { BiomeMap } from './BiomeMap';
import { CITY_TYPES } from './CityType';
import worldData from '@/data/worldCities.json';

/** World dimensions in pixels */
export const WORLD_WIDTH = worldData.width;
export const WORLD_HEIGHT = worldData.height;

interface CityEntry {
  id: string;
  name: string;
  typeId: string;
  x: number;
  y: number;
  unlockCost: number;
}

interface ConnectionEntry {
  from: string;
  to: string;
}

const NUDGE_STEP = 20;
const NUDGE_MAX_RADIUS = 500;

/** Biomes that the generator considers "high elevation" for mining cities */
const HIGH_BIOMES = new Set(['hills', 'mountains', 'snow']);

export class WorldGenerator {
  generate(): { worldMap: WorldMap; biomeMap: BiomeMap } {
    const biomeMap = new BiomeMap(WORLD_WIDTH, WORLD_HEIGHT);
    const worldMap = new WorldMap();

    for (const entry of worldData.cities as CityEntry[]) {
      const cityType = CITY_TYPES[entry.typeId];
      if (!cityType) {
        console.warn(`Unknown city type: ${entry.typeId}`);
        continue;
      }

      const pos = this.findValidPosition(biomeMap, entry.x, entry.y, cityType.id);

      worldMap.addCity({
        id: entry.id,
        name: entry.name,
        position: new Vector2(pos.x, pos.y),
        cityType,
        unlocked: entry.unlockCost === 0,
        unlockCost: entry.unlockCost,
      });
    }

    for (const conn of worldData.connections as ConnectionEntry[]) {
      const fromCity = worldMap.getCity(conn.from);
      const toCity = worldMap.getCity(conn.to);
      if (!fromCity || !toCity) continue;

      const dist = fromCity.position.manhattanDistance(toCity.position);
      const transportTypes = this.getTransportTypes(fromCity.cityType, toCity.cityType);

      const connection: WorldConnection = {
        fromCityId: conn.from,
        toCityId: conn.to,
        distance: Math.round(dist / 10),
        transportTypes,
      };
      worldMap.addConnection(connection);
    }

    return { worldMap, biomeMap };
  }

  private findValidPosition(
    biomeMap: BiomeMap, x: number, y: number, typeId: string,
  ): { x: number; y: number } {
    const isCoastal = typeId === 'coastal';
    const isMining = typeId === 'mining';

    // Check original position first
    if (this.isPositionValid(biomeMap, x, y, isCoastal, isMining)) {
      return { x, y };
    }

    // Spiral outward
    for (let r = NUDGE_STEP; r <= NUDGE_MAX_RADIUS; r += NUDGE_STEP) {
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
        const nx = Math.round(x + Math.cos(angle) * r);
        const ny = Math.round(y + Math.sin(angle) * r);
        if (nx < 0 || ny < 0 || nx >= biomeMap.width || ny >= biomeMap.height) continue;
        if (this.isPositionValid(biomeMap, nx, ny, isCoastal, isMining)) {
          return { x: nx, y: ny };
        }
      }
    }

    // Fallback for mining: at least be on land
    if (isMining) {
      return this.findLandFallback(biomeMap, x, y);
    }

    return { x, y };
  }

  private isPositionValid(
    biomeMap: BiomeMap, x: number, y: number,
    coastal: boolean, mining: boolean,
  ): boolean {
    if (coastal) return biomeMap.isCoastal(x, y);
    if (!biomeMap.isLand(x, y)) return false;
    if (mining) {
      const biome = biomeMap.getAt(x, y);
      return HIGH_BIOMES.has(biome.type);
    }
    return true;
  }

  private findLandFallback(
    biomeMap: BiomeMap, x: number, y: number,
  ): { x: number; y: number } {
    for (let r = NUDGE_STEP; r <= NUDGE_MAX_RADIUS; r += NUDGE_STEP) {
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
        const nx = Math.round(x + Math.cos(angle) * r);
        const ny = Math.round(y + Math.sin(angle) * r);
        if (nx < 0 || ny < 0 || nx >= biomeMap.width || ny >= biomeMap.height) continue;
        if (biomeMap.isLand(nx, ny)) return { x: nx, y: ny };
      }
    }
    return { x, y };
  }

  private getTransportTypes(
    a: { hasRailway: boolean; hasPort: boolean; hasAirport: boolean },
    b: { hasRailway: boolean; hasPort: boolean; hasAirport: boolean },
  ): string[] {
    const types: string[] = ['truck'];
    if (a.hasRailway && b.hasRailway) types.push('train');
    if (a.hasPort && b.hasPort) types.push('boat');
    if (a.hasAirport && b.hasAirport) types.push('plane');
    return types;
  }
}
