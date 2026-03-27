import { Vector2 } from '@/utils/Vector2';
import { WorldMap, type WorldConnection } from './WorldMap';
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

export class WorldGenerator {
  generate(): WorldMap {
    const worldMap = new WorldMap();

    for (const entry of worldData.cities as CityEntry[]) {
      const cityType = CITY_TYPES[entry.typeId];
      if (!cityType) {
        console.warn(`Unknown city type: ${entry.typeId}`);
        continue;
      }

      worldMap.addCity({
        id: entry.id,
        name: entry.name,
        position: new Vector2(entry.x, entry.y),
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

    return worldMap;
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
