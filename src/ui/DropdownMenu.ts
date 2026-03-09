import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { COLORS } from '@/utils/Constants';

const SEPARATOR_COLOR = 0x2d3548;

export interface DropdownMenuCallbacks {
  onSave: () => void;
  onExportSave: () => void;
  onImportSave: () => void;
  onResetSave: () => void;
}

export class DropdownMenu {
  readonly container: Container;
  private menuButton: Container;
  private panel: Container;
  private panelBg: Graphics;
  private overlay: Graphics;
  private _isOpen = false;
  private callbacks: DropdownMenuCallbacks;

  constructor(callbacks: DropdownMenuCallbacks) {
    this.callbacks = callbacks;
    this.container = new Container();
    this.container.zIndex = 300;

    // Full-screen overlay to catch clicks outside the menu
    this.overlay = new Graphics();
    this.overlay.visible = false;
    this.overlay.eventMode = 'static';
    this.overlay.on('pointertap', () => this.close());
    this.container.addChild(this.overlay);

    // Hamburger button
    this.menuButton = this.createHamburger();
    this.menuButton.position.set(10, 10);
    this.container.addChild(this.menuButton);

    // Dropdown panel
    this.panel = new Container();
    this.panel.visible = false;
    this.panel.position.set(10, 52);

    this.panelBg = new Graphics();
    this.panel.addChild(this.panelBg);

    this.buildMenu();
    this.container.addChild(this.panel);
  }

  private createHamburger(): Container {
    const btn = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, 36, 36, 6);
    bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.95 });
    bg.stroke({ color: COLORS.ACCENT_VIOLET, width: 1, alpha: 0.3 });
    btn.addChild(bg);

    // Three horizontal lines
    const lines = new Graphics();
    for (let i = 0; i < 3; i++) {
      const ly = 11 + i * 7;
      lines.rect(10, ly, 16, 2);
    }
    lines.fill(COLORS.TEXT_PRIMARY);
    btn.addChild(lines);

    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointertap', () => this.toggle());

    btn.on('pointerover', () => {
      bg.clear();
      bg.roundRect(0, 0, 36, 36, 6);
      bg.fill({ color: COLORS.BG_CARD });
      bg.stroke({ color: COLORS.ACCENT_VIOLET, width: 2, alpha: 0.6 });
    });
    btn.on('pointerout', () => {
      bg.clear();
      bg.roundRect(0, 0, 36, 36, 6);
      bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.95 });
      bg.stroke({ color: COLORS.ACCENT_VIOLET, width: 1, alpha: 0.3 });
    });

    return btn;
  }

  private buildMenu(): void {
    // Remove old items (keep bg at index 0)
    while (this.panel.children.length > 1) {
      this.panel.removeChildAt(1);
    }

    const w = 180;
    let y = 8;

    y = this.addItem('Save', y, w, () => {
      this.close();
      this.callbacks.onSave();
    });

    y = this.addItem('Export Save', y, w, () => {
      this.close();
      this.callbacks.onExportSave();
    });

    y = this.addItem('Import Save', y, w, () => {
      this.close();
      this.callbacks.onImportSave();
    });

    y = this.addSeparator(y, w);

    y = this.addItem('Reset Save', y, w, () => {
      this.close();
      this.callbacks.onResetSave();
    }, true);

    y += 4;

    this.panelBg.clear();
    this.panelBg.roundRect(0, 0, w, y, 8);
    this.panelBg.fill({ color: COLORS.BG_SURFACE, alpha: 0.98 });
    this.panelBg.stroke({ color: COLORS.ACCENT_VIOLET, width: 1, alpha: 0.3 });
  }

  private addItem(
    label: string,
    y: number,
    w: number,
    onClick: () => void,
    danger = false,
  ): number {
    const row = new Container();
    const rowBg = new Graphics();
    rowBg.roundRect(4, 0, w - 8, 28, 4);
    rowBg.fill({ color: 0x000000, alpha: 0 }); // transparent hit area
    row.addChild(rowBg);

    const text = new Text({
      text: label,
      style: new TextStyle({
        fontFamily: 'Space Mono, Consolas, monospace',
        fontSize: 11,
        fontWeight: '600',
        fill: danger ? COLORS.ACCENT_RED : COLORS.TEXT_PRIMARY,
      }),
    });
    text.position.set(14, 7);
    row.addChild(text);

    row.position.set(0, y);
    row.eventMode = 'static';
    row.cursor = 'pointer';

    row.on('pointerover', () => {
      rowBg.clear();
      rowBg.roundRect(4, 0, w - 8, 28, 4);
      rowBg.fill({ color: COLORS.BG_CARD, alpha: 0.8 });
    });
    row.on('pointerout', () => {
      rowBg.clear();
      rowBg.roundRect(4, 0, w - 8, 28, 4);
      rowBg.fill({ color: 0x000000, alpha: 0 });
    });
    row.on('pointertap', onClick);

    this.panel.addChild(row);
    return y + 30;
  }

  private addSeparator(y: number, w: number): number {
    const line = new Graphics();
    line.rect(12, y + 2, w - 24, 1);
    line.fill({ color: SEPARATOR_COLOR, alpha: 0.6 });
    this.panel.addChild(line);
    return y + 6;
  }

  toggle(): void {
    this._isOpen ? this.close() : this.open();
  }

  open(): void {
    this._isOpen = true;
    this.panel.visible = true;
    this.overlay.visible = true;
  }

  close(): void {
    this._isOpen = false;
    this.panel.visible = false;
    this.overlay.visible = false;
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  resize(width: number, height: number): void {
    this.overlay.clear();
    this.overlay.rect(0, 0, width, height);
    this.overlay.fill({ color: 0x000000, alpha: 0.01 }); // nearly invisible
  }
}
