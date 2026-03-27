import type { ResourceRegistry, ResourceDefinition } from '@/simulation/Resource';
import { ItemStack } from '@/simulation/ItemStack';
import type { Wallet } from './Wallet';
import type { PriceEngine } from './PriceEngine';

export class Market {
  private resourceRegistry: ResourceRegistry;
  private wallet: Wallet;
  private priceModifiers = new Map<string, number>();
  private priceEngine: PriceEngine | null = null;

  constructor(resourceRegistry: ResourceRegistry, wallet: Wallet) {
    this.resourceRegistry = resourceRegistry;
    this.wallet = wallet;
  }

  /** Connect the dynamic price engine */
  setPriceEngine(engine: PriceEngine): void {
    this.priceEngine = engine;
  }

  getPrice(resourceId: string): number {
    // Use PriceEngine dynamic prices if available
    if (this.priceEngine) {
      return this.priceEngine.getBuyPrice(resourceId);
    }
    const def = this.resourceRegistry.get(resourceId);
    if (!def) return 0;
    const modifier = this.priceModifiers.get(resourceId) ?? 1;
    return Math.ceil(def.basePrice * modifier);
  }

  canBuy(resourceId: string, quantity: number): boolean {
    const price = this.getPrice(resourceId) * quantity;
    return this.wallet.canAfford(price);
  }

  buy(resourceId: string, quantity: number = 1): ItemStack | null {
    const price = this.getPrice(resourceId) * quantity;
    if (!this.wallet.spendCoins(price)) return null;
    this.priceEngine?.reportBuy(resourceId, quantity);
    return new ItemStack(resourceId, quantity);
  }

  setModifier(resourceId: string, modifier: number): void {
    this.priceModifiers.set(resourceId, modifier);
  }

  getAvailableResources(): ResourceDefinition[] {
    return this.resourceRegistry.getAll().filter((r) => r.basePrice > 0);
  }
}
