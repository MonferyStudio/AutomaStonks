import type { PriceEngine, PriceSnapshot } from '@/economy/PriceEngine';
import type { ResourceRegistry, ResourceDefinition } from '@/simulation/Resource';
import { formatMoney } from '@/utils/currency';
import { eventBus } from '@/core/EventBus';
import { makeItemVisual } from './itemVisual';
import { makeCloseButton } from './closeButton';
import { getXPManager } from '@/economy/XPManager';
import type { RecipeBook } from '@/simulation/RecipeBook';
import type { RecipeRegistry } from '@/simulation/RecipeRegistry';

/**
 * HTML-based Market Board panel — shows all resource prices with sparkline graphs.
 */
export class MarketBoardUI {
  private panel: HTMLDivElement;
  private contentDiv: HTMLDivElement;
  private priceEngine: PriceEngine;
  private resourceRegistry: ResourceRegistry;
  private recipeBook: RecipeBook | null = null;
  private recipeRegistry: RecipeRegistry | null = null;
  private visible = false;
  private unsubscribe: (() => void) | null = null;

  constructor(priceEngine: PriceEngine, resourceRegistry: ResourceRegistry, recipeBook?: RecipeBook, recipeRegistry?: RecipeRegistry) {
    this.priceEngine = priceEngine;
    this.resourceRegistry = resourceRegistry;
    this.recipeBook = recipeBook ?? null;
    this.recipeRegistry = recipeRegistry ?? null;

    this.panel = document.createElement('div');
    Object.assign(this.panel.style, {
      position: 'fixed', top: '50%', left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 'min(560px, calc(100vw - 24px))', maxHeight: 'min(80vh, calc(100dvh - 48px))',
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
      padding: '12px 16px', borderBottom: '1px solid #2d3548', background: '#0d1525',
      borderRadius: '10px 10px 0 0', position: 'sticky', top: '0', zIndex: '1',
    });
    const title = document.createElement('span');
    title.textContent = 'Market Board';
    title.style.fontWeight = '700';
    title.style.fontSize = '13px';
    const closeBtn = makeCloseButton(() => this.hide());
    header.append(title, closeBtn);
    this.panel.appendChild(header);

    // Column headers
    const colHeader = document.createElement('div');
    Object.assign(colHeader.style, {
      display: 'grid', gridTemplateColumns: '32px 1fr 70px 70px 100px',
      gap: '4px', padding: '6px 16px', borderBottom: '1px solid #2d3548',
      color: '#8892a4', fontSize: '9px', fontWeight: '600',
      textTransform: 'uppercase', letterSpacing: '1px',
    });
    colHeader.innerHTML = '<span></span><span>Resource</span><span style="text-align:right">Buy</span><span style="text-align:right">Sell</span><span style="text-align:center">Trend</span>';
    this.panel.appendChild(colHeader);

    this.contentDiv = document.createElement('div');
    this.contentDiv.style.padding = '4px 0';
    this.panel.appendChild(this.contentDiv);

    document.body.appendChild(this.panel);
  }

  show(): void {
    this.visible = true;
    this.panel.style.display = 'block';
    this.refresh();
    // Subscribe to price updates
    this.unsubscribe = eventBus.on('PricesUpdated', () => {
      if (this.visible) this.refresh();
    });
  }

