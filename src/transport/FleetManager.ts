import type { ITickable } from '@/interfaces/ITickable';
import { Truck, truckPurchaseCost, truckUpgradeCost, type TruckSaveData } from './Truck';
import { TruckRoute, type TruckRouteSaveData, type RouteEndpointType } from './TruckRoute';
import { ItemStack } from '@/simulation/ItemStack';
import type { Storage } from '@/simulation/Storage';
import type { Wallet } from '@/economy/Wallet';
import type { RoadNetwork } from '@/city/RoadNetwork';
import type { CitySlot } from '@/city/CitySlot';
import type { ResourceRegistry } from '@/simulation/Resource';
import { Vector2 } from '@/utils/Vector2';
import { eventBus } from '@/core/EventBus';


export interface FleetSaveData {
  trucks: TruckSaveData[];
  routes: TruckRouteSaveData[];
}

export class FleetManager implements ITickable {
  sleeping = false;
  private trucks: Truck[] = [];
  private routes: TruckRoute[] = [];
  private wallet: Wallet;
  private resourceRegistry: ResourceRegistry;

  /** Lookup helpers set by the city context */
  private getStorage: ((slotKey: string) => Storage | null) | null = null;
  private getInputPortDeposit: ((slotKey: string, resourceId: string, qty: number) => number) | null = null;
  /** Returns resource IDs that the factory's input ports are waiting for */
  private getFactoryNeeds: ((slotKey: string) => string[]) | null = null;
  /** Returns items available on factory output ports */
  private getOutputPortItems: ((slotKey: string) => { resourceId: string; qty: number }[]) | null = null;
  /** Withdraw items from factory output ports */
  private withdrawOutputPort: ((slotKey: string, resourceId: string, qty: number) => number) | null = null;
  /** Sell items to the shop for a given slot key, returns revenue */
  private sellToShop: ((shopSlotKey: string, resourceId: string, qty: number) => number) | null = null;

  constructor(wallet: Wallet, resourceRegistry: ResourceRegistry) {
    this.wallet = wallet;
    this.resourceRegistry = resourceRegistry;
  }

  /** Total weight of items currently in the truck's cargo */
  private truckCargoWeight(truck: Truck): number {
    let weight = 0;
    for (const stack of truck.cargo) {
      const def = this.resourceRegistry.get(stack.resourceId);
      weight += stack.quantity * (def?.storageWeight ?? 1);
    }
    return weight;
  }

  /** Remaining weight capacity */
  private truckRemainingCapacity(truck: Truck): number {
    return truck.maxCargo - this.truckCargoWeight(truck);
  }

  /** Wire up city-specific callbacks so the manager can move items */
  setCityContext(
    getStorage: (slotKey: string) => Storage | null,
    getInputPortDeposit: (slotKey: string, resourceId: string, qty: number) => number,
    getFactoryNeeds: (slotKey: string) => string[],
    getOutputPortItems: (slotKey: string) => { resourceId: string; qty: number }[],
    withdrawOutputPort: (slotKey: string, resourceId: string, qty: number) => number,
    sellToShop: (shopSlotKey: string, resourceId: string, qty: number) => number,
  ): void {
    this.getStorage = getStorage;
    this.getInputPortDeposit = getInputPortDeposit;
    this.getFactoryNeeds = getFactoryNeeds;
    this.getOutputPortItems = getOutputPortItems;
    this.withdrawOutputPort = withdrawOutputPort;
    this.sellToShop = sellToShop;
  }

  // ── Purchase / Upgrade ──────────────────────────────────────────

  getNextTruckCost(): number {
    return truckPurchaseCost(this.trucks.length);
  }

  purchaseTruck(): Truck | null {
    const cost = this.getNextTruckCost();
    if (!this.wallet.spendCoins(cost)) return null;
    const truck = new Truck(this.trucks.length);
    this.trucks.push(truck);
    return truck;
  }

