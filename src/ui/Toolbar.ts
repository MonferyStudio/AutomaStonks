import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { COLORS } from '@/utils/Constants';
import type { PlacementTool } from '@/factory/PlacementSystem';

const BTN_SIZE = 44;
const BTN_GAP = 6;
const PANEL_PAD = 8;
const ICON_AREA_Y = 6;
const ICON_AREA_H = 22;
const LABEL_Y = 30;

const LABEL_STYLE = new TextStyle({
  fontFamily: 'Space Mono, monospace',
  fontSize: 7,
  fontWeight: '600',
  fill: COLORS.TEXT_DIM,
});

const LABEL_ACTIVE_STYLE = new TextStyle({
  fontFamily: 'Space Mono, monospace',
  fontSize: 7,
  fontWeight: '600',
  fill: COLORS.TEXT_PRIMARY,
});

interface ToolDef {
  tool: PlacementTool;
  label: string;
  group: 'transport' | 'io';
  drawIcon: (g: Graphics, cx: number, cy: number, active: boolean) => void;
}

export class Toolbar {
  readonly container: Container;
  private buttons = new Map<PlacementTool, Container>();
  private deleteBtn: Container;
  private selectBtn: Container;
  private resetBtn: Container;
  private rotateBtn: Container;
  private actionPanel: Container;
  private copyBtn: Container;
  private pasteBtn: Container;
  private selectedTool: PlacementTool = 'none';
  private onSelect: (tool: PlacementTool) => void;
  private toolBar: Container;
  onCopy: (() => void) | null = null;
  onPaste: (() => void) | null = null;
  onReset: (() => void) | null = null;
  onRotate: (() => void) | null = null;

  constructor(onSelect: (tool: PlacementTool) => void) {
    this.onSelect = onSelect;
    this.container = new Container();

    this.toolBar = new Container();
    this.container.addChild(this.toolBar);

    const tools: ToolDef[] = [
      { tool: 'belt', label: 'Belt', group: 'transport', drawIcon: this.drawBeltIcon },
      { tool: 'tunnel', label: 'Tunnel', group: 'transport', drawIcon: this.drawTunnelIcon },
      { tool: 'splitter', label: 'Splitter', group: 'transport', drawIcon: this.drawSplitterIcon },
      { tool: 'entry', label: 'Entry', group: 'io', drawIcon: this.drawEntryIcon },
      { tool: 'exit', label: 'Exit', group: 'io', drawIcon: this.drawExitIcon },
    ];

    // Panel background (drawn first, resized in positionAt)
    const panel = new Graphics();
    panel.name = 'panel';
    this.toolBar.addChild(panel);

    // Divider tracking: insert divider when group changes
    let prevGroup: string | null = null;
    let xOffset = PANEL_PAD;

    for (const def of tools) {
      if (prevGroup !== null && def.group !== prevGroup) {
        // Add divider
        const divider = new Graphics();
        divider.name = 'divider';
        divider.moveTo(xOffset + 1, 10);
        divider.lineTo(xOffset + 1, BTN_SIZE + PANEL_PAD * 2 - 10);
        divider.stroke({ color: COLORS.TEXT_DIM, alpha: 0.2, width: 1 });
        this.toolBar.addChild(divider);
        xOffset += BTN_GAP;
      }

      const btn = this.createToolButton(def);
      btn.position.set(xOffset, PANEL_PAD);
      this.toolBar.addChild(btn);
      this.buttons.set(def.tool, btn);
      xOffset += BTN_SIZE + BTN_GAP;
      prevGroup = def.group;
    }

    // Bottom-right action panel: Delete + Select
    this.actionPanel = new Container();
    this.container.addChild(this.actionPanel);

    this.deleteBtn = this.createActionButton('delete', COLORS.ACCENT_RED, this.drawDeleteIcon);
    this.selectBtn = this.createActionButton('select', COLORS.ACCENT_VIOLET, this.drawSelectIcon);
    this.rotateBtn = this.createRotateButton();
    this.resetBtn = this.createResetButton();
    this.deleteBtn.position.set(0, 0);
    this.selectBtn.position.set(BTN_SIZE + BTN_GAP, 0);
    this.rotateBtn.position.set((BTN_SIZE + BTN_GAP) * 2, 0);
    this.resetBtn.position.set((BTN_SIZE + BTN_GAP) * 3, 0);
    this.actionPanel.addChild(this.deleteBtn, this.selectBtn, this.rotateBtn, this.resetBtn);

    // Copy/Paste buttons (hidden by default, shown when selection exists)
    this.copyBtn = this.createSmallActionButton('Copy', 0x4dc9f6, this.drawCopyIcon, () => this.onCopy?.());
    this.pasteBtn = this.createSmallActionButton('Paste', 0x53d769, this.drawPasteIcon, () => this.onPaste?.());
    this.copyBtn.visible = false;
    this.pasteBtn.visible = false;
    this.container.addChild(this.copyBtn, this.pasteBtn);
  }

