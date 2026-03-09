import { Vector2 } from '@/utils/Vector2';
import type { Vehicle } from './Vehicle';

let nextRouteId = 0;

export class TransportRoute {
  readonly id: string;
  readonly fromBuildingId: string;
  readonly toBuildingId: string;
  readonly path: Vector2[];
  readonly distance: number;

  vehicle: Vehicle | null = null;
  resourceFilter: string | null = null;
  maxPerTrip: number = -1;
  active: boolean = true;

  constructor(
    fromBuildingId: string,
    toBuildingId: string,
    path: Vector2[],
  ) {
    this.id = `route_${nextRouteId++}`;
    this.fromBuildingId = fromBuildingId;
    this.toBuildingId = toBuildingId;
    this.path = path;
    this.distance = path.length > 0 ? path.length - 1 : 0;
  }

  assignVehicle(vehicle: Vehicle): void {
    this.vehicle = vehicle;
    vehicle.routeDistance = this.distance;
  }

  removeVehicle(): Vehicle | null {
    const v = this.vehicle;
    this.vehicle = null;
    return v;
  }

  getVehiclePosition(): Vector2 | null {
    if (!this.vehicle || this.path.length === 0) return null;

    const progress = this.vehicle.normalizedProgress;
    const state = this.vehicle.state;

    if (state === 'returning') {
      const idx = Math.min(
        Math.floor((1 - progress) * (this.path.length - 1)),
        this.path.length - 1,
      );
      return this.path[Math.max(0, idx)];
    }

    const idx = Math.min(
      Math.floor(progress * (this.path.length - 1)),
      this.path.length - 1,
    );
    return this.path[Math.max(0, idx)];
  }
}
