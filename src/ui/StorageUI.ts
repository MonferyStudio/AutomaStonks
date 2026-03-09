import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { COLORS } from '@/utils/Constants';
import { formatNumber } from '@/utils/formatNumber';
import type { Storage } from '@/simulation/Storage';
import type { ResourceRegistry, ResourceDefinition } from '@/simulation/Resource';
import type { Market } from '@/economy/Market';
import type { Wallet } from '@/economy/Wallet';
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

const QTY_STYLE = new TextStyle({
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

const PANEL_WIDTH = 260;
const PANEL_PADDING = 14;
const ROW_HEIGHT = 36;
const BAR_HEIGHT = 4;

export class StorageUI {
  readonly container: Container;
  private contentContainer: Container;
  private storage: Storage | null = null;
  private resourceRegistry: ResourceRegistry;
  private market: Market;
  private wallet: Wallet;
  private visible = false;
  private bg: Graphics;

  // Buy popup state
  private buyPopup: Container;
  private buyPopupVisible = false;
  private selectedResource: ResourceDefinition | null = null;
  private buyQuantity = 10;

  constructor(resourceRegistry: ResourceRegistry, market: Market, wallet: Wallet) {
    this.resourceRegistry = resourceRegistry;
    this.market = market;
    this.wallet = wallet;

    this.container = new Container();
    this.container.visible = false;

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    const title = new Text({ text: 'STORAGE', style: TITLE_STYLE });
    title.position.set(PANEL_PADDING, PANEL_PADDING);
    this.container.addChild(title);

    this.contentContainer = new Container();
    this.contentContainer.position.set(PANEL_PADDING, PANEL_PADDING + 28);
    this.container.addChild(this.contentContainer);

    this.buyPopup = new Container();
    this.buyPopup.visible = false;
    this.container.addChild(this.buyPopup);

    eventBus.on('StorageUpdated', () => {
      if (this.visible) this.rebuild();
    });
  }

  setStorage(storage: Storage | null): void {
    this.storage = storage;
    if (this.visible) {
      if (!storage) this.hide();
      else this.rebuild();
    }
  }

  show(storage: Storage): void {
    this.storage = storage;
    this.visible = true;
    this.container.visible = true;
    this.closeBuyPopup();
    this.rebuild();
  }

  hide(): void {
    this.visible = false;
    this.container.visible = false;
    this.storage = null;
    this.closeBuyPopup();
  }

  toggle(storage: Storage): void {
    if (this.visible && this.storage === storage) {
      this.hide();
    } else {
      this.show(storage);
    }
  }

  private closeBuyPopup(): void {
    this.buyPopupVisible = false;
    this.buyPopup.visible = false;
    this.selectedResource = null;
  }

  private rebuild(): void {
    this.contentContainer.removeChildren();
    if (!this.storage) return;

    const storage = this.storage;
    let yOffset = 0;
    const barWidth = PANEL_WIDTH - PANEL_PADDING * 2;

    // Capacity bar
    const capacityLabel = new Text({
      text: `${formatNumber(storage.totalUsed)} / ${formatNumber(storage.maxCapacity)}`,
      style: QTY_STYLE,
    });
    this.contentContainer.addChild(capacityLabel);

    // Upgrade level indicator
    if (storage.upgradeLevel > 0) {
      const lvlText = new Text({
        text: `Lv.${storage.upgradeLevel}`,
        style: { ...DIM_STYLE, fill: COLORS.STORAGE },
      });
      lvlText.anchor.set(1, 0);
      lvlText.position.set(barWidth, 0);
      this.contentContainer.addChild(lvlText);
    }
    yOffset += 18;

    const barBg = new Graphics();
    barBg.rect(0, yOffset, barWidth, BAR_HEIGHT);
    barBg.fill({ color: COLORS.LOCKED, alpha: 0.5 });
    this.contentContainer.addChild(barBg);

    const fillRatio = storage.maxCapacity > 0 ? storage.totalUsed / storage.maxCapacity : 0;
    if (fillRatio > 0) {
      const barFill = new Graphics();
      barFill.rect(0, yOffset, barWidth * fillRatio, BAR_HEIGHT);
      barFill.fill(COLORS.STORAGE);
      this.contentContainer.addChild(barFill);
    }
    yOffset += BAR_HEIGHT + 10;

    // Inventory items
    const inventory = storage.getInventory();
    if (inventory.size === 0) {
      const emptyText = new Text({ text: 'Empty', style: DIM_STYLE });
      emptyText.position.set(0, yOffset);
      this.contentContainer.addChild(emptyText);
      yOffset += 20;
    } else {
      for (const [resourceId, qty] of inventory) {
        const def = this.resourceRegistry.get(resourceId);
        if (!def) continue;
        const row = this.createInventoryRow(def, qty, yOffset);
        this.contentContainer.addChild(row);
        yOffset += ROW_HEIGHT;
      }
    }

    // Separator
    yOffset += 6;
    const sep = new Graphics();
    sep.rect(0, yOffset, barWidth, 1);
    sep.fill({ color: COLORS.TEXT_DIM, alpha: 0.2 });
    this.contentContainer.addChild(sep);
    yOffset += 10;

    // Buy button
    const buyBtn = new Graphics();
    buyBtn.roundRect(0, yOffset, barWidth, 26, 6);
    buyBtn.fill({ color: COLORS.IO_INPUT, alpha: 0.3 });
    this.contentContainer.addChild(buyBtn);

    const buyText = new Text({ text: 'Buy Resources', style: { ...ITEM_STYLE, fontSize: 10 } });
    buyText.anchor.set(0.5, 0.5);
    buyText.position.set(barWidth / 2, yOffset + 13);
    this.contentContainer.addChild(buyText);

    buyBtn.eventMode = 'static';
    buyBtn.cursor = 'pointer';
    buyBtn.on('pointertap', () => {
      if (this.buyPopupVisible) {
        this.closeBuyPopup();
      } else {
        this.openBuyPopup();
      }
    });
    yOffset += 32;

    // Upgrade button
    const upgradeCost = storage.getUpgradeCost();
    if (upgradeCost !== null) {
      const canAfford = this.wallet.canAfford(upgradeCost);
      const upgradeBtn = new Graphics();
      upgradeBtn.roundRect(0, yOffset, barWidth, 26, 6);
      upgradeBtn.fill({ color: COLORS.ACCENT_VIOLET, alpha: canAfford ? 0.4 : 0.15 });
      this.contentContainer.addChild(upgradeBtn);

      const nextLevel = storage.upgradeLevel + 1;
      const upText = new Text({
        text: `Upgrade Lv.${nextLevel} (${formatNumber(upgradeCost)})`,
        style: { ...ITEM_STYLE, fontSize: 10, fill: canAfford ? COLORS.TEXT_PRIMARY : COLORS.TEXT_DIM },
      });
      upText.anchor.set(0.5, 0.5);
      upText.position.set(barWidth / 2, yOffset + 13);
      this.contentContainer.addChild(upText);

      upgradeBtn.eventMode = 'static';
      upgradeBtn.cursor = canAfford ? 'pointer' : 'default';
      upgradeBtn.on('pointertap', () => {
        if (this.storage) {
          this.storage.upgrade(this.wallet);
        }
      });
      yOffset += 32;
    } else {
      const maxText = new Text({ text: 'MAX LEVEL', style: { ...DIM_STYLE, fill: COLORS.ACCENT_VIOLET } });
      maxText.anchor.set(0.5, 0);
      maxText.position.set(barWidth / 2, yOffset);
      this.contentContainer.addChild(maxText);
      yOffset += 18;
    }

    // Draw background
    const panelHeight = PANEL_PADDING * 2 + 28 + yOffset + 10;
    this.bg.clear();
    this.bg.roundRect(0, 0, PANEL_WIDTH, panelHeight, 10);
    this.bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.95 });
    this.bg.roundRect(0, 0, PANEL_WIDTH, panelHeight, 10);
    this.bg.stroke({ color: COLORS.TEXT_DIM, alpha: 0.15, width: 1 });
  }

  private createInventoryRow(def: ResourceDefinition, qty: number, y: number): Container {
    const row = new Container();
    row.position.set(0, y);

    const rowBg = new Graphics();
    rowBg.roundRect(0, 0, PANEL_WIDTH - PANEL_PADDING * 2, ROW_HEIGHT - 4, 6);
    rowBg.fill({ color: COLORS.BG_CARD, alpha: 0.8 });
    row.addChild(rowBg);

    const colorSwatch = new Graphics();
    colorSwatch.circle(14, (ROW_HEIGHT - 4) / 2, 5);
    colorSwatch.fill(def.color);
    row.addChild(colorSwatch);

    const nameText = new Text({ text: def.name, style: ITEM_STYLE });
    nameText.position.set(26, 4);
    row.addChild(nameText);

    const categoryText = new Text({ text: def.category, style: DIM_STYLE });
    categoryText.position.set(26, 18);
    row.addChild(categoryText);

    const qtyText = new Text({ text: formatNumber(qty), style: QTY_STYLE });
    qtyText.anchor.set(1, 0.5);
    qtyText.position.set(PANEL_WIDTH - PANEL_PADDING * 2 - 8, (ROW_HEIGHT - 4) / 2);
    row.addChild(qtyText);

    return row;
  }

  private openBuyPopup(): void {
    this.buyPopupVisible = true;
    this.selectedResource = null;
    this.buyQuantity = 10;
    this.rebuildBuyPopup();
  }

  private rebuildBuyPopup(): void {
    this.buyPopup.removeChildren();
    this.buyPopup.visible = true;

    const popupWidth = PANEL_WIDTH;
    const popupX = PANEL_WIDTH + 6;
    this.buyPopup.position.set(popupX, 0);

    if (!this.selectedResource) {
      // Resource selection list
      this.buildResourceList(popupWidth);
    } else {
      // Quantity picker for selected resource
      this.buildQuantityPicker(popupWidth);
    }
  }

  private buildResourceList(popupWidth: number): void {
    const available = this.market.getAvailableResources();
    let yOffset = 0;

    const title = new Text({ text: 'SELECT RESOURCE', style: TITLE_STYLE });
    title.position.set(PANEL_PADDING, PANEL_PADDING);
    this.buyPopup.addChild(title);
    yOffset += PANEL_PADDING + 24;

    const innerWidth = popupWidth - PANEL_PADDING * 2;

    for (const res of available) {
      const row = new Container();
      row.position.set(PANEL_PADDING, yOffset);

      const rowBg = new Graphics();
      rowBg.roundRect(0, 0, innerWidth, 28, 6);
      rowBg.fill({ color: COLORS.BG_CARD, alpha: 0.8 });
      row.addChild(rowBg);

      const swatch = new Graphics();
      swatch.circle(12, 14, 4);
      swatch.fill(res.color);
      row.addChild(swatch);

      const name = new Text({ text: res.name, style: { ...ITEM_STYLE, fontSize: 10 } });
      name.position.set(22, 7);
      row.addChild(name);

      const price = new Text({
        text: `${formatNumber(this.market.getPrice(res.id))}/u`,
        style: { ...DIM_STYLE, fontSize: 9 },
      });
      price.anchor.set(1, 0.5);
      price.position.set(innerWidth - 8, 14);
      row.addChild(price);

      rowBg.eventMode = 'static';
      rowBg.cursor = 'pointer';
      rowBg.on('pointerover', () => {
        rowBg.clear();
        rowBg.roundRect(0, 0, innerWidth, 28, 6);
        rowBg.fill({ color: COLORS.BG_CARD });
        rowBg.stroke({ color: COLORS.IO_INPUT, width: 1, alpha: 0.5 });
      });
      rowBg.on('pointerout', () => {
        rowBg.clear();
        rowBg.roundRect(0, 0, innerWidth, 28, 6);
        rowBg.fill({ color: COLORS.BG_CARD, alpha: 0.8 });
      });
      rowBg.on('pointertap', () => {
        this.selectedResource = res;
        this.buyQuantity = 10;
        this.rebuildBuyPopup();
      });

      this.buyPopup.addChild(row);
      yOffset += 32;
    }

    // Close button
    yOffset += 4;
    const closeBtn = new Graphics();
    closeBtn.roundRect(PANEL_PADDING, yOffset, innerWidth, 22, 6);
    closeBtn.fill({ color: COLORS.ACCENT_RED, alpha: 0.3 });
    this.buyPopup.addChild(closeBtn);

    const closeText = new Text({ text: 'Cancel', style: { ...ITEM_STYLE, fontSize: 10 } });
    closeText.anchor.set(0.5, 0.5);
    closeText.position.set(popupWidth / 2, yOffset + 11);
    this.buyPopup.addChild(closeText);

    closeBtn.eventMode = 'static';
    closeBtn.cursor = 'pointer';
    closeBtn.on('pointertap', () => this.closeBuyPopup());
    yOffset += 28;

    // Background
    const panelHeight = yOffset + PANEL_PADDING;
    const bg = new Graphics();
    bg.roundRect(0, 0, popupWidth, panelHeight, 10);
    bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.95 });
    bg.roundRect(0, 0, popupWidth, panelHeight, 10);
    bg.stroke({ color: COLORS.TEXT_DIM, alpha: 0.15, width: 1 });
    this.buyPopup.addChildAt(bg, 0);
  }

  private buildQuantityPicker(popupWidth: number): void {
    const res = this.selectedResource!;
    const unitPrice = this.market.getPrice(res.id);
    const innerWidth = popupWidth - PANEL_PADDING * 2;
    let yOffset = PANEL_PADDING;

    // Title with resource name
    const title = new Text({ text: `BUY ${res.name.toUpperCase()}`, style: TITLE_STYLE });
    title.position.set(PANEL_PADDING, yOffset);
    this.buyPopup.addChild(title);
    yOffset += 24;

    // Resource info
    const swatch = new Graphics();
    swatch.circle(PANEL_PADDING + 8, yOffset + 8, 6);
    swatch.fill(res.color);
    this.buyPopup.addChild(swatch);

    const priceText = new Text({
      text: `Price: ${formatNumber(unitPrice)} / unit`,
      style: DIM_STYLE,
    });
    priceText.position.set(PANEL_PADDING + 20, yOffset + 2);
    this.buyPopup.addChild(priceText);
    yOffset += 24;

    // Quantity selector
    const qtyLabel = new Text({ text: 'Quantity:', style: ITEM_STYLE });
    qtyLabel.position.set(PANEL_PADDING, yOffset + 4);
    this.buyPopup.addChild(qtyLabel);

    // Minus button
    const minusBtn = new Graphics();
    minusBtn.roundRect(PANEL_PADDING + 70, yOffset, 26, 24, 4);
    minusBtn.fill({ color: COLORS.BG_CARD });
    minusBtn.stroke({ color: COLORS.TEXT_DIM, width: 1, alpha: 0.3 });
    this.buyPopup.addChild(minusBtn);
    const minusText = new Text({ text: '-', style: { ...ITEM_STYLE, fontSize: 14 } });
    minusText.anchor.set(0.5, 0.5);
    minusText.position.set(PANEL_PADDING + 83, yOffset + 12);
    this.buyPopup.addChild(minusText);
    minusBtn.eventMode = 'static';
    minusBtn.cursor = 'pointer';
    minusBtn.on('pointertap', () => {
      this.buyQuantity = Math.max(1, this.buyQuantity - 10);
      this.rebuildBuyPopup();
    });

    // Quantity display
    const qtyDisplay = new Text({
      text: `${this.buyQuantity}`,
      style: QTY_STYLE,
    });
    qtyDisplay.anchor.set(0.5, 0.5);
    qtyDisplay.position.set(PANEL_PADDING + 125, yOffset + 12);
    this.buyPopup.addChild(qtyDisplay);

    // Plus button
    const plusBtn = new Graphics();
    plusBtn.roundRect(PANEL_PADDING + 148, yOffset, 26, 24, 4);
    plusBtn.fill({ color: COLORS.BG_CARD });
    plusBtn.stroke({ color: COLORS.TEXT_DIM, width: 1, alpha: 0.3 });
    this.buyPopup.addChild(plusBtn);
    const plusText = new Text({ text: '+', style: { ...ITEM_STYLE, fontSize: 14 } });
    plusText.anchor.set(0.5, 0.5);
    plusText.position.set(PANEL_PADDING + 161, yOffset + 12);
    this.buyPopup.addChild(plusText);
    plusBtn.eventMode = 'static';
    plusBtn.cursor = 'pointer';
    plusBtn.on('pointertap', () => {
      this.buyQuantity = Math.min(this.buyQuantity + 10, this.storage?.remainingCapacity ?? 9999);
      this.rebuildBuyPopup();
    });
    yOffset += 30;

    // Quick quantity buttons
    const quickAmounts = [1, 10, 50, 100];
    const quickBtnW = (innerWidth - 12) / quickAmounts.length;
    for (let i = 0; i < quickAmounts.length; i++) {
      const amt = quickAmounts[i];
      const qb = new Graphics();
      qb.roundRect(PANEL_PADDING + i * (quickBtnW + 4), yOffset, quickBtnW, 20, 4);
      qb.fill({ color: this.buyQuantity === amt ? COLORS.IO_INPUT : COLORS.BG_CARD, alpha: this.buyQuantity === amt ? 0.4 : 0.8 });
      this.buyPopup.addChild(qb);

      const qt = new Text({ text: `${amt}`, style: { ...DIM_STYLE, fontSize: 9 } });
      qt.anchor.set(0.5, 0.5);
      qt.position.set(PANEL_PADDING + i * (quickBtnW + 4) + quickBtnW / 2, yOffset + 10);
      this.buyPopup.addChild(qt);

      qb.eventMode = 'static';
      qb.cursor = 'pointer';
      qb.on('pointertap', () => {
        this.buyQuantity = amt;
        this.rebuildBuyPopup();
      });
    }
    yOffset += 28;

    // Total cost
    const totalCost = unitPrice * this.buyQuantity;
    const canAfford = this.wallet.canAfford(totalCost);
    const hasSpace = (this.storage?.remainingCapacity ?? 0) >= this.buyQuantity;
    const canBuy = canAfford && hasSpace && this.buyQuantity > 0;

    const costText = new Text({
      text: `Total: ${formatNumber(totalCost)} coins`,
      style: { ...QTY_STYLE, fill: canAfford ? COLORS.ACCENT_YELLOW : COLORS.ACCENT_RED },
    });
    costText.position.set(PANEL_PADDING, yOffset);
    this.buyPopup.addChild(costText);
    yOffset += 18;

    if (!hasSpace) {
      const noSpaceText = new Text({ text: 'Not enough storage space', style: { ...DIM_STYLE, fill: COLORS.ACCENT_RED } });
      noSpaceText.position.set(PANEL_PADDING, yOffset);
      this.buyPopup.addChild(noSpaceText);
      yOffset += 16;
    }

    // Confirm buy button
    yOffset += 4;
    const confirmBtn = new Graphics();
    confirmBtn.roundRect(PANEL_PADDING, yOffset, innerWidth, 28, 6);
    confirmBtn.fill({ color: COLORS.IO_INPUT, alpha: canBuy ? 0.5 : 0.15 });
    this.buyPopup.addChild(confirmBtn);

    const confirmText = new Text({
      text: `Buy ${this.buyQuantity} ${res.name}`,
      style: { ...ITEM_STYLE, fontSize: 11, fill: canBuy ? COLORS.TEXT_PRIMARY : COLORS.TEXT_DIM },
    });
    confirmText.anchor.set(0.5, 0.5);
    confirmText.position.set(popupWidth / 2, yOffset + 14);
    this.buyPopup.addChild(confirmText);

    confirmBtn.eventMode = 'static';
    confirmBtn.cursor = canBuy ? 'pointer' : 'default';
    confirmBtn.on('pointertap', () => {
      if (!this.storage || !canBuy) return;
      const item = this.market.buy(res.id, this.buyQuantity);
      if (item) {
        this.storage.deposit(item.resourceId, item.quantity);
        eventBus.emit('StorageUpdated', { storageId: this.storage.id });
        this.rebuildBuyPopup();
        this.rebuild();
      }
    });
    yOffset += 34;

    // Back button
    const backBtn = new Graphics();
    backBtn.roundRect(PANEL_PADDING, yOffset, innerWidth, 22, 6);
    backBtn.fill({ color: COLORS.ACCENT_RED, alpha: 0.3 });
    this.buyPopup.addChild(backBtn);

    const backText = new Text({ text: 'Back', style: { ...ITEM_STYLE, fontSize: 10 } });
    backText.anchor.set(0.5, 0.5);
    backText.position.set(popupWidth / 2, yOffset + 11);
    this.buyPopup.addChild(backText);

    backBtn.eventMode = 'static';
    backBtn.cursor = 'pointer';
    backBtn.on('pointertap', () => {
      this.selectedResource = null;
      this.rebuildBuyPopup();
    });
    yOffset += 28;

    // Background
    const panelHeight = yOffset + PANEL_PADDING;
    const bg = new Graphics();
    bg.roundRect(0, 0, popupWidth, panelHeight, 10);
    bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.95 });
    bg.roundRect(0, 0, popupWidth, panelHeight, 10);
    bg.stroke({ color: COLORS.TEXT_DIM, alpha: 0.15, width: 1 });
    this.buyPopup.addChildAt(bg, 0);
  }

  positionAt(_screenWidth: number, _screenHeight: number): void {
    this.container.position.set(10, 70);
  }
}