  private createToolButton(def: ToolDef): Container {
    const btn = new Container();
    btn.name = def.tool;

    const bg = new Graphics();
    bg.name = 'bg';
    bg.roundRect(0, 0, BTN_SIZE, BTN_SIZE, 6);
    bg.fill(COLORS.BG_CARD);
    btn.addChild(bg);

    const icon = new Graphics();
    icon.name = 'icon';
    const cx = BTN_SIZE / 2;
    const cy = ICON_AREA_Y + ICON_AREA_H / 2;
    def.drawIcon(icon, cx, cy, false);
    btn.addChild(icon);

    const label = new Text({ text: def.label, style: LABEL_STYLE, resolution: 4 });
    label.name = 'label';
    label.anchor.set(0.5, 0);
    label.position.set(BTN_SIZE / 2, LABEL_Y);
    btn.addChild(label);

    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointertap', () => {
      const newTool = this.selectedTool === def.tool ? 'none' : def.tool;
      this.selectTool(newTool);
      this.onSelect(newTool);
    });

    return btn;
  }

  private drawBeltIcon = (g: Graphics, cx: number, cy: number, active: boolean): void => {
    const alpha = active ? 0.9 : 0.5;
    const color = active ? COLORS.TEXT_PRIMARY : 0xffffff;
    // Two parallel rails
    g.rect(cx - 12, cy - 5, 24, 2);
    g.rect(cx - 12, cy + 3, 24, 2);
    g.fill({ color, alpha: alpha * 0.6 });
    // Arrow
    g.moveTo(cx + 4, cy - 3);
    g.lineTo(cx + 10, cy);
    g.lineTo(cx + 4, cy + 3);
    g.closePath();
    g.fill({ color, alpha });
  };

  private drawTunnelIcon = (g: Graphics, cx: number, cy: number, active: boolean): void => {
    const alpha = active ? 0.9 : 0.5;
    const color = active ? COLORS.TEXT_PRIMARY : 0xffffff;
    // Left opening
    g.roundRect(cx - 12, cy - 5, 5, 10, 1);
    g.fill({ color, alpha });
    // Right opening
    g.roundRect(cx + 7, cy - 5, 5, 10, 1);
    g.fill({ color, alpha });
    // Dashed underground line
    g.rect(cx - 5, cy - 1, 4, 2);
    g.rect(cx + 1, cy - 1, 4, 2);
    g.fill({ color, alpha: alpha * 0.4 });
  };

  private drawSplitterIcon = (g: Graphics, cx: number, cy: number, active: boolean): void => {
    const alpha = active ? 0.9 : 0.5;
    const color = active ? COLORS.TEXT_PRIMARY : 0xffffff;
    // Two parallel lanes (1x2 perpendicular to flow)
    g.roundRect(cx - 10, cy - 8, 20, 6, 2);
    g.roundRect(cx - 10, cy + 2, 20, 6, 2);
    g.fill({ color, alpha: alpha * 0.35 });
    g.roundRect(cx - 10, cy - 8, 20, 6, 2);
    g.roundRect(cx - 10, cy + 2, 20, 6, 2);
    g.stroke({ color, alpha: alpha * 0.7, width: 1 });
    // Two arrows (one per lane)
    const a = 3;
    g.moveTo(cx + 3, cy - 5 - a);
    g.lineTo(cx + 3 + a + 1, cy - 5);
    g.lineTo(cx + 3, cy - 5 + a);
    g.closePath();
    g.fill({ color, alpha });
    g.moveTo(cx + 3, cy + 5 - a);
    g.lineTo(cx + 3 + a + 1, cy + 5);
    g.lineTo(cx + 3, cy + 5 + a);
    g.closePath();
    g.fill({ color, alpha });
  };

  private drawEntryIcon = (g: Graphics, cx: number, cy: number, active: boolean): void => {
    const alpha = active ? 0.9 : 0.6;
    const color = COLORS.IO_INPUT;
    // Arrow pointing inward
    g.moveTo(cx + 5, cy - 5);
    g.lineTo(cx - 5, cy);
    g.lineTo(cx + 5, cy + 5);
    g.closePath();
    g.fill({ color, alpha });
    // Wall line
    g.moveTo(cx + 9, cy - 7);
    g.lineTo(cx + 9, cy + 7);
    g.stroke({ color, alpha: alpha * 0.5, width: 2 });
  };

  private drawExitIcon = (g: Graphics, cx: number, cy: number, active: boolean): void => {
    const alpha = active ? 0.9 : 0.6;
    const color = COLORS.IO_OUTPUT;
    // Arrow pointing outward
    g.moveTo(cx - 5, cy - 5);
    g.lineTo(cx + 5, cy);
    g.lineTo(cx - 5, cy + 5);
    g.closePath();
    g.fill({ color, alpha });
    // Wall line
    g.moveTo(cx - 9, cy - 7);
    g.lineTo(cx - 9, cy + 7);
    g.stroke({ color, alpha: alpha * 0.5, width: 2 });
  };

  private createActionButton(tool: PlacementTool, accentColor: number, drawIcon: (g: Graphics, cx: number, cy: number) => void): Container {
    const size = BTN_SIZE;
    const btn = new Container();
    btn.name = tool;

    const bg = new Graphics();
    bg.name = 'bg';
    bg.roundRect(0, 0, size, size, 8);
    bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.92 });
    btn.addChild(bg);

    const inner = new Graphics();
    inner.name = 'inner';
    inner.roundRect(3, 3, size - 6, size - 6, 6);
    inner.fill(COLORS.BG_CARD);
    btn.addChild(inner);

    const icon = new Graphics();
    icon.name = 'icon';
    drawIcon(icon, size / 2, size / 2);
    btn.addChild(icon);

    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointertap', () => {
      const newTool = this.selectedTool === tool ? 'none' : tool;
      this.selectTool(newTool);
      this.onSelect(newTool);
    });

    // Store accent color for active state
    (btn as any)._accentColor = accentColor;

    return btn;
  }

  private drawDeleteIcon = (g: Graphics, cx: number, cy: number): void => {
    // X cross
    const s = 8;
    g.moveTo(cx - s, cy - s);
    g.lineTo(cx + s, cy + s);
    g.moveTo(cx + s, cy - s);
    g.lineTo(cx - s, cy + s);
    g.stroke({ color: COLORS.ACCENT_RED, width: 3, alpha: 0.8 });
  };

  private drawSelectIcon = (g: Graphics, cx: number, cy: number): void => {
    // Dashed selection rectangle
    const s = 9;
    const d = 5; // dash length
    // Top
    g.moveTo(cx - s, cy - s); g.lineTo(cx - s + d, cy - s);
    g.moveTo(cx + s - d, cy - s); g.lineTo(cx + s, cy - s);
    // Right
    g.moveTo(cx + s, cy - s); g.lineTo(cx + s, cy - s + d);
    g.moveTo(cx + s, cy + s - d); g.lineTo(cx + s, cy + s);
    // Bottom
    g.moveTo(cx + s, cy + s); g.lineTo(cx + s - d, cy + s);
    g.moveTo(cx - s + d, cy + s); g.lineTo(cx - s, cy + s);
    // Left
    g.moveTo(cx - s, cy + s); g.lineTo(cx - s, cy + s - d);
    g.moveTo(cx - s, cy - s + d); g.lineTo(cx - s, cy - s);
    g.stroke({ color: COLORS.ACCENT_VIOLET, width: 2, alpha: 0.8 });
  };

  private createSmallActionButton(label: string, color: number, drawIcon: (g: Graphics, cx: number, cy: number) => void, onClick: () => void): Container {
    const w = 36;
    const h = 36;
    const btn = new Container();

    const bg = new Graphics();
    bg.name = 'bg';
    bg.roundRect(0, 0, w, h, 6);
    bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.92 });
    bg.roundRect(2, 2, w - 4, h - 4, 5);
    bg.fill(COLORS.BG_CARD);
    btn.addChild(bg);

    const icon = new Graphics();
    drawIcon(icon, w / 2, h / 2 - 2);
    btn.addChild(icon);

    const text = new Text({ text: label, style: new TextStyle({
      fontFamily: 'Space Mono, monospace', fontSize: 6, fontWeight: '600', fill: color,
    }), resolution: 4 });
    text.anchor.set(0.5, 0);
    text.position.set(w / 2, h / 2 + 7);
    btn.addChild(text);

    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointertap', onClick);

    return btn;
  }

  private createResetButton(): Container {
    const size = BTN_SIZE;
    const btn = new Container();
    btn.name = 'reset';

    const bg = new Graphics();
    bg.name = 'bg';
    bg.roundRect(0, 0, size, size, 8);
    bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.92 });
    btn.addChild(bg);

    const inner = new Graphics();
    inner.name = 'inner';
    inner.roundRect(3, 3, size - 6, size - 6, 6);
    inner.fill(COLORS.BG_CARD);
    btn.addChild(inner);

    const icon = new Graphics();
    // Hand/pointer cursor icon — simple arrow
    const c = size / 2;
    icon.moveTo(c - 4, c - 8);
    icon.lineTo(c - 4, c + 4);
    icon.lineTo(c - 1, c + 1);
    icon.lineTo(c + 2, c + 6);
    icon.lineTo(c + 5, c + 5);
    icon.lineTo(c + 2, c);
    icon.lineTo(c + 5, c);
    icon.lineTo(c - 4, c - 8);
    icon.closePath();
    icon.fill({ color: COLORS.TEXT_DIM, alpha: 0.7 });
    btn.addChild(icon);

    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointertap', () => {
      this.selectTool('none');
      this.onSelect('none');
      this.onReset?.();
    });

    return btn;
  }

  private createRotateButton(): Container {
    const size = BTN_SIZE;
    const btn = new Container();
    btn.name = 'rotate';

    const bg = new Graphics();
    bg.name = 'bg';
    bg.roundRect(0, 0, size, size, 8);
    bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.92 });
    btn.addChild(bg);

    const inner = new Graphics();
    inner.name = 'inner';
    inner.roundRect(3, 3, size - 6, size - 6, 6);
    inner.fill(COLORS.BG_CARD);
    btn.addChild(inner);

    const icon = new Graphics();
    const c = size / 2;
    // Circular arrow (rotate CW)
    const r = 8;
    icon.arc(c, c, r, -Math.PI * 0.7, Math.PI * 0.5);
    icon.stroke({ color: COLORS.TEXT_DIM, alpha: 0.7, width: 2 });
    // Arrowhead at end of arc
    const ax = c + r * Math.cos(Math.PI * 0.5);
    const ay = c + r * Math.sin(Math.PI * 0.5);
    icon.moveTo(ax - 4, ay - 2);
    icon.lineTo(ax, ay);
    icon.lineTo(ax + 4, ay - 2);
    icon.stroke({ color: COLORS.TEXT_DIM, alpha: 0.7, width: 2 });
    btn.addChild(icon);

    // "R" label
    const label = new Text({ text: 'R', style: new TextStyle({
      fontFamily: 'Space Mono, monospace', fontSize: 7, fontWeight: '600', fill: COLORS.TEXT_DIM,
    }), resolution: 4 });
    label.anchor.set(0.5);
    label.position.set(c, c + 14);
    label.alpha = 0.5;
    btn.addChild(label);

    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointertap', () => {
      this.onRotate?.();
    });

    return btn;
  }

  private drawCopyIcon = (g: Graphics, cx: number, cy: number): void => {
    // Two overlapping rectangles
    g.roundRect(cx - 5, cy - 6, 8, 9, 1);
    g.stroke({ color: 0x4dc9f6, width: 1.5, alpha: 0.7 });
    g.roundRect(cx - 2, cy - 3, 8, 9, 1);
    g.stroke({ color: 0x4dc9f6, width: 1.5, alpha: 0.9 });
  };

  private drawPasteIcon = (g: Graphics, cx: number, cy: number): void => {
    // Clipboard shape
    g.roundRect(cx - 5, cy - 6, 10, 12, 1);
    g.stroke({ color: 0x53d769, width: 1.5, alpha: 0.7 });
    // Tab at top
    g.roundRect(cx - 3, cy - 8, 6, 4, 1);
    g.fill({ color: 0x53d769, alpha: 0.6 });
  };

  selectTool(tool: PlacementTool): void {
    this.selectedTool = tool;

    // Update tool buttons
    for (const [btnTool, btn] of this.buttons) {
      const active = btnTool === tool;
      const bg = btn.getChildByName('bg') as Graphics | null;
      if (bg) {
        bg.clear();
        bg.roundRect(0, 0, BTN_SIZE, BTN_SIZE, 6);
        if (active) {
          bg.fill({ color: COLORS.ACCENT_VIOLET, alpha: 0.25 });
          bg.roundRect(0, 0, BTN_SIZE, BTN_SIZE, 6);
          bg.stroke({ color: COLORS.ACCENT_VIOLET, width: 1.5, alpha: 0.7 });
        } else {
          bg.fill(COLORS.BG_CARD);
        }
      }
      const label = btn.getChildByName('label') as Text | null;
      if (label) {
        label.style = active ? LABEL_ACTIVE_STYLE : LABEL_STYLE;
      }
      // Redraw icon
      const oldIcon = btn.getChildByName('icon') as Graphics | null;
      if (oldIcon) {
        oldIcon.clear();
        const def = this.getToolDef(btnTool);
        if (def) {
          const cx = BTN_SIZE / 2;
          const cy = ICON_AREA_Y + ICON_AREA_H / 2;
          def.drawIcon(oldIcon, cx, cy, active);
        }
      }
    }

    // Update action buttons (delete, select)
    this.updateActionButton(this.deleteBtn, tool === 'delete');
    this.updateActionButton(this.selectBtn, tool === 'select');
  }

  private updateActionButton(btn: Container, active: boolean): void {
    const accent = (btn as any)._accentColor as number ?? COLORS.TEXT_DIM;
    const bg = btn.getChildByName('bg') as Graphics | null;
    const inner = btn.getChildByName('inner') as Graphics | null;
    if (bg) {
      bg.clear();
      bg.roundRect(0, 0, BTN_SIZE, BTN_SIZE, 8);
      bg.fill({ color: active ? accent : COLORS.BG_SURFACE, alpha: active ? 0.35 : 0.92 });
      if (active) {
        bg.roundRect(0, 0, BTN_SIZE, BTN_SIZE, 8);
        bg.stroke({ color: accent, width: 2, alpha: 0.9 });
      }
    }
    if (inner) {
      inner.clear();
      inner.roundRect(3, 3, BTN_SIZE - 6, BTN_SIZE - 6, 6);
      inner.fill(active ? this.darken(accent, 0.7) : COLORS.BG_CARD);
    }
  }

  private darken(color: number, amount: number): number {
    const r = ((color >> 16) & 0xff) * (1 - amount);
    const g = ((color >> 8) & 0xff) * (1 - amount);
    const b = (color & 0xff) * (1 - amount);
    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
  }

  /** Show/hide copy+paste buttons based on selection state */
  setSelectionState(hasSelection: boolean, hasClipboard: boolean): void {
    this.copyBtn.visible = hasSelection;
    this.pasteBtn.visible = hasClipboard;
  }

  private getToolDef(tool: PlacementTool): ToolDef | null {
    const defs: Record<string, ToolDef> = {
      belt: { tool: 'belt', label: 'Belt', group: 'transport', drawIcon: this.drawBeltIcon },
      tunnel: { tool: 'tunnel', label: 'Tunnel', group: 'transport', drawIcon: this.drawTunnelIcon },
      splitter: { tool: 'splitter', label: 'Splitter', group: 'transport', drawIcon: this.drawSplitterIcon },
      entry: { tool: 'entry', label: 'Entry', group: 'io', drawIcon: this.drawEntryIcon },
      exit: { tool: 'exit', label: 'Exit', group: 'io', drawIcon: this.drawExitIcon },
    };
    return defs[tool] ?? null;
  }

  /** Returns true if screen-space coordinates hit any visible toolbar button */
  hitTest(screenX: number, screenY: number): boolean {
    // Check tool bar buttons
    if (this.toolBar.visible) {
      const tx = this.toolBar.x;
      const ty = this.toolBar.y;
      for (const [, btn] of this.buttons) {
        const bx = tx + btn.x;
        const by = ty + btn.y;
        if (screenX >= bx && screenX <= bx + BTN_SIZE && screenY >= by && screenY <= by + BTN_SIZE) return true;
      }
    }

    // Check action panel buttons
    if (this.actionPanel.visible) {
      const ax = this.actionPanel.x;
      const ay = this.actionPanel.y;
      for (const child of [this.deleteBtn, this.selectBtn, this.rotateBtn, this.resetBtn]) {
        const bx = ax + child.x;
        const by = ay + child.y;
        if (screenX >= bx && screenX <= bx + BTN_SIZE && screenY >= by && screenY <= by + BTN_SIZE) return true;
      }
    }

    // Check copy/paste buttons
    for (const btn of [this.copyBtn, this.pasteBtn]) {
      if (!btn.visible) continue;
      const bx = btn.x;
      const by = btn.y;
      if (screenX >= bx && screenX <= bx + 36 && screenY >= by && screenY <= by + 36) return true;
    }

    return false;
  }

  positionAt(screenWidth: number, screenHeight: number): void {
    // Compute from actual laid-out children
    let maxX = 0;
    for (const [, btn] of this.buttons) {
      const right = btn.x + BTN_SIZE;
      if (right > maxX) maxX = right;
    }
    const totalW = maxX + PANEL_PAD;
    const totalH = PANEL_PAD * 2 + BTN_SIZE;

    // Update panel background
    const panel = this.toolBar.getChildByName('panel') as Graphics;
    if (panel) {
      panel.clear();
      panel.roundRect(0, 0, totalW, totalH, 10);
      panel.fill({ color: COLORS.BG_SURFACE, alpha: 0.92 });
    }

    // Center toolbar
    this.toolBar.position.set(
      (screenWidth - totalW) / 2,
      screenHeight - totalH - 16,
    );

    // Action panel (delete + select + rotate + reset): bottom-right corner
    const actionW = BTN_SIZE * 4 + BTN_GAP * 3;
    this.actionPanel.position.set(
      screenWidth - actionW - 16,
      screenHeight - BTN_SIZE - 16,
    );

    // Copy/Paste buttons: above the action panel
    const actionRight = screenWidth - 16;
    this.pasteBtn.position.set(actionRight - 36, screenHeight - BTN_SIZE - 16 - 36 - BTN_GAP);
    this.copyBtn.position.set(actionRight - 36 - 36 - BTN_GAP, screenHeight - BTN_SIZE - 16 - 36 - BTN_GAP);
  }
}
