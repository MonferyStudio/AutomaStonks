import { Vector2 } from '@/utils/Vector2';
import type { CityTypeDefinition } from './CityType';

export interface WorldCity {
  id: string;
  name: string;
  position: Vector2;
  cityType: CityTypeDefinition;
  unlocked: boolean;
  unlockCost: number;
}

export interface WorldConnection {
  fromCityId: string;
  toCityId: string;
  distance: number;
  transportTypes: string[];
}

export class WorldMap {
  private cities = new Map<string, WorldCity>();
  private connections: WorldConnection[] = [];

  addCity(city: WorldCity): void {
    this.cities.set(city.id, city);
  }

  addConnection(connection: WorldConnection): void {
    this.connections.push(connection);
  }

  getCity(id: string): WorldCity | undefined {
    return this.cities.get(id);
  }

  getCities(): WorldCity[] {
    return [...this.cities.values()];
  }

  getUnlockedCities(): WorldCity[] {
    return [...this.cities.values()].filter((c) => c.unlocked);
  }

  getConnections(): WorldConnection[] {
    return this.connections;
  }

  getConnectionsForCity(cityId: string): WorldConnection[] {
    return this.connections.filter(
      (c) => c.fromCityId === cityId || c.toCityId === cityId,
    );
  }

  removeCity(cityId: string): void {
    this.cities.delete(cityId);
    this.connections = this.connections.filter(
      c => c.fromCityId !== cityId && c.toCityId !== cityId,
    );
  }

  unlockCity(cityId: string): boolean {
    const city = this.cities.get(cityId);
    if (!city || city.unlocked) return false;
    city.unlocked = true;
    return true;
  }

  getDistance(fromId: string, toId: string): number {
    const conn = this.connections.find(
      (c) =>
        (c.fromCityId === fromId && c.toCityId === toId) ||
        (c.fromCityId === toId && c.toCityId === fromId),
    );
    return conn?.distance ?? -1;
  }
}
