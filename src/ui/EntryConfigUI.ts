import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { COLORS } from '@/utils/Constants';
import type { ResourceRegistry, ResourceDefinition } from '@/simulation/Resource';
import type { IOPort } from '@/factory/IOPort';
import type { Storage } from '@/simulation/Storage';
import { formatNumber } from '@/utils/formatNumber';

const TITLE_STYLE = new TextStyle({
  fontFamily: 'Space Mono, monospace',
  fontSize: 11,
  fontWeight: '700',
  fill: COLORS.TEXT_PRIMARY,
  letterSpacing: 2,
});

const ITEM_STYLE = new TextStyle({
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 11,
  fill: COLORS.TEXT_PRIMARY,
});

const DIM_STYLE = new TextStyle({
  fontFamily: 'DM Sans, sans-serif',
  fontSize: 10,
  fill: COLORS.TEXT_DIM,
});

const PANEL_WIDTH = 220;
const PANEL_PADDING = 12;

export class EntryConfigUI {
  readonly container: Container;
  private contentContainer: Container;
  private bg: Graphics;
  private resourceRegistry: ResourceRegistry;
  private port: IOPort | null = null;
  private storages: Storage[] = [];
  private visible = false;

  /** Called when the user selects or clears a resource on a port */
  onResourceSet: ((port: IOPort, resourceId: string | null) => void) | null = null;

  constructor(resourceRegistry: ResourceRegistry) {
    this.resourceRegistry = resourceRegistry;

    this.container = new Container();
    this.container.visible = false;
    this.container.zIndex = 200;

    this.bg = new Graphics();
    this.container.addChild(this.bg);

    this.contentContainer = new Container();
    this.contentContainer.position.set(PANEL_PADDING, PANEL_PADDING);
    this.container.addChild(this.contentContainer);
  }

  show(port: IOPort, screenX: number, screenY: number, storages: Storage[]): void {
    this.port = port;
    this.storages = storages;
    this.visible = true;
    this.container.visible = true;
    this.container.position.set(screenX, screenY);
    this.rebuild();
  }

  hide(): void {
    this.visible = false;
    this.container.visible = false;
    this.port = null;
    this.storages = [];
  }

  isVisible(): boolean {
    return this.visible;
  }

  getPort(): IOPort | null {
    return this.port;
  }

