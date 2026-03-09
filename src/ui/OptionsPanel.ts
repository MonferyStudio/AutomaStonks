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

const SECTION_STYLE = new TextStyle({
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

const VALUE_STYLE = new TextStyle({
  fontFamily: 'Space Mono, Consolas, monospace',
  fontSize: 10,
  fontWeight: '600',
  fill: COLORS.TEXT_PRIMARY,
});

const BTN_STYLE = new TextStyle({
  fontFamily: 'Space Mono, Consolas, monospace',
  fontSize: 10,
  fontWeight: '600',
  fill: COLORS.TEXT_PRIMARY,
});

const KEY_STYLE = new TextStyle({
  fontFamily: 'Space Mono, Consolas, monospace',
  fontSize: 9,
  fontWeight: '700',
  fill: COLORS.TEXT_PRIMARY,
});

const WAITING_STYLE = new TextStyle({
  fontFamily: 'Space Mono, Consolas, monospace',
  fontSize: 9,
  fontWeight: '700',
  fill: COLORS.ACCENT_YELLOW,
});

export interface GameSettings {
  musicVolume: number;
  sfxVolume: number;
  autoSave: boolean;
  showTutorial: boolean;
}

const DEFAULT_SETTINGS: GameSettings = {
  musicVolume: 70,
  sfxVolume: 80,
  autoSave: true,
  showTutorial: true,
};

export class OptionsPanel {
  readonly container: Container;
  private bg: Graphics;
  private visible = false;
  private settings: GameSettings;
  private onClose: () => void;
  private keyBindings: KeyBindings;
  private waitingForKey: string | null = null;
  private keyListener: ((e: KeyboardEvent) => void) | null = null;

  constructor(onClose: () => void, keyBindings: KeyBindings) {
    this.onClose = onClose;
    this.keyBindings = keyBindings;
    this.container = new Container();
    this.container.zIndex = 190;
    this.container.visible = false;

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    const saved = localStorage.getItem('automastonks_settings');
    this.settings = saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : { ...DEFAULT_SETTINGS };

    this.build();
  }

  private build(): void {
    while (this.container.children.length > 1) {
      this.container.removeChildAt(1);
    }

    const panelW = 340;
    let y = 16;

    const title = new Text({ text: 'OPTIONS', style: TITLE_STYLE });
    title.position.set(panelW / 2 - title.width / 2, y);
    this.container.addChild(title);
    y += 36;

    // --- Settings Section ---
    const settingsLabel = new Text({ text: 'SETTINGS', style: SECTION_STYLE });
    settingsLabel.position.set(16, y);
    this.container.addChild(settingsLabel);
    y += 22;

    y = this.addSlider('Music Volume', this.settings.musicVolume, y, panelW, (v) => {
      this.settings.musicVolume = v;
      this.saveSettings();
    });

    y = this.addSlider('SFX Volume', this.settings.sfxVolume, y, panelW, (v) => {
      this.settings.sfxVolume = v;
      this.saveSettings();
    });

    y = this.addToggle('Auto Save', this.settings.autoSave, y, panelW, (v) => {
      this.settings.autoSave = v;
      this.saveSettings();
      this.build();
    });

    y = this.addToggle('Show Tutorial', this.settings.showTutorial, y, panelW, (v) => {
      this.settings.showTutorial = v;
      this.saveSettings();
      this.build();
    });

    y += 8;

    // --- Key Bindings Section ---
    const keysLabel = new Text({ text: 'KEY BINDINGS', style: SECTION_STYLE });
    keysLabel.position.set(16, y);
    this.container.addChild(keysLabel);
    y += 22;

    const allBindings = this.keyBindings.getAll();
    for (const action of allBindings) {
      const lbl = new Text({ text: action.label, style: LABEL_STYLE });
      lbl.position.set(24, y);
      this.container.addChild(lbl);

      const isWaiting = this.waitingForKey === action.id;
      const keyBtn = this.createKeyButton(
        isWaiting ? '...' : KeyBindings.formatKey(action.key),
        isWaiting,
        () => this.startRebind(action.id),
      );
      keyBtn.position.set(panelW - 70, y - 3);
      this.container.addChild(keyBtn);

      y += 24;
    }

    y += 8;

    // Reset defaults button
    const resetBtn = this.createActionButton('RESET DEFAULTS', () => {
      this.keyBindings.resetDefaults();
      this.waitingForKey = null;
      this.build();
    });
    resetBtn.position.set(16, y);
    this.container.addChild(resetBtn);

    // Close button
    const closeBtn = this.createActionButton('CLOSE', () => this.hide());
    closeBtn.position.set(panelW - 126, y);
    this.container.addChild(closeBtn);
    y += 40;

    const panelH = y;

    this.bg.clear();
    this.bg.roundRect(0, 0, panelW, panelH, 12);
    this.bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.98 });
    this.bg.stroke({ color: COLORS.ACCENT_VIOLET, width: 1, alpha: 0.3 });
  }

  private addSlider(label: string, value: number, y: number, panelW: number, onChange: (v: number) => void): number {
    const lbl = new Text({ text: label, style: LABEL_STYLE });
    lbl.position.set(24, y);
    this.container.addChild(lbl);

    const val = new Text({ text: `${value}%`, style: VALUE_STYLE });
    val.position.set(panelW - 60, y);
    this.container.addChild(val);

    const minus = this.createSmallBtn('-', () => {
      onChange(Math.max(0, value - 10));
      this.build();
    });
    minus.position.set(panelW - 100, y - 2);
    this.container.addChild(minus);

    const plus = this.createSmallBtn('+', () => {
      onChange(Math.min(100, value + 10));
      this.build();
    });
    plus.position.set(panelW - 36, y - 2);
    this.container.addChild(plus);

    return y + 34;
  }

  private addToggle(label: string, value: boolean, y: number, panelW: number, onChange: (v: boolean) => void): number {
    const lbl = new Text({ text: label, style: LABEL_STYLE });
    lbl.position.set(24, y);
    this.container.addChild(lbl);

    const toggleBtn = new Container();
    const tBg = new Graphics();
    tBg.roundRect(0, 0, 50, 22, 4);
    tBg.fill({ color: value ? COLORS.ACCENT_VIOLET : COLORS.BG_CARD });
    toggleBtn.addChild(tBg);

    const tText = new Text({ text: value ? 'ON' : 'OFF', style: BTN_STYLE });
    tText.anchor.set(0.5);
    tText.position.set(25, 11);
    toggleBtn.addChild(tText);

    toggleBtn.position.set(panelW - 70, y - 2);
    toggleBtn.eventMode = 'static';
    toggleBtn.cursor = 'pointer';
    toggleBtn.on('pointertap', () => onChange(!value));
    this.container.addChild(toggleBtn);

    return y + 34;
  }

  private createSmallBtn(label: string, onClick: () => void): Container {
    const c = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, 22, 22, 4);
    bg.fill(COLORS.BG_CARD);
    c.addChild(bg);
    const t = new Text({ text: label, style: BTN_STYLE });
    t.anchor.set(0.5);
    t.position.set(11, 11);
    c.addChild(t);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.on('pointertap', onClick);
    return c;
  }

  private createKeyButton(label: string, isWaiting: boolean, onClick: () => void): Container {
    const c = new Container();
    const w = 52;
    const bg = new Graphics();
    bg.roundRect(0, 0, w, 22, 4);
    bg.fill({ color: isWaiting ? COLORS.BG_PRIMARY : COLORS.BG_CARD });
    bg.stroke({ color: isWaiting ? COLORS.ACCENT_YELLOW : COLORS.TEXT_DIM, width: 1, alpha: isWaiting ? 0.8 : 0.3 });
    c.addChild(bg);

    const t = new Text({ text: label, style: isWaiting ? WAITING_STYLE : KEY_STYLE });
    t.anchor.set(0.5);
    t.position.set(w / 2, 11);
    c.addChild(t);

    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.on('pointertap', onClick);
    return c;
  }

  private createActionButton(label: string, onClick: () => void): Container {
    const c = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, 110, 28, 6);
    bg.fill(COLORS.BG_CARD);
    c.addChild(bg);
    const t = new Text({ text: label, style: BTN_STYLE });
    t.anchor.set(0.5);
    t.position.set(55, 14);
    c.addChild(t);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.on('pointertap', onClick);
    return c;
  }

  private startRebind(actionId: string): void {
    this.waitingForKey = actionId;
    this.build();

    if (this.keyListener) {
      window.removeEventListener('keydown', this.keyListener, true);
    }

    this.keyListener = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      this.keyBindings.rebind(actionId, e.key);
      this.waitingForKey = null;

      if (this.keyListener) {
        window.removeEventListener('keydown', this.keyListener, true);
        this.keyListener = null;
      }

      this.build();
    };

    window.addEventListener('keydown', this.keyListener, true);
  }

  private saveSettings(): void {
    localStorage.setItem('automastonks_settings', JSON.stringify(this.settings));
  }

  getSettings(): GameSettings {
    return { ...this.settings };
  }

  get isRebinding(): boolean {
    return this.waitingForKey !== null;
  }

  toggle(): void {
    this.visible ? this.hide() : this.show();
  }

  show(): void {
    this.visible = true;
    this.container.visible = true;
  }

  hide(): void {
    this.visible = false;
    this.container.visible = false;
    this.waitingForKey = null;
    if (this.keyListener) {
      window.removeEventListener('keydown', this.keyListener, true);
      this.keyListener = null;
    }
    this.onClose();
  }

  positionAt(width: number, height: number): void {
    this.container.position.set(width / 2 - 170, Math.max(10, height / 2 - 300));
  }
}