  getUpgradeCost(truck: Truck): number | null {
    if (truck.isMaxLevel) return null;
    return truckUpgradeCost(truck.index, truck.level);
  }

  upgradeTruck(truck: Truck): boolean {
    const cost = this.getUpgradeCost(truck);
    if (cost === null) return false;
    if (!this.wallet.spendCoins(cost)) return false;
    truck.level++;
    return true;
  }

  // ── Route management ────────────────────────────────────────────

  createRoute(
    fromSlotKey: string,
    toSlotKey: string,
    fromPos: Vector2,
    toPos: Vector2,
    roadNetwork: RoadNetwork,
    fromType: RouteEndpointType = 'storage',
    toType: RouteEndpointType = 'factory',
  ): TruckRoute | null {
    // Find road-adjacent cell for each slot
    const fromRoad = this.findAdjacentRoad(fromPos, roadNetwork);
    const toRoad = this.findAdjacentRoad(toPos, roadNetwork);
    console.log('[Fleet] createRoute: fromPos', fromPos.x, fromPos.y, '→ road:', fromRoad?.x, fromRoad?.y,
      '| toPos', toPos.x, toPos.y, '→ road:', toRoad?.x, toRoad?.y);
    if (!fromRoad || !toRoad) return null;

    const path = roadNetwork.findPath(fromRoad, toRoad);
    console.log('[Fleet] pathfind result:', path ? path.length + ' nodes' : 'FAILED');
    if (!path || path.length === 0) return null;

    const route = new TruckRoute(fromSlotKey, toSlotKey, path, fromType, toType);
    this.routes.push(route);
    return route;
  }

