import type { ResourceRegistry } from '@/simulation/Resource';
import type { Wallet } from './Wallet';
import type { ItemStack } from '@/simulation/ItemStack';
import type { PriceEngine } from './PriceEngine';
import { eventBus } from '@/core/EventBus';

export class Shop {
  readonly id: string;
  private resourceRegistry: ResourceRegistry;
  private wallet: Wallet;
  private sellModifier: number;
  private priceEngine: PriceEngine | null = null;

  constructor(id: string, resourceRegistry: ResourceRegistry, wallet: Wallet, sellModifier: number = 1) {
    this.id = id;
    this.resourceRegistry = resourceRegistry;
    this.wallet = wallet;
    this.sellModifier = sellModifier;
  }

  setPriceEngine(engine: PriceEngine): void {
    this.priceEngine = engine;
  }

  getSellPrice(resourceId: string): number {
    if (this.priceEngine) {
      return Math.ceil(this.priceEngine.getSellPrice(resourceId) * this.sellModifier);
    }
    const def = this.resourceRegistry.get(resourceId);
    if (!def) return 0;
    return Math.ceil(def.sellPrice * this.sellModifier);
  }

  sell(item: ItemStack): number {
    const price = this.getSellPrice(item.resourceId) * item.quantity;
    this.wallet.addCoins(price);
    this.priceEngine?.reportSell(item.resourceId, item.quantity);
    eventBus.emit('ItemSold', { shopId: this.id, itemId: item.resourceId, revenue: price });
    return price;
  }
}
