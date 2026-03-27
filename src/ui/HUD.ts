import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { COLORS, FONT_MONO, FONT_UI } from '@/utils/Constants';
import { formatMoney } from '@/utils/currency';
import { formatNumber } from '@/utils/formatNumber';
import type { Wallet } from '@/economy/Wallet';
import type { XPManager } from '@/economy/XPManager';
import { eventBus } from '@/core/EventBus';

const VALUE_STYLE = new TextStyle({
  fontFamily: FONT_MONO,
  fontSize: 14,
  fontWeight: '700',
  fill: COLORS.TEXT_PRIMARY,
});

const LEVEL_STYLE = new TextStyle({
  fontFamily: FONT_UI,
  fontSize: 11,
  fontWeight: '800',
  fill: 0xffffff,
});

const XP_LABEL_STYLE = new TextStyle({
  fontFamily: FONT_MONO,
  fontSize: 9,
  fontWeight: '600',
  fill: COLORS.TEXT_DIM,
});

export class HUD {
  readonly container: Container;
  private bg: Graphics;
  private coinsText: Text;
  private talentText: Text;
  private wallet: Wallet;
  private coinIcon: Graphics;
  private talentIcon: Graphics;

  // XP/Level
  private xpManager: XPManager | null = null;
  private levelBadge: Graphics;
  private levelText: Text;
  private xpBar: Graphics;
  private xpLabel: Text;

  constructor(wallet: Wallet) {
    this.wallet = wallet;
    this.container = new Container();

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    this.coinIcon = new Graphics();
    this.coinIcon.circle(0, 0, 8);
    this.coinIcon.fill(COLORS.ACCENT_YELLOW);
    this.container.addChild(this.coinIcon);

    this.coinsText = new Text({ text: formatMoney(wallet.coins), style: VALUE_STYLE });
    this.coinsText.anchor.set(0, 0.5);
    this.container.addChild(this.coinsText);

    this.talentIcon = new Graphics();
    this.talentIcon.moveTo(0, -8);
    this.talentIcon.lineTo(8, 0);
    this.talentIcon.lineTo(0, 8);
    this.talentIcon.lineTo(-8, 0);
    this.talentIcon.closePath();
    this.talentIcon.fill(COLORS.ACCENT_VIOLET);
    this.container.addChild(this.talentIcon);

    this.talentText = new Text({ text: formatNumber(wallet.talent), style: VALUE_STYLE });
    this.talentText.anchor.set(0, 0.5);
    this.container.addChild(this.talentText);

    // Level badge
    this.levelBadge = new Graphics();
    this.container.addChild(this.levelBadge);

    this.levelText = new Text({ text: '0', style: LEVEL_STYLE });
    this.levelText.anchor.set(0.5);
    this.container.addChild(this.levelText);

    // XP bar
    this.xpBar = new Graphics();
    this.container.addChild(this.xpBar);

    this.xpLabel = new Text({ text: '', style: XP_LABEL_STYLE });
    this.xpLabel.anchor.set(0.5);
    this.container.addChild(this.xpLabel);

    eventBus.on('MoneyChanged', () => this.updateText());
    eventBus.on('CurrencyChanged', () => this.updateText());
    eventBus.on('XPGained', () => this.updateXP());
    eventBus.on('LevelChanged', () => this.updateXP());
  }

  setXPManager(xp: XPManager): void {
    this.xpManager = xp;
    this.updateXP();
  }

  private updateText(): void {
    this.coinsText.text = formatMoney(this.wallet.coins);
    this.talentText.text = formatNumber(this.wallet.talent);
  }

  private updateXP(): void {
    if (!this.xpManager) return;
    this.levelText.text = `${this.xpManager.currentLevel}`;
    this.xpLabel.text = `${this.xpManager.xpInCurrentLevel}/${this.xpManager.xpForNextLevel}`;
    this.drawXPBar();
  }

  private drawXPBar(): void {
    if (!this.xpManager || !this._lastBarX) return;
    const barW = 60;
    const barH = 6;
    const x = this._lastBarX;
    const y = this._lastBarY;

    this.xpBar.clear();
    // Background
    this.xpBar.roundRect(x, y, barW, barH, 3);
    this.xpBar.fill({ color: 0x0d1525, alpha: 0.8 });
    // Fill
    const fillW = Math.max(2, barW * this.xpManager.progress);
    this.xpBar.roundRect(x, y, fillW, barH, 3);
    this.xpBar.fill({ color: 0x4dc9f6 });
  }

  private _lastBarX = 0;
  private _lastBarY = 0;

  positionAt(screenWidth: number): void {
    const barW = 340;
    const barH = 40;
    const cx = screenWidth / 2;

    this.bg.clear();
    this.bg.roundRect(cx - barW / 2, 8, barW, barH, 8);
    this.bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.9 });

    const y = 8 + barH / 2;

    // Coins: icon + text
    this.coinIcon.position.set(cx - barW / 2 + 22, y);
    this.coinsText.position.set(cx - barW / 2 + 38, y);

    // Talent: icon + text
    this.talentIcon.position.set(cx - 30, y);
    this.talentText.position.set(cx - 14, y);

    // Level badge (circle with level number)
    const badgeX = cx + 60;
    this.levelBadge.clear();
    this.levelBadge.circle(badgeX, y, 12);
    this.levelBadge.fill({ color: 0x4dc9f6 });
    this.levelText.position.set(badgeX, y);

    // XP bar
    const xpBarX = badgeX + 18;
    const xpBarY = y - 3;
    this._lastBarX = xpBarX;
    this._lastBarY = xpBarY;
    this.drawXPBar();

    // XP label below bar
    this.xpLabel.position.set(xpBarX + 30, xpBarY + 14);
  }
}