  private findAdjacentRoad(slotPos: Vector2, roadNetwork: RoadNetwork): Vector2 | null {
    // If the position itself is a road (e.g. truckStop on a road cell), use it directly
    if (roadNetwork.isRoad(slotPos)) return slotPos;

    const offsets = [
      new Vector2(0, -1), new Vector2(0, 1),
      new Vector2(-1, 0), new Vector2(1, 0),
    ];
    for (const off of offsets) {
      const p = slotPos.add(off);
      if (roadNetwork.isRoad(p)) return p;
    }
    // Fallback: check wider area
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const p = new Vector2(slotPos.x + dx, slotPos.y + dy);
        if (roadNetwork.isRoad(p)) return p;
      }
    }
    return null;
  }

  removeRoute(routeId: string): void {
    const idx = this.routes.findIndex(r => r.id === routeId);
    if (idx < 0) return;
    // Unassign any truck on this route
    for (const truck of this.trucks) {
      if (truck.routeId === routeId) {
        truck.routeId = null;
        truck.state = 'idle';
        truck.cargo = [];
        truck.progress = 0;
        truck.loadProgress = 0;
      }
    }
    this.routes.splice(idx, 1);
  }

  assignTruckToRoute(truckId: string, routeId: string): boolean {
    const truck = this.trucks.find(t => t.id === truckId);
    const route = this.routes.find(r => r.id === routeId);
    if (!truck || !route) {
      console.warn(`[FleetManager] assignTruckToRoute FAILED: truck=${!!truck} route=${!!route}`);
      return false;
    }

    // Unassign from previous route
    if (truck.routeId) {
      truck.state = 'idle';
      truck.cargo = [];
      truck.progress = 0;
      truck.loadProgress = 0;
    }

    truck.routeId = routeId;
    truck.state = 'loading';
    truck.progress = 0;
    truck.loadProgress = 0;
    return true;
  }

  unassignTruck(truckId: string): void {
    const truck = this.trucks.find(t => t.id === truckId);
    if (!truck) return;
    truck.routeId = null;
    truck.state = 'idle';
    truck.cargo = [];
    truck.progress = 0;
    truck.loadProgress = 0;
  }

  // ── Getters ─────────────────────────────────────────────────────

  getTrucks(): readonly Truck[] { return this.trucks; }
  getRoutes(): readonly TruckRoute[] { return this.routes; }

  getRouteById(id: string): TruckRoute | undefined {
    return this.routes.find(r => r.id === id);
  }

  getTruckById(id: string): Truck | undefined {
    return this.trucks.find(t => t.id === id);
  }

  getTruckForRoute(routeId: string): Truck | undefined {
    return this.trucks.find(t => t.routeId === routeId);
  }

  getUnassignedTrucks(): Truck[] {
    return this.trucks.filter(t => !t.routeId);
  }

  /** Find a truck near the given grid position (for click detection) */
  getTruckAtGrid(gridX: number, gridY: number): Truck | null {
    for (const truck of this.trucks) {
      if (truck.state === 'idle' || !truck.routeId) continue;
      const route = this.routes.find(r => r.id === truck.routeId);
      if (!route || route.path.length === 0) continue;

      let pos: { x: number; y: number };
      if (truck.state === 'loading') {
        pos = route.path[0];
      } else if (truck.state === 'unloading') {
        pos = route.path[route.path.length - 1];
      } else {
        const reverse = truck.state === 'moving_to_origin';
        pos = route.getPositionAndDirection(truck.progress, reverse).pos;
      }

      // Check if click is on the same grid cell as the truck
      if (Math.floor(pos.x) === gridX && Math.floor(pos.y) === gridY) {
        return truck;
      }
    }
    return null;
  }

  // ── Tick ────────────────────────────────────────────────────────

  onTick(deltaTicks: number): void {
    for (const truck of this.trucks) {
      if (truck.state === 'idle' || !truck.routeId) continue;
      const route = this.routes.find(r => r.id === truck.routeId);
      if (!route) { truck.state = 'idle'; continue; }

      this.tickTruck(truck, route, deltaTicks);
    }
  }

  private tickTruck(truck: Truck, route: TruckRoute, deltaTicks: number): void {
    // Snapshot for frame interpolation
    truck.prevProgress = truck.progress;
    truck.prevState = truck.state;

    switch (truck.state) {
      case 'loading':
        this.tickLoading(truck, route, deltaTicks);
        break;
      case 'moving_to_dest':
        truck.progress += truck.speed * deltaTicks;
        if (truck.progress >= route.distance) {
          truck.progress = route.distance;
          truck.state = 'unloading';
          truck.loadProgress = 0;
        }
        break;
      case 'unloading':
        this.tickUnloading(truck, route, deltaTicks);
        break;
      case 'moving_to_origin':
        truck.progress += truck.speed * deltaTicks;
        if (truck.progress >= route.distance) {
          truck.progress = 0;
          truck.state = 'loading';
          truck.loadProgress = 0;
        }
        break;
    }
  }

  private tickLoading(truck: Truck, route: TruckRoute, deltaTicks: number): void {
    // Determine what resources to load based on source type
    if (route.fromType === 'storage') {
      this.tickLoadFromStorage(truck, route, deltaTicks);
    } else if (route.fromType === 'factory') {
      this.tickLoadFromFactory(truck, route, deltaTicks);
    }
  }

  private tickLoadFromStorage(truck: Truck, route: TruckRoute, deltaTicks: number): void {
    if (!this.getStorage) {
      truck.state = 'moving_to_dest';
      truck.progress = 0;
      return;
    }

    const storage = this.getStorage(route.fromSlotKey);
    if (!storage) {
      truck.state = 'moving_to_dest';
      truck.progress = 0;
      return;
    }

    // Determine which resources to load
    let allowedResources: string[];
    if (route.itemFilter.length > 0) {
      // Route has an item whitelist — only load these
      allowedResources = route.itemFilter;
    } else if (route.toType === 'factory' && this.getFactoryNeeds) {
      // Going to a factory — ask what the factory accepts
      allowedResources = this.getFactoryNeeds(route.toSlotKey);
    } else {
      // Going to shop or no filter — load everything in storage
      allowedResources = [...storage.getInventory().keys()].filter(k => storage.getStock(k) > 0);
    }

    if (allowedResources.length === 0) return; // Nothing to load — wait

    truck.loadProgress += deltaTicks;
    while (truck.loadProgress >= truck.loadTicks && this.truckRemainingCapacity(truck) > 0) {
      truck.loadProgress -= truck.loadTicks;

      // Distribute evenly: pick the resource with the least cargo loaded
      const remaining = this.truckRemainingCapacity(truck);
      let picked: string | null = null;
      let minLoaded = Infinity;
      for (const resId of allowedResources) {
        if (storage.getStock(resId) <= 0) continue;
        const w = this.resourceRegistry.get(resId)?.storageWeight ?? 1;
        if (w > remaining) continue; // Too heavy for remaining capacity
        const loaded = truck.cargo.find(c => c.resourceId === resId)?.quantity ?? 0;
        if (loaded < minLoaded) {
          minLoaded = loaded;
          picked = resId;
        }
      }

      if (!picked) break;

      const batchSize = Math.min(truck.loadBatchSize, this.truckRemainingCapacity(truck));
      const taken = storage.withdraw(picked, batchSize);
      if (taken > 0) {
        const existing = truck.cargo.find(c => c.resourceId === picked);
        if (existing) {
          existing.quantity += taken;
        } else {
          truck.cargo.push(new ItemStack(picked, taken));
        }
        eventBus.emit('StorageUpdated', { storageId: storage.id });
      } else {
        break;
      }
    }

    // Depart when full or no more stock available
    if (this.truckRemainingCapacity(truck) <= 0 || this.truckCargoWeight(truck) > 0) {
      const anyAvailable = allowedResources.some(resId => storage.getStock(resId) > 0);
      if (this.truckRemainingCapacity(truck) <= 0 || !anyAvailable) {
        truck.state = 'moving_to_dest';
        truck.progress = 0;
      }
    }
  }

  private tickLoadFromFactory(truck: Truck, route: TruckRoute, deltaTicks: number): void {
    if (!this.getOutputPortItems || !this.withdrawOutputPort) {
      truck.state = 'moving_to_dest';
      truck.progress = 0;
      return;
    }

    const available = this.getOutputPortItems(route.fromSlotKey);
    if (available.length === 0) return; // No items ready — wait

    // Filter by item whitelist if set
    const allowed = route.itemFilter.length > 0
      ? available.filter(a => route.itemFilter.includes(a.resourceId))
      : available;

    if (allowed.length === 0) return;

    truck.loadProgress += deltaTicks;
    while (truck.loadProgress >= truck.loadTicks && this.truckRemainingCapacity(truck) > 0) {
      truck.loadProgress -= truck.loadTicks;

      // Pick the resource with the least cargo loaded
      const remaining = this.truckRemainingCapacity(truck);
      let picked: string | null = null;
      let minLoaded = Infinity;
      for (const item of allowed) {
        if (item.qty <= 0) continue;
        const w = this.resourceRegistry.get(item.resourceId)?.storageWeight ?? 1;
        if (w > remaining) continue;
        const loaded = truck.cargo.find(c => c.resourceId === item.resourceId)?.quantity ?? 0;
        if (loaded < minLoaded) {
          minLoaded = loaded;
          picked = item.resourceId;
        }
      }

      if (!picked) break;

      const batchSize = Math.min(truck.loadBatchSize, this.truckRemainingCapacity(truck));
      const taken = this.withdrawOutputPort(route.fromSlotKey, picked, batchSize);
      if (taken > 0) {
        const existing = truck.cargo.find(c => c.resourceId === picked);
        if (existing) {
          existing.quantity += taken;
        } else {
          truck.cargo.push(new ItemStack(picked, taken));
        }
      } else {
        break;
      }
    }

    // Depart when full or nothing left
    if (this.truckRemainingCapacity(truck) <= 0 || this.truckCargoWeight(truck) > 0) {
      const refreshed = this.getOutputPortItems(route.fromSlotKey);
      const anyLeft = route.itemFilter.length > 0
        ? refreshed.some(a => route.itemFilter.includes(a.resourceId) && a.qty > 0)
        : refreshed.some(a => a.qty > 0);
      if (this.truckRemainingCapacity(truck) <= 0 || !anyLeft) {
        truck.state = 'moving_to_dest';
        truck.progress = 0;
      }
    }
  }

  private tickUnloading(truck: Truck, route: TruckRoute, deltaTicks: number): void {
    if (route.toType === 'factory') {
      this.tickUnloadToFactory(truck, route, deltaTicks);
    } else if (route.toType === 'storage') {
      this.tickUnloadToStorage(truck, route, deltaTicks);
    } else if (route.toType === 'shop') {
      this.tickUnloadToShop(truck, route, deltaTicks);
    }
  }

  private tickUnloadToFactory(truck: Truck, route: TruckRoute, deltaTicks: number): void {
    if (!this.getInputPortDeposit) {
      truck.cargo = [];
      truck.state = 'moving_to_origin';
      truck.progress = 0;
      return;
    }

    truck.loadProgress += deltaTicks;
    while (truck.loadProgress >= truck.loadTicks && truck.cargo.length > 0) {
      truck.loadProgress -= truck.loadTicks;

      let depositedAny = false;
      for (let i = 0; i < truck.cargo.length; i++) {
        const item = truck.cargo[i];
        const batch = Math.min(truck.loadBatchSize, item.quantity);
        const deposited = this.getInputPortDeposit(route.toSlotKey, item.resourceId, batch);
        if (deposited > 0) {
          item.quantity -= deposited;
          if (item.quantity <= 0) truck.cargo.splice(i, 1);
          depositedAny = true;
          break;
        }
      }
      if (!depositedAny) break;
    }

    if (truck.cargo.length === 0) {
      truck.state = 'moving_to_origin';
      truck.progress = 0;
    }
  }

  private tickUnloadToStorage(truck: Truck, route: TruckRoute, deltaTicks: number): void {
    if (!this.getStorage) {
      truck.cargo = [];
      truck.state = 'moving_to_origin';
      truck.progress = 0;
      return;
    }

    const storage = this.getStorage(route.toSlotKey);
    if (!storage) {
      truck.cargo = [];
      truck.state = 'moving_to_origin';
      truck.progress = 0;
      return;
    }

    truck.loadProgress += deltaTicks;
    while (truck.loadProgress >= truck.loadTicks && truck.cargo.length > 0) {
      truck.loadProgress -= truck.loadTicks;

      let depositedAny = false;
      for (let i = 0; i < truck.cargo.length; i++) {
        const item = truck.cargo[i];
        const batch = Math.min(truck.loadBatchSize, item.quantity);
        const deposited = storage.deposit(item.resourceId, batch);
        if (deposited > 0) {
          item.quantity -= deposited;
          if (item.quantity <= 0) truck.cargo.splice(i, 1);
          depositedAny = true;
          eventBus.emit('StorageUpdated', { storageId: storage.id });
          break;
        }
      }
      if (!depositedAny) break;
    }

    if (truck.cargo.length === 0) {
      truck.state = 'moving_to_origin';
      truck.progress = 0;
    }
  }

  private tickUnloadToShop(truck: Truck, route: TruckRoute, deltaTicks: number): void {
    if (!this.sellToShop) {
      truck.cargo = [];
      truck.state = 'moving_to_origin';
      truck.progress = 0;
      return;
    }

    truck.loadProgress += deltaTicks;
    while (truck.loadProgress >= truck.loadTicks && truck.cargo.length > 0) {
      truck.loadProgress -= truck.loadTicks;

      const item = truck.cargo[0];
      const batch = Math.min(truck.loadBatchSize, item.quantity);
      const revenue = this.sellToShop(route.toSlotKey, item.resourceId, batch);
      if (revenue > 0) {
        item.quantity -= batch;
        if (item.quantity <= 0) truck.cargo.shift();
      } else {
        // Shop can't buy this item — skip it
        truck.cargo.shift();
      }
    }

    if (truck.cargo.length === 0) {
      truck.state = 'moving_to_origin';
      truck.progress = 0;
    }
  }

  /** Fast-forward simulation for elapsed time when city was not visible */
  simulateElapsed(elapsedMs: number): void {
    const ticksPerMs = 10 / 1000; // TICK_RATE / 1000
    const elapsedTicks = elapsedMs * ticksPerMs;

    for (const truck of this.trucks) {
      if (truck.state === 'idle' || !truck.routeId) continue;
      const route = this.routes.find(r => r.id === truck.routeId);
      if (!route) continue;

      const needs = this.getFactoryNeeds?.(route.toSlotKey) ?? [];
      if (needs.length === 0) continue;

      const loadCycles = Math.ceil(truck.maxCargo / truck.loadBatchSize);
      const tripTicks = (route.distance * 2) / truck.speed + truck.loadTicks * loadCycles * 2;
      if (tripTicks <= 0) continue;

      const completedTrips = Math.floor(elapsedTicks / tripTicks);
      if (completedTrips <= 0) continue;

      // Simplified: move items from storage to factory input for N trips
      const storage = this.getStorage?.(route.fromSlotKey);
      if (!storage) continue;

      // Distribute evenly across needed resources
      const perResource = Math.floor(truck.maxCargo / needs.length);
      for (const resId of needs) {
        const totalItems = Math.min(perResource * completedTrips, storage.getStock(resId));
        const taken = storage.withdraw(resId, totalItems);
        if (taken > 0 && this.getInputPortDeposit) {
          this.getInputPortDeposit(route.toSlotKey, resId, taken);
        }
      }
      eventBus.emit('StorageUpdated', { storageId: storage.id });
    }
  }

  // ── Serialization ───────────────────────────────────────────────

  serialize(): FleetSaveData {
    return {
      trucks: this.trucks.map(t => t.serialize()),
      routes: this.routes.map(r => r.serialize()),
    };
  }

  deserialize(data: FleetSaveData, roadNetwork: RoadNetwork): void {
    this.trucks = [];
    this.routes = [];

    for (const rd of data.routes) {
      const path = rd.path.map(k => Vector2.fromKey(k));
      const route = new TruckRoute(
        rd.fromSlotKey, rd.toSlotKey, path,
        rd.fromType ?? 'storage', rd.toType ?? 'factory', rd.id,
      );
      route.resourceFilter = rd.resourceFilter;
      route.itemFilter = rd.itemFilter ?? [];
      this.routes.push(route);
    }

    const usedIds = new Set<string>();
    for (const td of data.trucks) {
      // Deduplicate IDs from corrupted saves
      let truckId: string | undefined = td.id;
      if (usedIds.has(truckId)) {
        truckId = undefined; // Let constructor generate a fresh unique ID
      }
      usedIds.add(truckId ?? '');

      const truck = new Truck(td.index, truckId);
      if (!truckId) usedIds.add(truck.id); // Track the auto-generated ID too
      // Unified level (backward compat: sum old 3-axis levels)
      if (td.level !== undefined) {
        truck.level = td.level;
      } else {
        truck.level = (td.speedLevel ?? 0) + (td.capacityLevel ?? 0) + (td.loadLevel ?? 0);
      }
      truck.colorVariant = td.colorVariant;
      truck.name = td.name ?? '';
      truck.state = td.state;
      truck.progress = td.progress;
      truck.loadProgress = td.loadProgress;
      truck.cargo = td.cargo.map(c => new ItemStack(c.resourceId, c.quantity));

      // Restore route assignment — IDs are preserved from save
      truck.routeId = td.routeId && this.routes.some(r => r.id === td.routeId) ? td.routeId : null;
      if (!truck.routeId) {
        truck.state = 'idle';
        truck.cargo = [];
      }

      this.trucks.push(truck);
    }
  }

  wake(): void { this.sleeping = false; }
  sleep(): void { this.sleeping = true; }
}
