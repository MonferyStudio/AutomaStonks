import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { COLORS } from '@/utils/Constants';
import { formatNumber } from '@/utils/formatNumber';
import type { Wallet } from '@/economy/Wallet';
import { eventBus } from '@/core/EventBus';

const VALUE_STYLE = new TextStyle({
  fontFamily: 'Space Mono, monospace',
  fontSize: 14,
  fontWeight: '700',
  fill: COLORS.TEXT_PRIMARY,
});

export class HUD {
  readonly container: Container;
  private bg: Graphics;
  private coinsText: Text;
  private talentText: Text;
  private wallet: Wallet;
  private coinIcon: Graphics;
  private talentIcon: Graphics;

  constructor(wallet: Wallet) {
    this.wallet = wallet;
    this.container = new Container();

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    this.coinIcon = new Graphics();
    this.coinIcon.circle(0, 0, 8);
    this.coinIcon.fill(COLORS.ACCENT_YELLOW);
    this.container.addChild(this.coinIcon);

    this.coinsText = new Text({ text: formatNumber(wallet.coins), style: VALUE_STYLE });
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

    eventBus.on('MoneyChanged', () => this.updateText());
  }

  private updateText(): void {
    this.coinsText.text = formatNumber(this.wallet.coins);
    this.talentText.text = formatNumber(this.wallet.talent);
  }

  positionAt(screenWidth: number): void {
    const barW = 220;
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
    this.talentIcon.position.set(cx + 10, y);
    this.talentText.position.set(cx + 26, y);
  }
}
