import { eventBus } from './EventBus';
import { ItemStack } from '@/simulation/ItemStack';
import type { Factory } from '@/simulation/Factory';
import type { Storage } from '@/simulation/Storage';
import type { Shop } from '@/economy/Shop';

/**
 * Handles auto-sell of output port items and auto-supply of input ports from city storages.
 * Extracted from Game.ts to follow SRP.
 */
export class AutoSupplySystem {
  private factories: Map<string, Factory>;
  private factoryCityMap: Map<string, string>;
  private shop: Shop;
  private getStoragesForCity: (cityId: string) => Storage[];

  constructor(
    factories: Map<string, Factory>,
    factoryCityMap: Map<string, string>,
    shop: Shop,
    getStoragesForCity: (cityId: string) => Storage[],
  ) {
    this.factories = factories;
    this.factoryCityMap = factoryCityMap;
    this.shop = shop;
    this.getStoragesForCity = getStoragesForCity;
  }

  start(): void {
    eventBus.on('TickCompleted', () => this.tick());
  }

  private tick(): void {
    // Output ports are now buffered for truck pickup via FleetManager.
    // No auto-sell — trucks handle factory→shop transport.
  }
}
