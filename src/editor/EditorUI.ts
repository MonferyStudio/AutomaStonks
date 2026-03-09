import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { COLORS } from '@/utils/Constants';
import type { EditorMode } from './MapEditor';

const BTN_STYLE = new TextStyle({
  fontFamily: 'Space Mono, monospace',
  fontSize: 9,
  fontWeight: '600',
  fill: COLORS.TEXT_PRIMARY,
});

const TITLE_STYLE = new TextStyle({
  fontFamily: 'Space Mono, monospace',
  fontSize: 11,
  fontWeight: '700',
  fill: COLORS.TEXT_PRIMARY,
  letterSpacing: 2,
});

export class EditorUI {
  readonly container: Container;
  private toolbarContainer: Container;
  private onToolSelect: (tool: string) => void;
  private onModeSwitch: () => void;
  private mode: EditorMode = 'world';

  constructor(
    onToolSelect: (tool: string) => void,
    onModeSwitch: () => void,
  ) {
    this.onToolSelect = onToolSelect;
    this.onModeSwitch = onModeSwitch;
    this.container = new Container();
    this.container.zIndex = 100;

    this.toolbarContainer = new Container();
    this.container.addChild(this.toolbarContainer);

    this.buildToolbar();
  }

  setMode(mode: EditorMode): void {
    this.mode = mode;
    this.buildToolbar();
  }

  private buildToolbar(): void {
    this.toolbarContainer.removeChildren();

    const bg = new Graphics();
    bg.roundRect(0, 0, 200, 300, 10);
    bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.95 });
    this.toolbarContainer.addChild(bg);

    const title = new Text({
      text: `EDITOR: ${this.mode.toUpperCase()}`,
      style: TITLE_STYLE,
    });
    title.position.set(14, 12);
    this.toolbarContainer.addChild(title);

    const switchBtn = this.createButton(
      this.mode === 'world' ? 'CITY MODE' : 'WORLD MODE',
      0,
      40,
      180,
      () => this.onModeSwitch(),
    );
    this.toolbarContainer.addChild(switchBtn);

    const tools = this.mode === 'world'
      ? ['place_city', 'delete_city', 'connect', 'select']
      : ['road', 'delete_road', 'factory_slot', 'shop_slot', 'decoration'];

    let yOffset = 82;
    for (const tool of tools) {
      const btn = this.createButton(
        tool.toUpperCase().replace('_', ' '),
        0,
        yOffset,
        180,
        () => this.onToolSelect(tool),
      );
      this.toolbarContainer.addChild(btn);
      yOffset += 34;
    }

    this.toolbarContainer.position.set(10, 10);
  }

  private createButton(
    label: string,
    x: number,
    y: number,
    width: number,
    onClick: () => void,
  ): Container {
    const btn = new Container();
    btn.position.set(x + 10, y);

    const bg = new Graphics();
    bg.roundRect(0, 0, width, 28, 6);
    bg.fill(COLORS.BG_CARD);
    btn.addChild(bg);

    const text = new Text({ text: label, style: BTN_STYLE });
    text.anchor.set(0.5);
    text.position.set(width / 2, 14);
    btn.addChild(text);

    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointertap', onClick);

    return btn;
  }

  positionAt(screenWidth: number, screenHeight: number): void {
    this.toolbarContainer.position.set(10, 10);
  }
}
