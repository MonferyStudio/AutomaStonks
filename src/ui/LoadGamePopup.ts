import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { COLORS } from '@/utils/Constants';
import type { SaveSlotInfo } from '@/core/SaveManager';

const TITLE_STYLE = new TextStyle({
  fontFamily: 'Space Mono, Consolas, monospace',
  fontSize: 14,
  fontWeight: '700',
  fill: COLORS.TEXT_PRIMARY,
  letterSpacing: 2,
});

const SLOT_NAME_STYLE = new TextStyle({
  fontFamily: 'Space Mono, Consolas, monospace',
  fontSize: 11,
  fontWeight: '600',
  fill: COLORS.TEXT_PRIMARY,
});

const SLOT_DATE_STYLE = new TextStyle({
  fontFamily: 'Space Mono, Consolas, monospace',
  fontSize: 9,
  fill: COLORS.TEXT_DIM,
});

const BTN_STYLE = new TextStyle({
  fontFamily: 'Space Mono, Consolas, monospace',
  fontSize: 10,
  fontWeight: '600',
  fill: COLORS.TEXT_PRIMARY,
});

const EMPTY_STYLE = new TextStyle({
  fontFamily: 'Space Mono, Consolas, monospace',
  fontSize: 11,
  fill: COLORS.TEXT_DIM,
});

export class LoadGamePopup {
  readonly container: Container;
  private bg: Graphics;
  private visible = false;
  private onLoad: (slotId: string) => void;
  private onDelete: (slotId: string) => void;
  private onClose: () => void;

  constructor(
    onLoad: (slotId: string) => void,
    onDelete: (slotId: string) => void,
    onClose: () => void,
  ) {
    this.onLoad = onLoad;
    this.onDelete = onDelete;
    this.onClose = onClose;
    this.container = new Container();
    this.container.zIndex = 210;
    this.container.visible = false;

    this.bg = new Graphics();
    this.container.addChild(this.bg);
  }

  showWithSlots(slots: readonly SaveSlotInfo[]): void {
    // Clear previous content
    while (this.container.children.length > 1) {
      this.container.removeChildAt(1);
    }

    const panelW = 360;
    let y = 16;

    const title = new Text({ text: 'LOAD GAME', style: TITLE_STYLE });
    title.position.set(panelW / 2 - title.width / 2, y);
    this.container.addChild(title);
    y += 38;

    if (slots.length === 0) {
      const empty = new Text({ text: 'No saves found.', style: EMPTY_STYLE });
      empty.position.set(panelW / 2 - empty.width / 2, y);
      this.container.addChild(empty);
      y += 40;
    } else {
      // Sort by most recent first
      const sorted = [...slots].sort((a, b) => b.timestamp - a.timestamp);

      for (const slot of sorted) {
        y = this.addSlotRow(slot, y, panelW);
      }
    }

    y += 8;

    // Close button
    const closeBtn = this.createButton('CLOSE', panelW / 2 - 55, y, 110, () => this.hide());
    this.container.addChild(closeBtn);
    y += 40;

    const panelH = y;

    this.bg.clear();
    this.bg.roundRect(0, 0, panelW, panelH, 12);
    this.bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.98 });
    this.bg.stroke({ color: COLORS.ACCENT_VIOLET, width: 1, alpha: 0.3 });

    this.visible = true;
    this.container.visible = true;
  }

  private addSlotRow(slot: SaveSlotInfo, y: number, panelW: number): number {
    // Slot background
    const rowBg = new Graphics();
    rowBg.roundRect(12, y, panelW - 24, 48, 6);
    rowBg.fill({ color: COLORS.BG_CARD, alpha: 0.8 });
    this.container.addChild(rowBg);

    const name = new Text({ text: slot.name, style: SLOT_NAME_STYLE });
    name.position.set(20, y + 6);
    this.container.addChild(name);

    const date = new Date(slot.timestamp);
    const dateStr = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const dateText = new Text({ text: dateStr, style: SLOT_DATE_STYLE });
    dateText.position.set(20, y + 28);
    this.container.addChild(dateText);

    // Load button
    const loadBtn = this.createButton('LOAD', panelW - 130, y + 10, 50, () => {
      this.hide();
      this.onLoad(slot.slotId);
    });
    this.container.addChild(loadBtn);

    // Delete button
    const delBtn = this.createButton('DEL', panelW - 60, y + 10, 40, () => {
      this.onDelete(slot.slotId);
      // Re-render will be triggered from outside
    });
    const delBg = delBtn.getChildAt(0) as Graphics;
    delBg.clear();
    delBg.roundRect(0, 0, 40, 28, 4);
    delBg.fill({ color: COLORS.ACCENT_RED, alpha: 0.3 });
    this.container.addChild(delBtn);

    return y + 58;
  }

  private createButton(label: string, x: number, y: number, w: number, onClick: () => void): Container {
    const c = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, w, 28, 4);
    bg.fill(COLORS.BG_CARD);
    c.addChild(bg);
    const t = new Text({ text: label, style: BTN_STYLE });
    t.anchor.set(0.5);
    t.position.set(w / 2, 14);
    c.addChild(t);
    c.position.set(x, y);
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.on('pointertap', onClick);
    return c;
  }

  hide(): void {
    this.visible = false;
    this.container.visible = false;
    this.onClose();
  }

  get isVisible(): boolean {
    return this.visible;
  }

  positionAt(width: number, height: number): void {
    this.container.position.set(width / 2 - 180, Math.max(20, height / 2 - 200));
  }
}
