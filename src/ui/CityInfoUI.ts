import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { COLORS } from '@/utils/Constants';
import type { CityTypeDefinition } from '@/world/CityType';

const TITLE_STYLE = new TextStyle({
  fontFamily: 'Space Mono, monospace',
  fontSize: 11,
  fontWeight: '700',
  fill: COLORS.TEXT_PRIMARY,
  letterSpacing: 2,
});

const DESC_STYLE = new TextStyle({
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 10,
  fill: COLORS.TEXT_DIM,
  wordWrap: true,
  wordWrapWidth: 180,
});

const PANEL_WIDTH = 220;
const PANEL_PADDING = 14;

export class CityInfoUI {
  readonly container: Container;

  constructor(cityType: CityTypeDefinition) {
    this.container = new Container();

    const bg = new Graphics();
    bg.roundRect(0, 0, PANEL_WIDTH, 100, 10);
    bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.9 });
    this.container.addChild(bg);

    const colorDot = new Graphics();
    colorDot.circle(PANEL_PADDING + 5, PANEL_PADDING + 6, 5);
    colorDot.fill(cityType.color);
    this.container.addChild(colorDot);

    const title = new Text({ text: cityType.name.toUpperCase(), style: TITLE_STYLE });
    title.position.set(PANEL_PADDING + 16, PANEL_PADDING);
    this.container.addChild(title);

    const desc = new Text({ text: cityType.description, style: DESC_STYLE });
    desc.position.set(PANEL_PADDING, PANEL_PADDING + 22);
    this.container.addChild(desc);

    const infra: string[] = [];
    if (cityType.hasPort) infra.push('PORT');
    if (cityType.hasRailway) infra.push('RAIL');
    if (cityType.hasAirport) infra.push('AIR');

    if (infra.length > 0) {
      const infraText = new Text({
        text: infra.join(' | '),
        style: new TextStyle({ fontFamily: 'Space Mono, monospace', fontSize: 8, fill: COLORS.ACCENT_VIOLET }),
      });
      infraText.position.set(PANEL_PADDING, 70);
      this.container.addChild(infraText);
    }
  }

  positionAt(screenWidth: number, screenHeight: number): void {
    this.container.position.set(screenWidth - PANEL_WIDTH - 10, 10);
  }
}
