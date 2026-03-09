import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { COLORS, FACTORY_CELL_RATIO } from '@/utils/Constants';
import { formatNumber } from '@/utils/formatNumber';
import type { CitySlot } from '@/city/CitySlot';

const CAPACITY_PER_CELL = 1000;

const TITLE_STYLE = new TextStyle({
  fontFamily: 'Space Mono, monospace',
  fontSize: 11,
  fontWeight: '700',
  fill: COLORS.TEXT_PRIMARY,
});

const BODY_STYLE = new TextStyle({
  fontFamily: 'Space Mono, monospace',
  fontSize: 10,
  fill: COLORS.TEXT_PRIMARY,
  wordWrap: true,
  wordWrapWidth: 180,
});

const COST_STYLE = new TextStyle({
  fontFamily: 'Space Mono, monospace',
  fontSize: 11,
  fontWeight: '700',
  fill: COLORS.ACCENT_YELLOW,
});

const BTN_STYLE = new TextStyle({
  fontFamily: 'Space Mono, monospace',
  fontSize: 10,
  fontWeight: '700',
  fill: COLORS.TEXT_PRIMARY,
});

export class PurchaseTooltip {
  readonly container: Container;
  private bg: Graphics;
  private slot: CitySlot | null = null;
  private onConfirm: ((slot: CitySlot) => void) | null = null;
  private confirmHitbox = { x: 0, y: 0, w: 0, h: 0 };
  private cancelHitbox = { x: 0, y: 0, w: 0, h: 0 };

  constructor() {
    this.container = new Container();
    this.container.zIndex = 200;
    this.container.visible = false;
    this.bg = new Graphics();
  }

  show(slot: CitySlot, screenX: number, screenY: number, screenWidth: number, screenHeight: number, onConfirm: (slot: CitySlot) => void): void {
    this.slot = slot;
    this.onConfirm = onConfirm;
    this.container.removeChildren();

    const pad = 10;
    const cellCount = slot.polyomino.cells.length;

    // Build info lines
    const typeLabel = slot.slotType === 'factory' ? 'Factory' : 'Storage';
    const typeColor = slot.slotType === 'factory' ? COLORS.FACTORY : COLORS.STORAGE;

    let infoLines: string[] = [];
    if (slot.slotType === 'factory') {
      const interior = cellCount * FACTORY_CELL_RATIO * FACTORY_CELL_RATIO;
      infoLines.push(`${cellCount} cells`);
      infoLines.push(`${interior} interior tiles`);
    } else {
      const capacity = cellCount * CAPACITY_PER_CELL;
      infoLines.push(`${cellCount} cells`);
      infoLines.push(`Capacity: ${formatNumber(capacity)}`);
    }

    // Title
    const title = new Text({ text: typeLabel, style: new TextStyle({
      fontFamily: 'Space Mono, monospace', fontSize: 12, fontWeight: '700', fill: typeColor,
    }), resolution: 4 });
    title.position.set(pad, pad);

    // Body
    const body = new Text({ text: infoLines.join('\n'), style: BODY_STYLE, resolution: 4 });
    body.position.set(pad, pad + 20);

    // Cost
    const cost = new Text({ text: `Cost: ${formatNumber(slot.cost)}`, style: COST_STYLE, resolution: 4 });
    cost.position.set(pad, body.y + body.height + 6);

    // Buttons
    const btnY = cost.y + cost.height + 10;
    const btnW = 70;
    const btnH = 22;
    const gap = 8;

    // Confirm button
    const confirmBg = new Graphics();
    confirmBg.roundRect(pad, btnY, btnW, btnH, 4);
    confirmBg.fill({ color: typeColor, alpha: 0.8 });
    const confirmText = new Text({ text: 'Buy', style: BTN_STYLE, resolution: 4 });
    confirmText.anchor.set(0.5);
    confirmText.position.set(pad + btnW / 2, btnY + btnH / 2);

    // Cancel button
    const cancelBg = new Graphics();
    cancelBg.roundRect(pad + btnW + gap, btnY, btnW, btnH, 4);
    cancelBg.fill({ color: COLORS.TEXT_DIM, alpha: 0.3 });
    const cancelText = new Text({ text: 'Cancel', style: BTN_STYLE, resolution: 4 });
    cancelText.anchor.set(0.5);
    cancelText.position.set(pad + btnW + gap + btnW / 2, btnY + btnH / 2);

    const totalW = pad * 2 + btnW * 2 + gap;
    const totalH = btnY + btnH + pad;

    // Background
    this.bg = new Graphics();
    this.bg.roundRect(0, 0, totalW, totalH, 8);
    this.bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.95 });
    this.bg.stroke({ color: typeColor, width: 1.5, alpha: 0.4 });

    this.container.addChild(this.bg, title, body, cost, confirmBg, confirmText, cancelBg, cancelText);

    // Position — clamp to screen
    let px = screenX - totalW / 2;
    let py = screenY - totalH - 10;
    if (px + totalW > screenWidth - 4) px = screenWidth - totalW - 4;
    if (px < 4) px = 4;
    if (py < 4) py = screenY + 20;

    this.container.position.set(px, py);
    this.container.visible = true;

    // Store hitboxes in screen space
    this.confirmHitbox = { x: px + pad, y: py + btnY, w: btnW, h: btnH };
    this.cancelHitbox = { x: px + pad + btnW + gap, y: py + btnY, w: btnW, h: btnH };
  }

  hide(): void {
    this.container.visible = false;
    this.slot = null;
    this.onConfirm = null;
  }

  get isVisible(): boolean {
    return this.container.visible;
  }

  /** Returns true if the click was consumed by the tooltip */
  handleClick(screenX: number, screenY: number): boolean {
    if (!this.container.visible || !this.slot) return false;

    // Check confirm button
    const ch = this.confirmHitbox;
    if (screenX >= ch.x && screenX <= ch.x + ch.w && screenY >= ch.y && screenY <= ch.y + ch.h) {
      this.onConfirm?.(this.slot);
      this.hide();
      return true;
    }

    // Check cancel button
    const ca = this.cancelHitbox;
    if (screenX >= ca.x && screenX <= ca.x + ca.w && screenY >= ca.y && screenY <= ca.y + ca.h) {
      this.hide();
      return true;
    }

    // Click outside — dismiss
    this.hide();
    return true;
  }
}
