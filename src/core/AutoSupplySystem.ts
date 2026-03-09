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
    for (const [factoryKey, factory] of this.factories) {
      // Auto-sell output ports
      const outputPorts = factory.getIOPorts().filter((p) => p.portType === 'output');
      for (const port of outputPorts) {
        if (port.hasItem()) {
          const item = port.extractItem();
          if (item) {
            this.shop.sell(item);
          }
        }
      }

      // Auto-supply input ports with configured resource
      const inputPorts = factory.getIOPorts().filter(
        (p) => p.portType === 'input' && p.resourceFilter && !p.hasItem(),
      );
      if (inputPorts.length === 0) continue;

      const cityId = this.factoryCityMap.get(factoryKey);
      if (!cityId) continue;
      const cityStorages = this.getStoragesForCity(cityId);

      for (const port of inputPorts) {
        const resId = port.resourceFilter!;

        for (const storage of cityStorages) {
          if (storage.getStock(resId) > 0) {
            const taken = storage.withdraw(resId, 1);
            if (taken > 0) {
              port.acceptItem(new ItemStack(resId, 1));
              eventBus.emit('StorageUpdated', { storageId: storage.id });
              break;
            }
          }
        }
      }
    }
  }
}
