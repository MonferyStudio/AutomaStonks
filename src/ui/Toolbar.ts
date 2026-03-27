import { Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import { COLORS, FONT_UI, FONT_MONO } from '@/utils/Constants';
import type { PlacementTool } from '@/factory/PlacementSystem';
import type { MachineDefinition } from '@/simulation/Machine';
import { TextureCache } from '@/rendering/TextureCache';
import { textResolution, isMobile } from '@/utils/platform';
import { formatMoney } from '@/utils/currency';
import { eventBus } from '@/core/EventBus';
import type { XPManager } from '@/economy/XPManager';

const BTN_SIZE = 68;
const BTN_GAP = 6;
const PANEL_PAD = 8;
const ICON_AREA_Y = 4;
const ICON_AREA_H = 30;
const LABEL_Y = 36;
const PRICE_Y = 50;
const DESKTOP_SCALE = 1;
const MOBILE_SCALE = 1;
const SCROLL_ARROW_W = 32;

const LABEL_STYLE = new TextStyle({
  fontFamily: FONT_UI,
  fontSize: 10,
  fontWeight: '700',
  fill: COLORS.TEXT_DIM,
});

const LABEL_ACTIVE_STYLE = new TextStyle({
  fontFamily: FONT_UI,
  fontSize: 10,
  fontWeight: '700',
  fill: COLORS.TEXT_PRIMARY,
});

const PRICE_STYLE = new TextStyle({
  fontFamily: FONT_MONO,
  fontSize: 10,
  fontWeight: '700',
  fill: COLORS.ACCENT_YELLOW,
});

interface ToolDef {
  tool: PlacementTool;
  label: string;
  cost: number;
  group: 'transport' | 'io' | 'machine';
  drawIcon: (g: Graphics, cx: number, cy: number, active: boolean) => void;
  /** First frame of spritesheet to use as icon (overrides drawIcon when available) */
  spriteTexture?: () => Texture | null;
}

export class Toolbar {
  readonly container: Container;
  private buttons = new Map<PlacementTool, Container>();
  private machineButtons = new Map<string, Container>(); // machineId → button
  private deleteBtn: Container;
  private selectBtn: Container;
  private resetBtn: Container;
  private rotateBtn: Container;
  private actionPanel: Container;
  private copyBtn: Container;
  private pasteBtn: Container;
  private selectedTool: PlacementTool = 'none';
  private selectedMachineId: string | null = null;
  private onSelect: (tool: PlacementTool) => void;
  private toolBar: Container;
  onCopy: (() => void) | null = null;
  onPaste: (() => void) | null = null;
  onReset: (() => void) | null = null;
  onRotate: (() => void) | null = null;
  onMachineSelect: ((def: MachineDefinition) => void) | null = null;

  private machineDefs: MachineDefinition[] = [];
  private xpManager: XPManager | null = null;

  // Mobile scroll system
  private _scrollWrapper: Container;
  private _scrollMaskGfx: Graphics;
  private _scrollLeftArrow: Container;
  private _scrollRightArrow: Container;
  private _scrollOffset = 0;
  private _scrollMaxOffset = 0;
  private _scrollViewW = 0;

  constructor(onSelect: (tool: PlacementTool) => void, machineDefs: MachineDefinition[] = []) {
    this.onSelect = onSelect;
    this.machineDefs = machineDefs;
    this.container = new Container();

    this.toolBar = new Container();
    this._scrollWrapper = new Container();
    this._scrollMaskGfx = new Graphics();
    this._scrollWrapper.addChild(this.toolBar, this._scrollMaskGfx);
    this.container.addChild(this._scrollWrapper);

    const tools: ToolDef[] = [
      { tool: 'belt', label: 'Belt', cost: 1, group: 'transport', drawIcon: this.drawBeltIcon, spriteTexture: () => TextureCache.beltStraightFrames[0] ?? null },
      { tool: 'tunnel', label: 'Tunnel', cost: 5, group: 'transport', drawIcon: this.drawTunnelIcon },
      { tool: 'exchanger', label: 'Exchanger', cost: 10, group: 'transport', drawIcon: this.drawExchangerIcon, spriteTexture: () => TextureCache.exchangerFrames[0] ?? null },
      { tool: 'entry', label: 'Entry', cost: 3, group: 'io', drawIcon: this.drawEntryIcon, spriteTexture: () => TextureCache.beltEntryFrames[0] ?? null },
      { tool: 'exit', label: 'Exit', cost: 3, group: 'io', drawIcon: this.drawExitIcon, spriteTexture: () => TextureCache.beltExitFrames[0] ?? null },
    ];

    // Panel background (drawn first, resized in positionAt)
    const panel = new Graphics();
    panel.label = 'panel';
    this.toolBar.addChild(panel);

    // Divider tracking: insert divider when group changes
    let prevGroup: string | null = null;
    let xOffset = PANEL_PAD;

    for (const def of tools) {
      if (prevGroup !== null && def.group !== prevGroup) {
        // Add divider
        const divider = new Graphics();
        divider.label = 'divider';
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

    // Machine buttons
    if (machineDefs.length > 0) {
      // Divider before machines
      const divider = new Graphics();
      divider.moveTo(xOffset + 1, 10);
      divider.lineTo(xOffset + 1, BTN_SIZE + PANEL_PAD * 2 - 10);
      divider.stroke({ color: COLORS.TEXT_DIM, alpha: 0.2, width: 1 });
      this.toolBar.addChild(divider);
      xOffset += BTN_GAP;

      for (const mDef of machineDefs) {
        const btn = this.createMachineButton(mDef);
        btn.position.set(xOffset, PANEL_PAD);
        this.toolBar.addChild(btn);
        this.machineButtons.set(mDef.id, btn);
        xOffset += BTN_SIZE + BTN_GAP;
      }
    }

    // Bottom-right action panel: Delete + Select
    this.actionPanel = new Container();
    this.container.addChild(this.actionPanel);

    this.deleteBtn = this.createActionButton('delete', 'Del', COLORS.ACCENT_RED, this.drawDeleteIcon);
    this.selectBtn = this.createActionButton('select', 'Select', COLORS.ACCENT_VIOLET, this.drawSelectIcon);
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

    // Scroll arrows (mobile only, drawn in positionAt)
    this._scrollLeftArrow = this._createScrollArrow(-1);
    this._scrollRightArrow = this._createScrollArrow(1);
    this._scrollLeftArrow.visible = false;
    this._scrollRightArrow.visible = false;
    this.container.addChild(this._scrollLeftArrow, this._scrollRightArrow);

    // Refresh price labels when currency symbol changes
    eventBus.on('CurrencyChanged', () => this.refreshPriceLabels());
  }

  private refreshPriceLabels(): void {
    // Update tool button prices
    for (const [tool, btn] of this.buttons) {
      const price = btn.getChildByLabel('price') as Text | null;
      if (price) {
        const cost = Toolbar.getToolCost(tool);
        price.text = formatMoney(cost);
      }
    }
    // Update machine button prices
    for (const [mId, btn] of this.machineButtons) {
      const price = btn.getChildByLabel('price') as Text | null;
      if (price) {
        const def = this.machineDefs.find(d => d.id === mId);
        if (def) price.text = formatMoney(def.cost);
      }
    }
  }

  private createMachineButton(mDef: MachineDefinition): Container {
    const btn = new Container();
    btn.label = `machine_${mDef.id}`;

    const bg = new Graphics();
    bg.label = 'bg';
    bg.roundRect(0, 0, BTN_SIZE, BTN_SIZE, 6);
    bg.fill(COLORS.BG_CARD);
    btn.addChild(bg);

    // Try to use sprite texture, fallback to colored rectangle
    const tex = TextureCache.getMachineTexture(mDef.id);
    if (tex) {
      const sprite = new Sprite(tex);
      sprite.label = 'icon';
      sprite.roundPixels = true;
      // Fit within icon area with padding
      const maxW = BTN_SIZE - 8;
      const maxH = ICON_AREA_H;
      const scale = Math.min(maxW / tex.width, maxH / tex.height);
      sprite.scale.set(scale);
      sprite.anchor.set(0.5);
      sprite.position.set(BTN_SIZE / 2, ICON_AREA_Y + ICON_AREA_H / 2);
      btn.addChild(sprite);
    } else {
      const icon = new Graphics();
      icon.label = 'icon';
      const cx = BTN_SIZE / 2;
      const cy = ICON_AREA_Y + ICON_AREA_H / 2;
      const w = Math.min(mDef.width * 8, 18);
      const h = Math.min(mDef.height * 8, 18);
      icon.roundRect(cx - w / 2, cy - h / 2, w, h, 2);
      icon.fill({ color: mDef.color, alpha: 0.7 });
      btn.addChild(icon);
    }

    const label = new Text({ text: mDef.name, style: LABEL_STYLE, resolution: textResolution() });
    label.label = 'label';
    label.roundPixels = true;
    label.anchor.set(0.5, 0);
    label.position.set(Math.round(BTN_SIZE / 2), LABEL_Y);
    btn.addChild(label);

    const price = new Text({ text: formatMoney(mDef.cost), style: PRICE_STYLE, resolution: textResolution() });
    price.label = 'price';
    price.roundPixels = true;
    price.anchor.set(0.5, 0);
    price.position.set(Math.round(BTN_SIZE / 2), PRICE_Y);
    btn.addChild(price);

    // Padlock overlay (hidden by default, shown when locked)
    const padlock = new Graphics();
    padlock.label = 'padlock';
    padlock.visible = false;
    // Lock body
    padlock.roundRect(BTN_SIZE / 2 - 8, BTN_SIZE / 2 - 4, 16, 12, 2);
    padlock.fill({ color: 0x555555, alpha: 0.9 });
    // Lock shackle
    padlock.arc(BTN_SIZE / 2, BTN_SIZE / 2 - 4, 6, Math.PI, 0);
    padlock.stroke({ color: 0x555555, width: 2.5 });
    btn.addChild(padlock);

    // Level requirement text (hidden by default)
    const lvlReq = new Text({ text: '', style: new TextStyle({ fontFamily: FONT_UI, fontSize: 8, fontWeight: '700', fill: 0xff6b6b }), resolution: textResolution() });
    lvlReq.label = 'lvlReq';
    lvlReq.anchor.set(0.5, 0);
    lvlReq.position.set(BTN_SIZE / 2, PRICE_Y);
    lvlReq.visible = false;
    btn.addChild(lvlReq);

    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointertap', () => {
      // Check lock state
      const locked = this.xpManager ? !this.xpManager.isUnlocked(mDef.requiredLevel ?? 0) : false;
      if (locked) return; // blocked

      const wasActive = this.selectedTool === 'machine' && this.selectedMachineId === mDef.id;
      if (wasActive) {
        this.selectTool('none');
        this.onSelect('none');
      } else {
        this.selectedMachineId = mDef.id;
        this.selectTool('machine');
        this.onSelect('machine');
        this.onMachineSelect?.(mDef);
      }
    });

    return btn;
  }

  setXPManager(xp: XPManager): void {
    this.xpManager = xp;
    this.refreshLockStates();
    eventBus.on('LevelChanged', () => this.refreshLockStates());
  }

  private refreshLockStates(): void {
    if (!this.xpManager) return;
    for (const mDef of this.machineDefs) {
      const btn = this.machineButtons.get(mDef.id);
      if (!btn) continue;

      const locked = !this.xpManager.isUnlocked(mDef.requiredLevel ?? 0);
      const padlock = btn.getChildByLabel('padlock');
      const priceText = btn.getChildByLabel('price');
      const lvlReq = btn.getChildByLabel('lvlReq');

      if (padlock) padlock.visible = locked;
      if (priceText) priceText.visible = !locked;
      if (lvlReq) {
        lvlReq.visible = locked;
        if (locked) (lvlReq as Text).text = `Lv.${mDef.requiredLevel}`;
      }

      btn.alpha = locked ? 0.4 : 1;
      btn.cursor = locked ? 'not-allowed' : 'pointer';
    }
  }

  private createToolButton(def: ToolDef): Container {
    const btn = new Container();
    btn.label =def.tool;

    const bg = new Graphics();
    bg.label = 'bg';
    bg.roundRect(0, 0, BTN_SIZE, BTN_SIZE, 6);
    bg.fill(COLORS.BG_CARD);
    btn.addChild(bg);

    const cx = BTN_SIZE / 2;
    const cy = ICON_AREA_Y + ICON_AREA_H / 2;
    const tex = def.spriteTexture?.() ?? null;
    if (tex) {
      const sprite = new Sprite(tex);
      sprite.label = 'icon';
      sprite.anchor.set(0.5);
      sprite.roundPixels = true;
      const maxW = BTN_SIZE - 8;
      const maxH = ICON_AREA_H;
      const scale = Math.min(maxW / tex.width, maxH / tex.height);
      sprite.scale.set(scale);
      sprite.position.set(cx, cy);
      btn.addChild(sprite);
    } else {
      const icon = new Graphics();
      icon.label = 'icon';
      def.drawIcon(icon, cx, cy, false);
      btn.addChild(icon);
    }

    const label = new Text({ text: def.label, style: LABEL_STYLE, resolution: textResolution() });
    label.label = 'label';
    label.roundPixels = true;
    label.anchor.set(0.5, 0);
    label.position.set(Math.round(BTN_SIZE / 2), LABEL_Y);
    btn.addChild(label);

    const price = new Text({ text: formatMoney(def.cost), style: PRICE_STYLE, resolution: textResolution() });
    price.label = 'price';
    price.roundPixels = true;
    price.anchor.set(0.5, 0);
    price.position.set(Math.round(BTN_SIZE / 2), PRICE_Y);
    btn.addChild(price);

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

  private drawExchangerIcon = (g: Graphics, cx: number, cy: number, active: boolean): void => {
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

  private createActionButton(tool: PlacementTool, labelText: string, accentColor: number, drawIcon: (g: Graphics, cx: number, cy: number) => void): Container {
    const size = BTN_SIZE;
    const btn = new Container();
    btn.label = tool;

    const bg = new Graphics();
    bg.label = 'bg';
    bg.roundRect(0, 0, size, size, 8);
    bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.92 });
    btn.addChild(bg);

    const inner = new Graphics();
    inner.label = 'inner';
    inner.roundRect(3, 3, size - 6, size - 6, 6);
    inner.fill(COLORS.BG_CARD);
    btn.addChild(inner);

    const icon = new Graphics();
    icon.label = 'icon';
    drawIcon(icon, size / 2, ICON_AREA_Y + ICON_AREA_H / 2);
    btn.addChild(icon);

    const label = new Text({ text: labelText, style: LABEL_STYLE, resolution: textResolution() });
    label.label = 'label';
    label.anchor.set(0.5, 0);
    label.position.set(size / 2, LABEL_Y);
    btn.addChild(label);

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
    const w = 44;
    const h = 44;
    const btn = new Container();

    const bg = new Graphics();
    bg.label = 'bg';
    bg.roundRect(0, 0, w, h, 6);
    bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.92 });
    bg.roundRect(2, 2, w - 4, h - 4, 5);
    bg.fill(COLORS.BG_CARD);
    btn.addChild(bg);

    const icon = new Graphics();
    drawIcon(icon, w / 2, h / 2 - 2);
    btn.addChild(icon);

    const text = new Text({ text: label, style: new TextStyle({
      fontFamily: FONT_UI, fontSize: 6, fontWeight: '600', fill: color,
    }), resolution: textResolution() });
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
    btn.label = 'reset';

    const bg = new Graphics();
    bg.label = 'bg';
    bg.roundRect(0, 0, size, size, 8);
    bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.92 });
    btn.addChild(bg);

    const inner = new Graphics();
    inner.label = 'inner';
    inner.roundRect(3, 3, size - 6, size - 6, 6);
    inner.fill(COLORS.BG_CARD);
    btn.addChild(inner);

    const icon = new Graphics();
    const cx = size / 2;
    const cy = ICON_AREA_Y + ICON_AREA_H / 2;
    // Circle-slash (⊘) — universal "none / deselect"
    const r = 9;
    icon.circle(cx, cy, r);
    icon.stroke({ color: COLORS.TEXT_DIM, width: 2, alpha: 0.7 });
    // Diagonal slash
    const dx = r * Math.cos(Math.PI * 0.25);
    const dy = r * Math.sin(Math.PI * 0.25);
    icon.moveTo(cx - dx, cy - dy);
    icon.lineTo(cx + dx, cy + dy);
    icon.stroke({ color: COLORS.TEXT_DIM, width: 2, alpha: 0.7 });
    btn.addChild(icon);

    const label = new Text({ text: 'Clear', style: LABEL_STYLE, resolution: textResolution() });
    label.label = 'label';
    label.anchor.set(0.5, 0);
    label.position.set(size / 2, LABEL_Y);
    btn.addChild(label);

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
    btn.label = 'rotate';

    const bg = new Graphics();
    bg.label = 'bg';
    bg.roundRect(0, 0, size, size, 8);
    bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.92 });
    btn.addChild(bg);

    const inner = new Graphics();
    inner.label = 'inner';
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
      fontFamily: FONT_MONO, fontSize: 7, fontWeight: '600', fill: COLORS.TEXT_DIM,
    }), resolution: textResolution() });
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
      const bg = btn.getChildByLabel('bg') as Graphics | null;
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
      const label = btn.getChildByLabel('label') as Text | null;
      if (label) {
        label.style = active ? LABEL_ACTIVE_STYLE : LABEL_STYLE;
      }
      // Redraw icon (only for Graphics-based icons, not sprite icons)
      const oldIcon = btn.getChildByLabel('icon');
      if (oldIcon instanceof Graphics) {
        oldIcon.clear();
        const def = this.getToolDef(btnTool);
        if (def) {
          const cx = BTN_SIZE / 2;
          const cy = ICON_AREA_Y + ICON_AREA_H / 2;
          def.drawIcon(oldIcon, cx, cy, active);
        }
      }
    }

    // Update machine buttons
    for (const [mId, btn] of this.machineButtons) {
      const active = tool === 'machine' && this.selectedMachineId === mId;
      const bg = btn.getChildByLabel('bg') as Graphics | null;
      if (bg) {
        bg.clear();
        bg.roundRect(0, 0, BTN_SIZE, BTN_SIZE, 6);
        if (active) {
          bg.fill({ color: 0xf7c948, alpha: 0.25 });
          bg.roundRect(0, 0, BTN_SIZE, BTN_SIZE, 6);
          bg.stroke({ color: 0xf7c948, width: 1.5, alpha: 0.7 });
        } else {
          bg.fill(COLORS.BG_CARD);
        }
      }
      const label = btn.getChildByLabel('label') as Text | null;
      if (label) {
        label.style = active ? LABEL_ACTIVE_STYLE : LABEL_STYLE;
      }
    }

    // Clear machine selection when switching to a non-machine tool
    if (tool !== 'machine') {
      this.selectedMachineId = null;
    }

    // Update action buttons (delete, select)
    this.updateActionButton(this.deleteBtn, tool === 'delete');
    this.updateActionButton(this.selectBtn, tool === 'select');
  }

  private updateActionButton(btn: Container, active: boolean): void {
    const accent = (btn as any)._accentColor as number ?? COLORS.TEXT_DIM;
    const bg = btn.getChildByLabel('bg') as Graphics | null;
    const inner = btn.getChildByLabel('inner') as Graphics | null;
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
    const label = btn.getChildByLabel('label') as Text | null;
    if (label) {
      label.style = active ? LABEL_ACTIVE_STYLE : LABEL_STYLE;
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

  /** Get the coin cost for a placement tool (0 for tools with no cost) */
  static getToolCost(tool: PlacementTool): number {
    const costs: Partial<Record<PlacementTool, number>> = {
      belt: 1, tunnel: 5, exchanger: 10, entry: 3, exit: 3,
    };
    return costs[tool] ?? 0;
  }

  private getToolDef(tool: PlacementTool): ToolDef | null {
    const defs: Record<string, ToolDef> = {
      belt: { tool: 'belt', label: 'Belt', cost: 1, group: 'transport', drawIcon: this.drawBeltIcon, spriteTexture: () => TextureCache.beltStraightFrames[0] ?? null },
      tunnel: { tool: 'tunnel', label: 'Tunnel', cost: 5, group: 'transport', drawIcon: this.drawTunnelIcon },
      exchanger: { tool: 'exchanger', label: 'Exchanger', cost: 10, group: 'transport', drawIcon: this.drawExchangerIcon, spriteTexture: () => TextureCache.exchangerFrames[0] ?? null },
      entry: { tool: 'entry', label: 'Entry', cost: 3, group: 'io', drawIcon: this.drawEntryIcon, spriteTexture: () => TextureCache.beltEntryFrames[0] ?? null },
      exit: { tool: 'exit', label: 'Exit', cost: 3, group: 'io', drawIcon: this.drawExitIcon, spriteTexture: () => TextureCache.beltExitFrames[0] ?? null },
    };
    return defs[tool] ?? null;
  }

  private _createScrollArrow(dir: -1 | 1): Container {
    const c = new Container();
    c.eventMode = 'static';
    c.cursor = 'pointer';
    c.on('pointertap', () => {
      const step = (BTN_SIZE + BTN_GAP) * MOBILE_SCALE * 3;
      this._scrollOffset += dir * step;
      this._clampAndApplyScroll();
    });
    return c;
  }

  private _clampAndApplyScroll(): void {
    this._scrollOffset = Math.max(0, Math.min(this._scrollOffset, this._scrollMaxOffset));
    this.toolBar.position.x = -this._scrollOffset;
    this._scrollLeftArrow.visible = this._scrollOffset > 1;
    this._scrollRightArrow.visible = this._scrollOffset < this._scrollMaxOffset - 1;
  }

  private _drawScrollArrows(scaledH: number): void {
    for (const [arrow, dir] of [[this._scrollLeftArrow, -1], [this._scrollRightArrow, 1]] as const) {
      // Clear previous children (except event listeners)
      while (arrow.children.length > 0) arrow.removeChildAt(0);

      const bg = new Graphics();
      bg.roundRect(0, 0, SCROLL_ARROW_W, scaledH, 8);
      bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.9 });
      arrow.addChild(bg);

      const chevron = new Graphics();
      const cx = SCROLL_ARROW_W / 2;
      const cy = scaledH / 2;
      const sz = 8;
      if (dir < 0) {
        chevron.moveTo(cx + sz / 2, cy - sz);
        chevron.lineTo(cx - sz / 2, cy);
        chevron.lineTo(cx + sz / 2, cy + sz);
      } else {
        chevron.moveTo(cx - sz / 2, cy - sz);
        chevron.lineTo(cx + sz / 2, cy);
        chevron.lineTo(cx - sz / 2, cy + sz);
      }
      chevron.stroke({ color: COLORS.TEXT_PRIMARY, width: 2.5, alpha: 0.8 });
      arrow.addChild(chevron);
    }
  }

  /** Returns true if screen-space coordinates hit any visible toolbar button */
  hitTest(screenX: number, screenY: number): boolean {
    // Check scroll arrows
    for (const arrow of [this._scrollLeftArrow, this._scrollRightArrow]) {
      if (!arrow.visible) continue;
      const ax = arrow.x, ay = arrow.y;
      if (screenX >= ax && screenX <= ax + SCROLL_ARROW_W && screenY >= ay && screenY <= ay + arrow.height) return true;
    }

    // Check tool bar buttons (account for scrollWrapper + scale)
    if (this._scrollWrapper.visible) {
      const sx = this._scrollWrapper.x;
      const sy = this._scrollWrapper.y;
      const sc = this.toolBar.scale.x;
      const ox = this.toolBar.x; // scroll offset (negative)
      const visLeft = sx;
      const visRight = sx + this._scrollViewW;

      const allBtns = [...this.buttons.values(), ...this.machineButtons.values()];
      for (const btn of allBtns) {
        const bx = sx + ox + btn.x * sc;
        const by = sy + btn.y * sc;
        const bw = BTN_SIZE * sc;
        const bh = BTN_SIZE * sc;
        // Must be within visible (masked) area
        if (bx + bw < visLeft || bx > visRight) continue;
        if (screenX >= bx && screenX <= bx + bw && screenY >= by && screenY <= by + bh) return true;
      }
    }

    // Check action panel buttons (account for scale)
    if (this.actionPanel.visible) {
      const ax = this.actionPanel.x;
      const ay = this.actionPanel.y;
      const asc = this.actionPanel.scale.x;
      for (const child of [this.deleteBtn, this.selectBtn, this.rotateBtn, this.resetBtn]) {
        if (!child.visible) continue;
        const bx = ax + child.x * asc;
        const by = ay + child.y * asc;
        const bw = BTN_SIZE * asc;
        const bh = BTN_SIZE * asc;
        if (screenX >= bx && screenX <= bx + bw && screenY >= by && screenY <= by + bh) return true;
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
    // Compute toolbar natural width from actual laid-out children
    let maxX = 0;
    for (const [, btn] of this.buttons) {
      const right = btn.x + BTN_SIZE;
      if (right > maxX) maxX = right;
    }
    for (const [, btn] of this.machineButtons) {
      const right = btn.x + BTN_SIZE;
      if (right > maxX) maxX = right;
    }
    const totalW = maxX + PANEL_PAD;
    const totalH = PANEL_PAD * 2 + BTN_SIZE;

    // Update panel background
    const panel = this.toolBar.getChildByLabel('panel') as Graphics;
    if (panel) {
      panel.clear();
      panel.roundRect(0, 0, totalW, totalH, 10);
      panel.fill({ color: COLORS.BG_SURFACE, alpha: 0.92 });
    }

    const mobile = isMobile();
    const margin = 12;

    if (mobile) {
      // Hide rotate button on mobile (rotation handled via confirm UI)
      this.rotateBtn.visible = false;

      // Scale toolbar up for bigger touch targets
      this.toolBar.scale.set(MOBILE_SCALE);
      const scaledW = totalW * MOBILE_SCALE;
      const scaledH = totalH * MOBILE_SCALE;
      const viewW = screenWidth - margin * 2;
      this._scrollViewW = viewW;

      const toolbarBottom = screenHeight - margin;
      const toolbarTop = toolbarBottom - scaledH;

      if (scaledW > viewW) {
        // Content overflows → enable scroll
        this._scrollMaxOffset = scaledW - viewW;
        this._clampAndApplyScroll();

        // Apply mask to clip visible area
        this._scrollMaskGfx.clear();
        this._scrollMaskGfx.rect(0, 0, viewW, scaledH);
        this._scrollMaskGfx.fill(0xffffff);
        this._scrollWrapper.mask = this._scrollMaskGfx;

        // Position wrapper at left edge
        this._scrollWrapper.position.set(margin, toolbarTop);
        this.toolBar.position.y = 0;

        // Draw and position arrows
        this._drawScrollArrows(scaledH);
        this._scrollLeftArrow.position.set(margin, toolbarTop);
        this._scrollRightArrow.position.set(margin + viewW - SCROLL_ARROW_W, toolbarTop);
      } else {
        // Content fits → no scroll
        this._scrollWrapper.mask = null;
        this._scrollLeftArrow.visible = false;
        this._scrollRightArrow.visible = false;
        this._scrollOffset = 0;
        this._scrollMaxOffset = 0;
        this.toolBar.position.set(0, 0);
        this._scrollViewW = scaledW;
        this._scrollWrapper.position.set((screenWidth - scaledW) / 2, toolbarTop);
      }

      // Action buttons (3 buttons, no rotate) — scaled up on mobile
      this.actionPanel.scale.set(MOBILE_SCALE);
      const actionBtnCount = 3;
      const actionW = BTN_SIZE * actionBtnCount + BTN_GAP * (actionBtnCount - 1);
      const scaledActionW = actionW * MOBILE_SCALE;
      const scaledActionH = BTN_SIZE * MOBILE_SCALE;
      this.deleteBtn.position.set(0, 0);
      this.selectBtn.position.set(BTN_SIZE + BTN_GAP, 0);
      this.resetBtn.position.set((BTN_SIZE + BTN_GAP) * 2, 0);
      this.actionPanel.position.set(
        (screenWidth - scaledActionW) / 2,
        toolbarTop - scaledActionH - BTN_GAP,
      );

      // Copy/Paste buttons: above action panel
      const cpY = toolbarTop - scaledActionH - BTN_GAP - 44 - BTN_GAP;
      this.pasteBtn.position.set(screenWidth / 2 + BTN_GAP / 2, cpY);
      this.copyBtn.position.set(screenWidth / 2 - 44 - BTN_GAP / 2, cpY);
    } else {
      // Desktop layout — scaled up
      this.rotateBtn.visible = true;
      this.toolBar.scale.set(DESKTOP_SCALE);
      this.actionPanel.scale.set(DESKTOP_SCALE);
      this._scrollWrapper.mask = null;
      this._scrollLeftArrow.visible = false;
      this._scrollRightArrow.visible = false;
      this._scrollOffset = 0;
      this.toolBar.position.set(0, 0);

      const dScaledW = totalW * DESKTOP_SCALE;
      const dScaledH = totalH * DESKTOP_SCALE;
      this._scrollViewW = dScaledW;
      this._scrollWrapper.position.set(
        (screenWidth - dScaledW) / 2,
        screenHeight - dScaledH - 16,
      );

      // Restore desktop button positions
      this.deleteBtn.position.set(0, 0);
      this.selectBtn.position.set(BTN_SIZE + BTN_GAP, 0);
      this.rotateBtn.position.set((BTN_SIZE + BTN_GAP) * 2, 0);
      this.resetBtn.position.set((BTN_SIZE + BTN_GAP) * 3, 0);

      const actionW = BTN_SIZE * 4 + BTN_GAP * 3;
      const dScaledActionW = actionW * DESKTOP_SCALE;
      const dScaledActionH = BTN_SIZE * DESKTOP_SCALE;
      this.actionPanel.position.set(
        screenWidth - dScaledActionW - 16,
        screenHeight - dScaledActionH - 16,
      );

      const actionRight = screenWidth - 16;
      const cpBtnSize = 36 * DESKTOP_SCALE;
      this.pasteBtn.position.set(actionRight - 36, screenHeight - dScaledActionH - 16 - 36 - BTN_GAP);
      this.copyBtn.position.set(actionRight - 36 - 36 - BTN_GAP, screenHeight - dScaledActionH - 16 - 36 - BTN_GAP);
    }
  }

}
