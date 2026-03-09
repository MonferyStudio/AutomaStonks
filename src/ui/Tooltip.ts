import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { COLORS } from '@/utils/Constants';

const TOOLTIP_STYLE = new TextStyle({
  fontFamily: 'Space Mono, monospace',
  fontSize: 10,
  fill: COLORS.TEXT_PRIMARY,
  wordWrap: true,
  wordWrapWidth: 200,
});

const TITLE_STYLE = new TextStyle({
  fontFamily: 'Space Mono, monospace',
  fontSize: 11,
  fontWeight: '700',
  fill: COLORS.TEXT_PRIMARY,
});

export class Tooltip {
  readonly container: Container;
  private bg: Graphics;
  private titleText: Text;
  private bodyText: Text;
  private visible = false;

  constructor() {
    this.container = new Container();
    this.container.zIndex = 200;
    this.container.visible = false;

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    this.titleText = new Text({ text: '', style: TITLE_STYLE });
    this.titleText.position.set(8, 6);
    this.container.addChild(this.titleText);

    this.bodyText = new Text({ text: '', style: TOOLTIP_STYLE });
    this.bodyText.position.set(8, 24);
    this.container.addChild(this.bodyText);
  }

  show(title: string, body: string, x: number, y: number, screenWidth: number, screenHeight: number): void {
    this.titleText.text = title;
    this.bodyText.text = body;

    const width = Math.max(this.titleText.width, this.bodyText.width) + 16;
    const height = this.bodyText.y + this.bodyText.height + 8;

    this.bg.clear();
    this.bg.roundRect(0, 0, width, height, 6);
    this.bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.95 });
    this.bg.stroke({ color: COLORS.TEXT_DIM, width: 1, alpha: 0.3 });

    // Clamp to screen
    let px = x + 12;
    let py = y - height - 4;
    if (px + width > screenWidth) px = screenWidth - width - 4;
    if (py < 0) py = y + 16;
    if (px < 0) px = 4;

    this.container.position.set(px, py);
    this.container.visible = true;
    this.visible = true;
  }

  hide(): void {
    this.container.visible = false;
    this.visible = false;
  }

  get isVisible(): boolean {
    return this.visible;
  }
}
