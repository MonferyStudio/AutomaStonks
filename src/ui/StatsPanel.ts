import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { COLORS } from '@/utils/Constants';
import { formatNumber } from '@/utils/formatNumber';
import { eventBus } from '@/core/EventBus';

const TITLE_STYLE = new TextStyle({
  fontFamily: 'Space Mono, monospace',
  fontSize: 12,
  fontWeight: '700',
  fill: COLORS.TEXT_PRIMARY,
  letterSpacing: 2,
});

const LABEL_STYLE = new TextStyle({
  fontFamily: 'Space Mono, monospace',
  fontSize: 9,
  fill: COLORS.TEXT_DIM,
});

const VALUE_STYLE = new TextStyle({
  fontFamily: 'Space Mono, monospace',
  fontSize: 10,
  fontWeight: '600',
  fill: COLORS.TEXT_PRIMARY,
});

export class StatsPanel {
  readonly container: Container;
  private bg: Graphics;
  private visible = false;

  private totalItemsProduced = 0;
  private totalItemsSold = 0;
  private totalRevenue = 0;
  private recipesDiscovered = 0;
  private questsCompleted = 0;

  private labels: Text[] = [];
  private values: Text[] = [];

  constructor() {
    this.container = new Container();
    this.container.zIndex = 90;
    this.container.visible = false;

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    const title = new Text({ text: 'STATISTICS', style: TITLE_STYLE });
    title.position.set(14, 12);
    this.container.addChild(title);

    const stats = [
      'Items Produced',
      'Items Sold',
      'Total Revenue',
      'Recipes Discovered',
      'Quests Completed',
    ];

    let y = 40;
    for (const stat of stats) {
      const label = new Text({ text: stat, style: LABEL_STYLE });
      label.position.set(14, y);
      this.container.addChild(label);
      this.labels.push(label);

      const value = new Text({ text: '0', style: VALUE_STYLE });
      value.position.set(14, y + 14);
      this.container.addChild(value);
      this.values.push(value);

      y += 36;
    }

    this.drawBg();
    this.setupListeners();
  }

  private drawBg(): void {
    this.bg.clear();
    this.bg.roundRect(0, 0, 200, 230, 10);
    this.bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.95 });
  }

  private setupListeners(): void {
    eventBus.on('ItemProduced', () => {
      this.totalItemsProduced++;
      this.refresh();
    });
    eventBus.on('ItemSold', (data) => {
      this.totalItemsSold++;
      this.totalRevenue += data.revenue;
      this.refresh();
    });
    eventBus.on('RecipeDiscovered', () => {
      this.recipesDiscovered++;
      this.refresh();
    });
    eventBus.on('QuestCompleted', () => {
      this.questsCompleted++;
      this.refresh();
    });
  }

  private refresh(): void {
    if (!this.visible) return;
    const vals = [
      this.totalItemsProduced,
      this.totalItemsSold,
      this.totalRevenue,
      this.recipesDiscovered,
      this.questsCompleted,
    ];
    for (let i = 0; i < this.values.length; i++) {
      this.values[i].text = formatNumber(vals[i]);
    }
  }

  toggle(): void {
    this.visible = !this.visible;
    this.container.visible = this.visible;
    if (this.visible) this.refresh();
  }

  positionAt(width: number, height: number): void {
    this.container.position.set(width - 220, height / 2 - 115);
  }
}
