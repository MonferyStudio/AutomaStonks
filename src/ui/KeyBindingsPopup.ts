import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { COLORS } from '@/utils/Constants';
import { KeyBindings, type KeyAction } from '@/core/KeyBindings';

const TITLE_STYLE = new TextStyle({
  fontFamily: 'Space Mono, Consolas, monospace',
  fontSize: 14,
  fontWeight: '700',
  fill: COLORS.TEXT_PRIMARY,
  letterSpacing: 2,
});

const CATEGORY_STYLE = new TextStyle({
  fontFamily: 'Space Mono, Consolas, monospace',
  fontSize: 10,
  fontWeight: '700',
  fill: COLORS.ACCENT_VIOLET,
  letterSpacing: 1,
});

const LABEL_STYLE = new TextStyle({
  fontFamily: 'Space Mono, Consolas, monospace',
  fontSize: 10,
  fill: COLORS.TEXT_DIM,
});

const KEY_STYLE = new TextStyle({
  fontFamily: 'Space Mono, Consolas, monospace',
  fontSize: 10,
  fontWeight: '700',
  fill: COLORS.TEXT_PRIMARY,
});

const HINT_STYLE = new TextStyle({
  fontFamily: 'Space Mono, Consolas, monospace',
  fontSize: 9,
  fill: COLORS.TEXT_DIM,
});

export class KeyBindingsPopup {
  readonly container: Container;
  private bg: Graphics;
  private keyBindings: KeyBindings;
  private visible = false;

  constructor(keyBindings: KeyBindings) {
    this.keyBindings = keyBindings;
    this.container = new Container();
    this.container.zIndex = 180;
    this.container.visible = false;

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    this.build();
  }

  private build(): void {
    while (this.container.children.length > 1) {
      this.container.removeChildAt(1);
    }

    const panelW = 320;
    let y = 16;

    const title = new Text({ text: 'CONTROLS', style: TITLE_STYLE });
    title.position.set(panelW / 2 - title.width / 2, y);
    this.container.addChild(title);
    y += 32;

    const categories: { label: string; cat: KeyAction['category'] }[] = [
      { label: 'GENERAL', cat: 'general' },
      { label: 'PANELS', cat: 'panels' },
      { label: 'FACTORY', cat: 'factory' },
    ];

    for (const { label, cat } of categories) {
      const catText = new Text({ text: label, style: CATEGORY_STYLE });
      catText.position.set(16, y);
      this.container.addChild(catText);
      y += 20;

      const actions = this.keyBindings.getByCategory(cat);
      for (const action of actions) {
        const lbl = new Text({ text: action.label, style: LABEL_STYLE });
        lbl.position.set(24, y);
        this.container.addChild(lbl);

        // Key badge
        const keyStr = KeyBindings.formatKey(action.key);
        const keyBadge = this.createKeyBadge(keyStr);
        keyBadge.position.set(panelW - 60, y - 2);
        this.container.addChild(keyBadge);

        y += 22;
      }
      y += 8;
    }

    // Navigation hint
    const hint = new Text({ text: 'Mouse: LMB click | MMB/RMB drag | Scroll zoom', style: HINT_STYLE });
    hint.position.set(16, y);
    this.container.addChild(hint);
    y += 16;

    const hint2 = new Text({ text: 'Press F1 or click to close', style: HINT_STYLE });
    hint2.position.set(16, y);
    this.container.addChild(hint2);
    y += 24;

    const panelH = y;

    this.bg.clear();
    this.bg.roundRect(0, 0, panelW, panelH, 12);
    this.bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.97 });
    this.bg.stroke({ color: COLORS.ACCENT_VIOLET, width: 1, alpha: 0.3 });

    // Click to close
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';
    this.container.removeAllListeners();
    this.container.on('pointertap', () => this.hide());
  }

  private createKeyBadge(key: string): Container {
    const c = new Container();
    const bg = new Graphics();
    const w = Math.max(30, key.length * 9 + 10);
    bg.roundRect(0, 0, w, 20, 4);
    bg.fill({ color: COLORS.BG_CARD });
    bg.stroke({ color: COLORS.TEXT_DIM, width: 1, alpha: 0.3 });
    c.addChild(bg);

    const t = new Text({ text: key, style: KEY_STYLE });
    t.anchor.set(0.5);
    t.position.set(w / 2, 10);
    c.addChild(t);

    return c;
  }

  toggle(): void {
    this.visible ? this.hide() : this.show();
  }

  show(): void {
    this.build();
    this.visible = true;
    this.container.visible = true;
  }

  hide(): void {
    this.visible = false;
    this.container.visible = false;
  }

  get isVisible(): boolean {
    return this.visible;
  }

  positionAt(width: number, height: number): void {
    this.container.position.set(width / 2 - 160, height / 2 - 200);
  }
}
