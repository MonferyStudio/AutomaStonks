import type { CityShop } from '@/economy/CityShop';
import type { ResourceRegistry } from '@/simulation/Resource';
import { formatMoney } from '@/utils/currency';
import { makeItemVisual } from './itemVisual';
import { makeCloseButton } from './closeButton';
import { getXPManager } from '@/economy/XPManager';
import type { RecipeBook } from '@/simulation/RecipeBook';
import type { RecipeRegistry } from '@/simulation/RecipeRegistry';

/**
 * HTML-based shop info panel — shows shop name, specialization, accepted items, and prices.
 */
export class ShopUI {
  private panel: HTMLDivElement;
  private contentDiv: HTMLDivElement;
  private shop: CityShop | null = null;
  private resourceRegistry: ResourceRegistry;
  private recipeBook: RecipeBook | null = null;
  private recipeRegistry: RecipeRegistry | null = null;
  private visible = false;

  constructor(resourceRegistry: ResourceRegistry, recipeBook?: RecipeBook, recipeRegistry?: RecipeRegistry) {
    this.resourceRegistry = resourceRegistry;
    this.recipeBook = recipeBook ?? null;
    this.recipeRegistry = recipeRegistry ?? null;

    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 'min(420px, calc(100vw - 24px))', maxHeight: 'min(80vh, calc(100dvh - 48px))',
      background: '#16213e', border: '1px solid #2d3548',
      borderRadius: '10px', color: '#e8e8e8',
      fontFamily: 'Inter, sans-serif', fontSize: '12px',
      overflowY: 'auto', zIndex: '950', display: 'none',
      boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
    });

    // Header
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 12px', borderBottom: '1px solid #2d3548', background: '#0d1525',
      borderRadius: '8px 8px 0 0',
    });
    const title = document.createElement('span');
    title.textContent = 'Shop';
    title.style.fontWeight = '700';
    title.id = 'shop-ui-title';
    const closeBtn = makeCloseButton(() => this.hide());
    header.append(title, closeBtn);
    this.panel.appendChild(header);

    this.contentDiv = document.createElement('div');
    this.contentDiv.style.padding = '8px';
    this.panel.appendChild(this.contentDiv);

    document.body.appendChild(this.panel);
  }

  show(shop: CityShop): void {
    this.shop = shop;
    this.visible = true;
    this.panel.style.display = 'block';
    this.refresh();
  }

  hide(): void {
    this.visible = false;
    this.panel.style.display = 'none';
    this.shop = null;
  }

  toggle(shop: CityShop): void {
    if (this.visible && this.shop === shop) {
      this.hide();
    } else {
      this.show(shop);
    }
  }

  get isVisible(): boolean { return this.visible; }

  private refresh(): void {
    if (!this.shop) return;
    const shop = this.shop;
    const def = shop.definition;

    const titleEl = this.panel.querySelector('#shop-ui-title');
    if (titleEl) titleEl.textContent = def.name;

    this.contentDiv.innerHTML = '';

    // Description
    const desc = document.createElement('div');
    desc.style.color = '#8892a4';
    desc.style.marginBottom = '8px';
    desc.textContent = def.description;
    this.contentDiv.appendChild(desc);

    // Price modifier
    const modRow = document.createElement('div');
    modRow.style.marginBottom = '8px';
    const modPercent = Math.round((def.priceModifier - 1) * 100);
    const modStr = modPercent >= 0 ? `+${modPercent}%` : `${modPercent}%`;
    modRow.innerHTML = `<span style="color:#8892a4">Price bonus:</span> <span style="color:#53d769;font-weight:700">${modStr}</span>`;
    this.contentDiv.appendChild(modRow);

    // Revenue
    const revRow = document.createElement('div');
    revRow.style.marginBottom = '10px';
    revRow.innerHTML = `<span style="color:#8892a4">Total revenue:</span> <span style="color:#f4c542;font-weight:700">${formatMoney(shop.totalRevenue)}</span>`;
    this.contentDiv.appendChild(revRow);

    // Separator
    const sep = document.createElement('hr');
    Object.assign(sep.style, { border: 'none', borderTop: '1px solid #2d3548', margin: '8px 0' });
    this.contentDiv.appendChild(sep);

    // Accepted items with prices
    const headerRow = document.createElement('div');
    Object.assign(headerRow.style, { display: 'flex', justifyContent: 'space-between', marginBottom: '4px', color: '#8892a4', fontSize: '10px' });
    headerRow.innerHTML = '<span>Item</span><span>Sell Price</span>';
    this.contentDiv.appendChild(headerRow);

    // List all resources and show which this shop accepts
    const xp = getXPManager();
    const allResources = this.resourceRegistry.getAll();
    for (const res of allResources) {
      if (!shop.accepts(res.id)) continue;
      if (res.sellPrice <= 0) continue;
      if (xp && !xp.isUnlocked(res.requiredLevel ?? 0)) continue;
      // Hide processed items whose recipe hasn't been discovered yet
      if (res.origin !== 'natural' && this.recipeBook && this.recipeRegistry) {
        const recipes = this.recipeRegistry.getAll();
        const producing = recipes.find(r => r.outputs.some(o => o.resourceId === res.id));
        if (producing && !this.recipeBook.isDiscovered(producing.id)) continue;
      }

      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '6px 8px', marginBottom: '3px',
        background: '#1c2541', borderRadius: '6px',
      });

      const visual = makeItemVisual(res, 32);
      visual.style.flexShrink = '0';
      row.appendChild(visual);

      const name = document.createElement('span');
      name.textContent = res.name;
      name.style.flex = '1';
      row.appendChild(name);

      const price = shop.getSellPrice(res.id);
      const basePrice = res.sellPrice;
      const right = document.createElement('span');
      right.style.fontWeight = '600';
      right.style.color = price > basePrice ? '#53d769' : '#f4c542';
      right.textContent = `${formatMoney(price)}`;
      row.appendChild(right);

      this.contentDiv.appendChild(row);
    }
  }

  destroy(): void {
    this.panel.remove();
  }
}
