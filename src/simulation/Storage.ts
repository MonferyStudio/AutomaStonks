import type { ITickable } from '@/interfaces/ITickable';
import type { Market } from '@/economy/Market';
import type { ResourceRegistry } from './Resource';
import { eventBus } from '@/core/EventBus';

let nextStorageId = 0;

export interface StockOrder {
  resourceId: string;
  targetQuantity: number;
}

const BASE_UPGRADE_COST = 2000;
const CAPACITY_PER_CELL = 1000;
const CAPACITY_PER_UPGRADE = 5;

export class Storage implements ITickable {
  readonly id: string;
  sleeping: boolean = false;

  readonly cellCount: number;
  private _upgradeLevel: number = 0; // 0 = base, infinite upgrades
  private inventory = new Map<string, number>();
  private stockOrders: StockOrder[] = [];
  private market: Market | null = null;
  private resourceRegistry: ResourceRegistry | null = null;

  constructor(cellCount: number = 1) {
    this.id = `storage_${nextStorageId++}`;
    this.cellCount = cellCount;
  }

  setResourceRegistry(registry: ResourceRegistry): void {
    this.resourceRegistry = registry;
  }

  get maxCapacity(): number {
    return this.cellCount * CAPACITY_PER_CELL + this._upgradeLevel * CAPACITY_PER_UPGRADE;
  }

  get upgradeLevel(): number {
    return this._upgradeLevel;
  }

  /** Returns the cost to upgrade to the next level (infinite upgrades, scaling cost). */
  getUpgradeCost(): number {
    return Math.round(BASE_UPGRADE_COST * Math.pow(1.15, this._upgradeLevel));
  }

  /** Attempt to upgrade capacity (+5). Returns true if successful. */
  upgrade(wallet: { spendCoins(amount: number): boolean }): boolean {
    const cost = this.getUpgradeCost();
    if (!wallet.spendCoins(cost)) return false;
    this._upgradeLevel++;
    eventBus.emit('StorageUpdated', { storageId: this.id });
    return true;
  }

  setMarket(market: Market): void {
    this.market = market;
  }

  // --- Inventory ---

  /** Returns total weighted space used in this storage. */
  get totalUsed(): number {
    let total = 0;
    for (const [resId, qty] of this.inventory) {
      total += qty * this.getWeight(resId);
    }
    return total;
  }

  get remainingCapacity(): number {
    return this.maxCapacity - this.totalUsed;
  }

  /** Returns the storageWeight for a resource (defaults to 1 if registry unavailable). */
  private getWeight(resourceId: string): number {
    const def = this.resourceRegistry?.get(resourceId);
    return def?.storageWeight ?? 1;
  }

  getStock(resourceId: string): number {
    return this.inventory.get(resourceId) ?? 0;
  }

  getInventory(): ReadonlyMap<string, number> {
    return this.inventory;
  }

  deposit(resourceId: string, quantity: number): number {
    const weight = this.getWeight(resourceId);
    const canFit = Math.min(quantity, Math.floor(this.remainingCapacity / weight));
    if (canFit <= 0) return 0;
    this.inventory.set(resourceId, this.getStock(resourceId) + canFit);
    return canFit;
  }

  withdraw(resourceId: string, quantity: number): number {
    const available = this.getStock(resourceId);
    const taken = Math.min(quantity, available);
    if (taken <= 0) return 0;
    const remaining = available - taken;
    if (remaining === 0) {
      this.inventory.delete(resourceId);
    } else {
      this.inventory.set(resourceId, remaining);
    }
    return taken;
  }

  // --- Stock Orders ---

  getStockOrders(): readonly StockOrder[] {
    return this.stockOrders;
  }

  setStockOrder(resourceId: string, targetQuantity: number): void {
    const existing = this.stockOrders.find(o => o.resourceId === resourceId);
    if (targetQuantity <= 0) {
      this.stockOrders = this.stockOrders.filter(o => o.resourceId !== resourceId);
      return;
    }
    if (existing) {
      existing.targetQuantity = targetQuantity;
    } else {
      this.stockOrders.push({ resourceId, targetQuantity });
    }
  }

  removeStockOrder(resourceId: string): void {
    this.stockOrders = this.stockOrders.filter(o => o.resourceId !== resourceId);
  }

  // --- Tick: auto-buy from market to fulfill orders ---

  onTick(_deltaTicks: number): void {
    if (!this.market) return;

    for (const order of this.stockOrders) {
      const current = this.getStock(order.resourceId);
      if (current >= order.targetQuantity) continue;
      if (this.remainingCapacity <= 0) break;

      const needed = Math.min(order.targetQuantity - current, this.remainingCapacity);
      // Buy one at a time per tick to spread cost
      const toBuy = Math.min(needed, 1);
      const item = this.market.buy(order.resourceId, toBuy);
      if (item) {
        this.deposit(item.resourceId, item.quantity);
        eventBus.emit('StorageUpdated', { storageId: this.id });
      }
    }
  }

  wake(): void { this.sleeping = false; }
  sleep(): void { this.sleeping = true; }
}
