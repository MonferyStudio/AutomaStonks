import type { ITickable } from '@/interfaces/ITickable';
import { Vehicle } from './Vehicle';
import { TransportRoute } from './TransportRoute';
import { VEHICLE_TYPES, type VehicleTypeDefinition } from './VehicleType';
import type { RoadNetwork } from '@/city/RoadNetwork';
import type { Wallet } from '@/economy/Wallet';
import { Vector2 } from '@/utils/Vector2';

export class TransportManager implements ITickable {
  sleeping: boolean = false;
  private routes: TransportRoute[] = [];
  private vehicles: Vehicle[] = [];
  private wallet: Wallet;

  constructor(wallet: Wallet) {
    this.wallet = wallet;
  }

  createRoute(
    fromBuildingId: string,
    toBuildingId: string,
    fromPos: Vector2,
    toPos: Vector2,
    roadNetwork: RoadNetwork,
  ): TransportRoute | null {
    const path = roadNetwork.findPath(fromPos, toPos);
    if (!path || path.length === 0) return null;

    const route = new TransportRoute(fromBuildingId, toBuildingId, path);
    this.routes.push(route);
    return route;
  }

  purchaseVehicle(typeId: string): Vehicle | null {
    const typeDef = VEHICLE_TYPES[typeId];
    if (!typeDef) return null;
    if (!this.wallet.spendCoins(typeDef.purchaseCost)) return null;

    const vehicle = new Vehicle(typeDef);
    this.vehicles.push(vehicle);
    return vehicle;
  }

  assignVehicleToRoute(vehicle: Vehicle, route: TransportRoute): void {
    route.assignVehicle(vehicle);
  }

  removeRoute(routeId: string): void {
    const idx = this.routes.findIndex((r) => r.id === routeId);
    if (idx >= 0) {
      const route = this.routes[idx];
      route.removeVehicle();
      this.routes.splice(idx, 1);
    }
  }

  getRoutes(): readonly TransportRoute[] {
    return this.routes;
  }

  getVehicles(): readonly Vehicle[] {
    return this.vehicles;
  }

  getRoutesByBuilding(buildingId: string): TransportRoute[] {
    return this.routes.filter(
      (r) => r.fromBuildingId === buildingId || r.toBuildingId === buildingId,
    );
  }

  onTick(deltaTicks: number): void {
    for (const route of this.routes) {
      if (!route.active || !route.vehicle) continue;

      const vehicle = route.vehicle;
      if (!vehicle.sleeping) {
        vehicle.onTick(deltaTicks);
      }

      if (vehicle.state === 'in_transit' || vehicle.state === 'returning') {
        // Charge cost per trip when returning to origin
        if (vehicle.state === 'returning' && vehicle.routeProgress >= vehicle.routeDistance) {
          this.wallet.spendCoins(vehicle.type.costPerTrip);
        }
      }
    }
  }

  wake(): void { this.sleeping = false; }
  sleep(): void { this.sleeping = true; }
}