  hide(): void {
    this.visible = false;
    this.panel.style.display = 'none';
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  toggle(): void {
    if (this.visible) this.hide(); else this.show();
  }

  get isVisible(): boolean { return this.visible; }

  private refresh(): void {
    this.contentDiv.innerHTML = '';

    const xp = getXPManager();
    const resources = this.resourceRegistry.getAll();
    // Group by tier
    const tiers = new Map<number, ResourceDefinition[]>();
    for (const res of resources) {
      if (res.id === 'dust') continue;
      if (xp && !xp.isUnlocked(res.requiredLevel ?? 0)) continue;
      // Hide processed items whose recipe hasn't been discovered
      if (res.origin !== 'natural' && this.recipeBook && this.recipeRegistry) {
        const producing = this.recipeRegistry.getAll().find(r => r.outputs.some(o => o.resourceId === res.id));
        if (producing && !this.recipeBook.isDiscovered(producing.id)) continue;
      }
      const list = tiers.get(res.tier) ?? [];
      list.push(res);
      tiers.set(res.tier, list);
    }

    for (const [tier, resList] of [...tiers.entries()].sort((a, b) => a[0] - b[0])) {
      // Tier header
      const tierHeader = document.createElement('div');
      Object.assign(tierHeader.style, {
        padding: '4px 16px', color: '#8892a4', fontSize: '9px',
        fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px',
        background: '#0d1525', marginTop: '2px',
      });
      const tierLabels = ['Raw Materials', 'Processed', 'Manufactured'];
      tierHeader.textContent = tierLabels[tier] ?? `Tier ${tier}`;
      this.contentDiv.appendChild(tierHeader);

      for (const res of resList) {
        this.contentDiv.appendChild(this.buildRow(res));
      }
    }
  }

  private buildRow(res: ResourceDefinition): HTMLDivElement {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'grid', gridTemplateColumns: '32px 1fr 70px 70px 100px',
      gap: '4px', padding: '6px 16px', alignItems: 'center',
      borderBottom: '1px solid rgba(45,53,72,0.5)',
    });
    row.addEventListener('pointerenter', () => row.style.background = '#1c2541');
    row.addEventListener('pointerleave', () => row.style.background = 'transparent');

    // Item sprite
    const visual = makeItemVisual(res, 32);
    visual.style.flexShrink = '0';
    row.appendChild(visual);

    // Name
    const name = document.createElement('div');
    name.textContent = res.name;
    name.style.fontWeight = '600';
    row.appendChild(name);

    // Buy price
    const buyPrice = this.priceEngine.getBuyPrice(res.id);
    const buyEl = document.createElement('div');
    buyEl.style.textAlign = 'right';
    if (buyPrice > 0) {
      const mod = this.priceEngine.getModifier(res.id);
      buyEl.style.color = mod > 1.05 ? '#e94560' : mod < 0.95 ? '#53d769' : '#f4c542';
      buyEl.textContent = formatMoney(buyPrice);
    } else {
      buyEl.style.color = '#555';
      buyEl.textContent = '-';
    }
    row.appendChild(buyEl);

    // Sell price
    const sellPrice = this.priceEngine.getSellPrice(res.id);
    const sellEl = document.createElement('div');
    sellEl.style.textAlign = 'right';
    sellEl.style.color = '#f4c542';
    sellEl.textContent = formatMoney(sellPrice);
    row.appendChild(sellEl);

    // Sparkline
    const sparkContainer = document.createElement('div');
    sparkContainer.style.textAlign = 'center';
    const history = this.priceEngine.getHistory(res.id);
    if (history.length >= 2) {
      sparkContainer.appendChild(this.drawSparkline(history, res.basePrice));
    } else {
      sparkContainer.style.color = '#555';
      sparkContainer.textContent = '...';
    }
    row.appendChild(sparkContainer);

    return row;
  }

  private drawSparkline(history: readonly PriceSnapshot[], basePrice: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    const w = 80;
    const h = 24;
    canvas.width = w;
    canvas.height = h;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const prices = history.map(s => s.buy || s.sell);
    if (prices.length < 2) return canvas;

    const min = Math.min(...prices) * 0.95;
    const max = Math.max(...prices) * 1.05;
    const range = max - min || 1;

    // Draw base price line
    if (basePrice > 0) {
      const baseY = h - ((basePrice - min) / range) * h;
      ctx.strokeStyle = 'rgba(136,146,164,0.3)';
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(0, baseY);
      ctx.lineTo(w, baseY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw price line
    const latest = prices[prices.length - 1];
    const first = prices[0];
    const trending = latest >= first;
    ctx.strokeStyle = trending ? '#53d769' : '#e94560';
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    for (let i = 0; i < prices.length; i++) {
      const x = (i / (prices.length - 1)) * w;
      const y = h - ((prices[i] - min) / range) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw dot at end
    const lastX = w;
    const lastY = h - ((latest - min) / range) * h;
    ctx.fillStyle = trending ? '#53d769' : '#e94560';
    ctx.beginPath();
    ctx.arc(lastX - 1, lastY, 2, 0, Math.PI * 2);
    ctx.fill();

    return canvas;
  }

  destroy(): void {
    this.unsubscribe?.();
    this.panel.remove();
  }
}
