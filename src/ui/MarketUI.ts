import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { COLORS } from '@/utils/Constants';
import { formatNumber } from '@/utils/formatNumber';
import type { Market } from '@/economy/Market';
import type { ResourceRegistry, ResourceDefinition } from '@/simulation/Resource';
import type { Wallet } from '@/economy/Wallet';
import type { Factory } from '@/simulation/Factory';
import { IOPort } from '@/factory/IOPort';
import { ItemStack } from '@/simulation/ItemStack';
import { eventBus } from '@/core/EventBus';

const TITLE_STYLE = new TextStyle({
  fontFamily: 'Space Mono, monospace',
  fontSize: 11,
  fontWeight: '700',
  fill: COLORS.TEXT_PRIMARY,
  letterSpacing: 2,
});

const ITEM_STYLE = new TextStyle({
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 11,
  fill: COLORS.TEXT_PRIMARY,
});

const PRICE_STYLE = new TextStyle({
  fontFamily: 'Space Mono, monospace',
  fontSize: 11,
  fontWeight: '600',
  fill: COLORS.ACCENT_YELLOW,
});

const DIM_STYLE = new TextStyle({
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 10,
  fill: COLORS.TEXT_DIM,
});

const PANEL_WIDTH = 240;
const PANEL_PADDING = 14;
const ROW_HEIGHT = 36;

export class MarketUI {
  readonly container: Container;
  private contentContainer: Container;
  private market: Market;
  private wallet: Wallet;
  private activeFactory: Factory | null = null;
  private visible = false;
  private bg: Graphics;

  constructor(market: Market, wallet: Wallet) {
    this.market = market;
    this.wallet = wallet;

    this.container = new Container();
    this.container.visible = false;

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    const title = new Text({ text: 'MARKET', style: TITLE_STYLE });
    title.position.set(PANEL_PADDING, PANEL_PADDING);
    this.container.addChild(title);

    this.contentContainer = new Container();
    this.contentContainer.position.set(PANEL_PADDING, PANEL_PADDING + 28);
    this.container.addChild(this.contentContainer);

    eventBus.on('MoneyChanged', () => this.rebuild());
  }

  setActiveFactory(factory: Factory | null): void {
    this.activeFactory = factory;
    if (this.visible) this.rebuild();
  }

  toggle(): void {
    this.visible = !this.visible;
    this.container.visible = this.visible;
    if (this.visible) this.rebuild();
  }

  show(): void {
    this.visible = true;
    this.container.visible = true;
    this.rebuild();
  }

  hide(): void {
    this.visible = false;
    this.container.visible = false;
  }

  private rebuild(): void {
    this.contentContainer.removeChildren();

    const available = this.market.getAvailableResources();
    let yOffset = 0;

    const balanceText = new Text({
      text: `Balance: ${formatNumber(this.wallet.coins)}`,
      style: PRICE_STYLE,
    });
    this.contentContainer.addChild(balanceText);
    yOffset += 24;

    for (const res of available) {
      const row = this.createResourceRow(res, yOffset);
      this.contentContainer.addChild(row);
      yOffset += ROW_HEIGHT;
    }

    const panelHeight = PANEL_PADDING * 2 + 28 + yOffset + 10;
    this.bg.clear();
    this.bg.roundRect(0, 0, PANEL_WIDTH, panelHeight, 10);
    this.bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.95 });
    this.bg.roundRect(0, 0, PANEL_WIDTH, panelHeight, 10);
    this.bg.stroke({ color: COLORS.TEXT_DIM, alpha: 0.15, width: 1 });
  }

  private createResourceRow(res: ResourceDefinition, y: number): Container {
    const row = new Container();
    row.position.set(0, y);

    const canAfford = this.wallet.canAfford(this.market.getPrice(res.id));

    const rowBg = new Graphics();
    rowBg.roundRect(0, 0, PANEL_WIDTH - PANEL_PADDING * 2, ROW_HEIGHT - 4, 6);
    rowBg.fill({ color: COLORS.BG_CARD, alpha: canAfford ? 0.8 : 0.3 });
    row.addChild(rowBg);

    const colorSwatch = new Graphics();
    colorSwatch.circle(14, (ROW_HEIGHT - 4) / 2, 5);
    colorSwatch.fill(res.color);
    row.addChild(colorSwatch);

    const nameText = new Text({ text: res.name, style: ITEM_STYLE });
    nameText.position.set(26, 4);
    row.addChild(nameText);

    const categoryText = new Text({ text: res.category, style: DIM_STYLE });
    categoryText.position.set(26, 18);
    row.addChild(categoryText);

    const price = this.market.getPrice(res.id);
    const priceText = new Text({ text: formatNumber(price), style: PRICE_STYLE });
    priceText.anchor.set(1, 0.5);
    priceText.position.set(PANEL_WIDTH - PANEL_PADDING * 2 - 30, (ROW_HEIGHT - 4) / 2);
    row.addChild(priceText);

    const priceIcon = new Graphics();
    priceIcon.circle(PANEL_WIDTH - PANEL_PADDING * 2 - 18, (ROW_HEIGHT - 4) / 2, 4);
    priceIcon.fill(COLORS.ACCENT_YELLOW);
    row.addChild(priceIcon);

    const buyBtn = new Graphics();
    buyBtn.roundRect(PANEL_WIDTH - PANEL_PADDING * 2 - 12, 2, 10, ROW_HEIGHT - 8, 3);
    buyBtn.fill({ color: canAfford ? COLORS.IO_INPUT : COLORS.LOCKED, alpha: 0.6 });
    row.addChild(buyBtn);

    row.eventMode = 'static';
    row.cursor = canAfford ? 'pointer' : 'not-allowed';

    row.on('pointertap', () => {
      this.buyResource(res.id);
    });

    return row;
  }

  private buyResource(resourceId: string): void {
    const item = this.market.buy(resourceId, 1);
    if (!item) return;

    if (this.activeFactory) {
      const inputPorts = this.activeFactory.getIOPorts().filter((p) => p.portType === 'input');
      for (const port of inputPorts) {
        if (port.canAcceptItem()) {
          if (!port.resourceFilter || port.resourceFilter === resourceId) {
            port.acceptItem(item);
            this.rebuild();
            return;
          }
        }
      }
    }

    this.rebuild();
  }

  positionAt(_screenWidth: number, _screenHeight: number): void {
    this.container.position.set(10, 70);
  }
}
