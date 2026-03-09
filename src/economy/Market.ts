import type { ResourceRegistry, ResourceDefinition } from '@/simulation/Resource';
import { ItemStack } from '@/simulation/ItemStack';
import type { Wallet } from './Wallet';

export class Market {
  private resourceRegistry: ResourceRegistry;
  private wallet: Wallet;
  private priceModifiers = new Map<string, number>();

  constructor(resourceRegistry: ResourceRegistry, wallet: Wallet) {
    this.resourceRegistry = resourceRegistry;
    this.wallet = wallet;
  }

  getPrice(resourceId: string): number {
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
    return new ItemStack(resourceId, quantity);
  }

  setModifier(resourceId: string, modifier: number): void {
    this.priceModifiers.set(resourceId, modifier);
  }

  getAvailableResources(): ResourceDefinition[] {
    return this.resourceRegistry.getAll().filter((r) => r.basePrice > 0);
  }
}