  private rebuild(): void {
    this.contentContainer.removeChildren();
    if (!this.port) return;

    const port = this.port;
    const innerWidth = PANEL_WIDTH - PANEL_PADDING * 2;
    let yOffset = 0;

    // Title
    const title = new Text({ text: 'ENTRY CONFIG', style: TITLE_STYLE });
    this.contentContainer.addChild(title);
    yOffset += 20;

    // Current selection
    if (port.resourceFilter) {
      const def = this.resourceRegistry.get(port.resourceFilter);
      if (def) {
        const currentRow = new Container();
        currentRow.position.set(0, yOffset);

        const currentBg = new Graphics();
        currentBg.roundRect(0, 0, innerWidth, 28, 6);
        currentBg.fill({ color: COLORS.IO_INPUT, alpha: 0.2 });
        currentBg.stroke({ color: COLORS.IO_INPUT, width: 1, alpha: 0.4 });
        currentRow.addChild(currentBg);

        const swatch = new Graphics();
        swatch.circle(14, 14, 5);
        swatch.fill(def.color);
        currentRow.addChild(swatch);

        const nameText = new Text({ text: def.name, style: { ...ITEM_STYLE, fontSize: 10 } });
        nameText.position.set(24, 7);
        currentRow.addChild(nameText);

        const checkmark = new Text({ text: '\u2713', style: { ...ITEM_STYLE, fontSize: 12, fill: COLORS.IO_INPUT } });
        checkmark.anchor.set(1, 0.5);
        checkmark.position.set(innerWidth - 8, 14);
        currentRow.addChild(checkmark);

        this.contentContainer.addChild(currentRow);
        yOffset += 32;
      }

      // Clear button
      const clearBtn = new Graphics();
      clearBtn.roundRect(0, yOffset, innerWidth, 22, 6);
      clearBtn.fill({ color: COLORS.ACCENT_RED, alpha: 0.3 });
      this.contentContainer.addChild(clearBtn);

      const clearText = new Text({ text: 'Clear', style: { ...ITEM_STYLE, fontSize: 10 } });
      clearText.anchor.set(0.5, 0.5);
      clearText.position.set(innerWidth / 2, yOffset + 11);
      this.contentContainer.addChild(clearText);

      clearBtn.eventMode = 'static';
      clearBtn.cursor = 'pointer';
      clearBtn.on('pointertap', () => {
        if (this.port) {
          this.port.resourceFilter = null;
          this.onResourceSet?.(this.port, null);
          this.hide();
        }
      });
      yOffset += 28;

      // Separator
      const sep = new Graphics();
      sep.rect(0, yOffset, innerWidth, 1);
      sep.fill({ color: COLORS.TEXT_DIM, alpha: 0.2 });
      this.contentContainer.addChild(sep);
      yOffset += 6;
    }

    // Collect available resources from city storages
    const resourceStocks = new Map<string, number>();
    for (const storage of this.storages) {
      for (const [resId, qty] of storage.getInventory()) {
        resourceStocks.set(resId, (resourceStocks.get(resId) ?? 0) + qty);
      }
    }

    if (resourceStocks.size === 0) {
      const emptyText = new Text({
        text: 'No resources in\ncity storages',
        style: { ...DIM_STYLE, fill: COLORS.ACCENT_YELLOW },
      });
      emptyText.position.set(0, yOffset);
      this.contentContainer.addChild(emptyText);
      yOffset += 30;
    } else {
      // Label
      const label = new Text({
        text: port.resourceFilter ? 'CHANGE TO' : 'SELECT RESOURCE',
        style: { ...TITLE_STYLE, fontSize: 9, letterSpacing: 1 },
      });
      label.position.set(0, yOffset);
      this.contentContainer.addChild(label);
      yOffset += 16;

      for (const [resId, totalQty] of resourceStocks) {
        if (resId === port.resourceFilter) continue; // already shown above

        const def = this.resourceRegistry.get(resId);
        if (!def) continue;

        const row = new Container();
        row.position.set(0, yOffset);

        const rowBg = new Graphics();
        rowBg.roundRect(0, 0, innerWidth, 28, 6);
        rowBg.fill({ color: COLORS.BG_CARD, alpha: 0.8 });
        row.addChild(rowBg);

        const swatch = new Graphics();
        swatch.circle(14, 14, 4);
        swatch.fill(def.color);
        row.addChild(swatch);

        const name = new Text({ text: def.name, style: { ...ITEM_STYLE, fontSize: 10 } });
        name.position.set(24, 3);
        row.addChild(name);

        // Show stock quantity instead of price
        const stockText = new Text({
          text: `${formatNumber(totalQty)} in stock`,
          style: { ...DIM_STYLE, fontSize: 9 },
        });
        stockText.anchor.set(1, 0.5);
        stockText.position.set(innerWidth - 8, 14);
        row.addChild(stockText);

        rowBg.eventMode = 'static';
        rowBg.cursor = 'pointer';
        rowBg.on('pointerover', () => {
          rowBg.clear();
          rowBg.roundRect(0, 0, innerWidth, 28, 6);
          rowBg.fill({ color: COLORS.BG_CARD });
          rowBg.stroke({ color: COLORS.IO_INPUT, width: 1, alpha: 0.4 });
        });
        rowBg.on('pointerout', () => {
          rowBg.clear();
          rowBg.roundRect(0, 0, innerWidth, 28, 6);
          rowBg.fill({ color: COLORS.BG_CARD, alpha: 0.8 });
        });
        rowBg.on('pointertap', () => {
          if (this.port) {
            this.port.resourceFilter = resId;
            this.onResourceSet?.(this.port, resId);
            this.hide();
          }
        });

        this.contentContainer.addChild(row);
        yOffset += 32;
      }
    }

    // Background
    const panelHeight = PANEL_PADDING * 2 + yOffset + 4;
    this.bg.clear();
    this.bg.roundRect(0, 0, PANEL_WIDTH, panelHeight, 10);
    this.bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.95 });
    this.bg.roundRect(0, 0, PANEL_WIDTH, panelHeight, 10);
    this.bg.stroke({ color: COLORS.TEXT_DIM, alpha: 0.15, width: 1 });
  }

  positionAt(_screenWidth: number, _screenHeight: number): void {
    // Position is set dynamically when shown
  }
}
