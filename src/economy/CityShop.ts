import type { ResourceRegistry } from '@/simulation/Resource';
import type { Wallet } from './Wallet';
import type { ItemStack } from '@/simulation/ItemStack';
import { eventBus } from '@/core/EventBus';

export interface ShopDefinition {
  id: string;
  name: string;
  color: number;
  description: string;
  /** Material categories — used as filter hints in the debug panel add-item dropdown */
  acceptedCategories: string[];
  /** Specific item IDs — used as filter hints in the debug panel add-item dropdown */
  acceptedItems?: string[];
  /** Global sell price multiplier (1.0 = base sell price). Stacks with per-item modifiers. */
  priceModifier: number;
  /** Per-item price modifiers — override the global modifier for specific resources */
  itemPriceModifiers?: Record<string, number>;
}

let nextShopId = 0;

export class CityShop {
  readonly id: string;
  readonly definition: ShopDefinition;
  readonly slotKey: string;
  private resourceRegistry: ResourceRegistry;
  private wallet: Wallet;

  /** Per-item price modifiers (runtime, editable via debug panel) */
  itemPriceModifiers = new Map<string, number>();

  /** Revenue earned by this shop since creation */
  totalRevenue: number = 0;

  constructor(
    definition: ShopDefinition,
    slotKey: string,
    resourceRegistry: ResourceRegistry,
    wallet: Wallet,
  ) {
    this.id = `cityshop_${nextShopId++}`;
    this.definition = definition;
    this.slotKey = slotKey;
    this.resourceRegistry = resourceRegistry;
    this.wallet = wallet;

    // Load per-item modifiers from definition
    if (definition.itemPriceModifiers) {
      for (const [resId, mod] of Object.entries(definition.itemPriceModifiers)) {
        this.itemPriceModifiers.set(resId, mod);
      }
    }
  }

  /** Check if this shop accepts the given resource.
   *  Only items listed in itemPriceModifiers are accepted. */
  accepts(resourceId: string): boolean {
    return this.itemPriceModifiers.has(resourceId);
  }

  /** Get the sell price for one unit of this resource */
  getSellPrice(resourceId: string): number {
    const itemMod = this.itemPriceModifiers.get(resourceId);
    if (itemMod === undefined) return 0;
    const def = this.resourceRegistry.get(resourceId);
    if (!def) return 0;
    const effectiveMod = itemMod * this.definition.priceModifier;
    return Math.ceil(def.sellPrice * effectiveMod);
  }

  /** Set per-item price modifier */
  setItemPriceModifier(resourceId: string, modifier: number): void {
    this.itemPriceModifiers.set(resourceId, modifier);
  }

  /** Remove per-item price modifier (falls back to global) */
  removeItemPriceModifier(resourceId: string): void {
    this.itemPriceModifiers.delete(resourceId);
  }

  /** Sell items to this shop, returns total revenue */
  sell(item: ItemStack): number {
    if (!this.accepts(item.resourceId)) return 0;
    const unitPrice = this.getSellPrice(item.resourceId);
    const revenue = unitPrice * item.quantity;
    this.wallet.addCoins(revenue);
    this.totalRevenue += revenue;
    eventBus.emit('ItemSold', {
      shopId: this.id,
      itemId: item.resourceId,
      revenue,
    });
    return revenue;
  }
}
