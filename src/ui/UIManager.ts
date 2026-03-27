import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { COLORS, FONT_UI } from '@/utils/Constants';
import { isSmallScreen } from '@/utils/platform';
import { HUD } from './HUD';
import { Toolbar } from './Toolbar';
import { RecipeBookUI } from './RecipeBookUI';
import { MarketUI } from './MarketUI';
import { StorageUI } from './StorageUI';
import { EntryConfigUI } from './EntryConfigUI';
import { QuestPanel } from './QuestPanel';
import { StatsPanel } from './StatsPanel';
import { Tooltip } from './Tooltip';
import { Tutorial } from './Tutorial';
import { InputPopup } from './InputPopup';
import type { Wallet } from '@/economy/Wallet';
import type { Market } from '@/economy/Market';
import type { RecipeBook } from '@/simulation/RecipeBook';
import type { RecipeRegistry } from '@/simulation/RecipeRegistry';
import type { ResourceRegistry } from '@/simulation/Resource';
import type { Factory } from '@/simulation/Factory';
import type { QuestManager } from '@/economy/QuestManager';
import type { PlacementTool } from '@/factory/PlacementSystem';
import type { MachineDefinition } from '@/simulation/Machine';
import type { ViewType } from '@/core/EventBus';

export class UIManager {
  readonly container: Container;
  readonly hud: HUD;
  readonly toolbar: Toolbar;
  readonly recipeBookUI: RecipeBookUI;
  readonly marketUI: MarketUI;
  readonly storageUI: StorageUI;
  readonly entryConfigUI: EntryConfigUI;
  readonly questPanel: QuestPanel;
  readonly statsPanel: StatsPanel;
  readonly tooltip: Tooltip;
  readonly tutorial: Tutorial;
  private inputPopup = new InputPopup();
  private backButton: Container;
  private fleetButton: Container;
  private recipeButton: Container;
  private factoryNameBar: Container;
  private factoryNameText: Text;

  private screenWidth = 0;
  private screenHeight = 0;
  private onBack: () => void;
  onFleetToggle: (() => void) | null = null;
  /** Callback to rename the active factory */
  onFactoryRename: ((name: string) => void) | null = null;
  /** Callback to toggle the recipe dictionary */
  onRecipeDictionaryToggle: (() => void) | null = null;
  /** HTML-based shop UI, set externally by Game */
  shopUI: import('./ShopUI').ShopUI | null = null;

  constructor(
    wallet: Wallet,
    market: Market,
    recipeBook: RecipeBook,
    recipeRegistry: RecipeRegistry,
    resourceRegistry: ResourceRegistry,
    questManager: QuestManager,
    onToolSelect: (tool: PlacementTool) => void,
    onBack: () => void,
    machineDefs: MachineDefinition[] = [],
  ) {
    this.onBack = onBack;
    this.container = new Container();
    this.container.zIndex = 100;

    // Back button (hidden on world view)
    this.backButton = this.createBackButton();
    this.backButton.visible = false;
    this.container.addChild(this.backButton);

    // Fleet button (visible in city view only)
    this.fleetButton = this.createFleetButton();
    this.fleetButton.visible = false;
    this.container.addChild(this.fleetButton);

    // Recipe dictionary button (visible in factory view)
    this.recipeButton = this.createRecipeButton();
    this.recipeButton.visible = false;
    this.container.addChild(this.recipeButton);

    // Factory name bar (visible in factory view only)
    this.factoryNameBar = new Container();
    this.factoryNameBar.visible = false;
    const nameBarBg = new Graphics();
    nameBarBg.roundRect(0, 0, 200, 30, 6);
    nameBarBg.fill({ color: COLORS.BG_SURFACE, alpha: 0.9 });
    this.factoryNameBar.addChild(nameBarBg);
    this.factoryNameText = new Text({
      text: '',
      style: new TextStyle({
        fontFamily: FONT_UI,
        fontSize: 11,
        fontWeight: '700',
        fill: COLORS.TEXT_PRIMARY,
        letterSpacing: 1,
      }),
    });
    this.factoryNameText.anchor.set(0, 0.5);
    this.factoryNameText.position.set(10, 15);
    this.factoryNameBar.addChild(this.factoryNameText);

    // Pencil icon for renaming
    const pencilBtn = new Graphics();
    pencilBtn.eventMode = 'static';
    pencilBtn.cursor = 'pointer';
    pencilBtn.on('pointertap', () => {
      const current = this.factoryNameText.text;
      this.inputPopup.show({
        title: 'RENAME FACTORY',
        placeholder: 'New name…',
        value: current === 'FACTORY' ? '' : current,
        maxLength: 20,
        confirmLabel: 'Rename',
        onConfirm: (val) => {
          this.onFactoryRename?.(val.trim().slice(0, 20));
        },
      });
    });
    this.factoryNameBar.addChild(pencilBtn);

    this.container.addChild(this.factoryNameBar);

    this.hud = new HUD(wallet);
    this.container.addChild(this.hud.container);

    this.toolbar = new Toolbar(onToolSelect, machineDefs);
    this.container.addChild(this.toolbar.container);

    this.recipeBookUI = new RecipeBookUI(recipeBook, recipeRegistry, resourceRegistry);
    this.container.addChild(this.recipeBookUI.container);

    this.marketUI = new MarketUI(market, wallet);
    this.container.addChild(this.marketUI.container);

    this.storageUI = new StorageUI(resourceRegistry, market, wallet);

    this.entryConfigUI = new EntryConfigUI(resourceRegistry);
    this.container.addChild(this.entryConfigUI.container);

    this.questPanel = new QuestPanel(questManager);
    this.container.addChild(this.questPanel.container);

    this.statsPanel = new StatsPanel();
    this.container.addChild(this.statsPanel.container);

    this.tooltip = new Tooltip();
    this.container.addChild(this.tooltip.container);

    this.tutorial = new Tutorial();
    this.container.addChild(this.tutorial.container);
  }

  private createBackButton(): Container {
    const S = 44;
    const btn = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, S, S, 8);
    bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.95 });
    bg.stroke({ color: COLORS.TEXT_DIM, width: 1, alpha: 0.3 });
    btn.addChild(bg);

    const arrow = new Graphics();
    arrow.moveTo(26, 12);
    arrow.lineTo(16, 22);
    arrow.lineTo(26, 32);
    arrow.stroke({ color: COLORS.TEXT_PRIMARY, width: 2.5 });
    btn.addChild(arrow);

    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointerover', () => {
      bg.clear(); bg.roundRect(0, 0, S, S, 8);
      bg.fill({ color: COLORS.BG_CARD });
      bg.stroke({ color: COLORS.ACCENT_VIOLET, width: 2, alpha: 0.6 });
    });
    btn.on('pointerout', () => {
      bg.clear(); bg.roundRect(0, 0, S, S, 8);
      bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.95 });
      bg.stroke({ color: COLORS.TEXT_DIM, width: 1, alpha: 0.3 });
    });

    return btn;
  }

  private createFleetButton(): Container {
    const S = 44;
    const btn = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, S, S, 8);
    bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.95 });
    bg.stroke({ color: COLORS.TEXT_DIM, width: 1, alpha: 0.3 });
    btn.addChild(bg);

    const label = new Text({
      text: 'F',
      style: new TextStyle({
        fontFamily: FONT_UI, fontSize: 18,
        fontWeight: '700', fill: COLORS.ACCENT_YELLOW,
      }),
    });
    label.anchor.set(0.5);
    label.position.set(S / 2, S / 2);
    btn.addChild(label);

    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointerover', () => {
      bg.clear(); bg.roundRect(0, 0, S, S, 8);
      bg.fill({ color: COLORS.BG_CARD });
      bg.stroke({ color: COLORS.ACCENT_YELLOW, width: 2, alpha: 0.6 });
    });
    btn.on('pointerout', () => {
      bg.clear(); bg.roundRect(0, 0, S, S, 8);
      bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.95 });
      bg.stroke({ color: COLORS.TEXT_DIM, width: 1, alpha: 0.3 });
    });

    return btn;
  }

  private createRecipeButton(): Container {
    const small = isSmallScreen();
    const S = 44;
    const W = small ? S : 120;
    const H = S;
    const btn = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, W, H, 8);
    bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.95 });
    bg.stroke({ color: COLORS.TEXT_DIM, width: 1, alpha: 0.3 });
    btn.addChild(bg);

    // Book icon
    const iconX = small ? W / 2 : 20;
    const icon = new Graphics();
    icon.moveTo(iconX, 12);
    icon.lineTo(iconX, 33);
    icon.stroke({ color: 0x4dc9f6, width: 1.5 });
    icon.moveTo(iconX, 14);
    icon.lineTo(iconX - 10, 16);
    icon.lineTo(iconX - 10, 31);
    icon.lineTo(iconX, 33);
    icon.stroke({ color: 0x4dc9f6, width: 1.5 });
    icon.moveTo(iconX, 14);
    icon.lineTo(iconX + 10, 16);
    icon.lineTo(iconX + 10, 31);
    icon.lineTo(iconX, 33);
    icon.stroke({ color: 0x4dc9f6, width: 1.5 });
    btn.addChild(icon);

    // Label text (desktop/tablet only)
    if (!small) {
      const label = new Text({
        text: 'Recipes',
        style: new TextStyle({
          fontFamily: FONT_UI, fontSize: 12,
          fontWeight: '700', fill: 0x4dc9f6,
        }),
      });
      label.anchor.set(0, 0.5);
      label.position.set(36, H / 2);
      btn.addChild(label);
    }

    btn.eventMode = 'static';
    btn.cursor = 'pointer';
    btn.on('pointerover', () => {
      bg.clear(); bg.roundRect(0, 0, W, H, 8);
      bg.fill({ color: COLORS.BG_CARD });
      bg.stroke({ color: 0x4dc9f6, width: 2, alpha: 0.6 });
    });
    btn.on('pointerout', () => {
      bg.clear(); bg.roundRect(0, 0, W, H, 8);
      bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.95 });
      bg.stroke({ color: COLORS.TEXT_DIM, width: 1, alpha: 0.3 });
    });
    btn.on('pointertap', () => this.onRecipeDictionaryToggle?.());

    (btn as any)._recipeW = W;
    (btn as any)._recipeH = H;
    return btn;
  }

  setActiveFactory(factory: Factory | null): void {
    this.marketUI.setActiveFactory(factory);
  }

  /** Show/hide toolbar and back button based on current view */
  setView(view: ViewType): void {
    this.toolbar.container.visible = (view === 'factory');
    this.backButton.visible = (view !== 'world');
    // Fleet button hidden — replaced by CityToolbar
    this.fleetButton.visible = false;
    this.factoryNameBar.visible = (view === 'factory');
    this.recipeButton.visible = (view === 'factory');
  }

  /** Update the factory name displayed in factory view */
  setXPManager(xp: import('@/economy/XPManager').XPManager): void {
    this.hud.setXPManager(xp);
    this.toolbar.setXPManager(xp);
  }

  setFactoryName(name: string): void {
    const displayName = name || 'FACTORY';
    this.factoryNameText.text = displayName;

    // Resize bg and reposition pencil
    const barW = this.factoryNameText.width + 36;
    const barH = 30;
    const bg = this.factoryNameBar.getChildAt(0) as Graphics;
    bg.clear();
    bg.roundRect(0, 0, barW, barH, 6);
    bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.9 });

    // Update pencil icon position
    const pencilBtn = this.factoryNameBar.getChildAt(2) as Graphics;
    const px = this.factoryNameText.width + 16;
    pencilBtn.clear();
    pencilBtn.moveTo(px, 18);
    pencilBtn.lineTo(px + 10, 8);
    pencilBtn.stroke({ color: COLORS.TEXT_DIM, width: 1.5 });
    pencilBtn.circle(px, 18, 1.5);
    pencilBtn.fill(COLORS.TEXT_DIM);
    pencilBtn.hitArea = { contains: (x: number, y: number) => x >= px - 4 && x <= px + 16 && y >= 4 && y <= 26 };
  }

  /** Returns true if screen-space coordinates hit any interactive UI element */
  hitTestUI(screenX: number, screenY: number): boolean {
    if (this.toolbar.container.visible && this.toolbar.hitTest(screenX, screenY)) return true;
    if (this.backButton.visible) {
      const bx = this.backButton.x;
      const by = this.backButton.y;
      if (screenX >= bx && screenX <= bx + 44 && screenY >= by && screenY <= by + 44) return true;
    }
    if (this.fleetButton.visible) {
      const fx = this.fleetButton.x;
      const fy = this.fleetButton.y;
      if (screenX >= fx && screenX <= fx + 44 && screenY >= fy && screenY <= fy + 44) return true;
    }
    if (this.recipeButton.visible) {
      const rx = this.recipeButton.x;
      const ry = this.recipeButton.y;
      const rw = (this.recipeButton as any)._recipeW ?? 44;
      const rh = (this.recipeButton as any)._recipeH ?? 44;
      if (screenX >= rx && screenX <= rx + rw && screenY >= ry && screenY <= ry + rh) return true;
    }
    return false;
  }

  /**
   * Check if a screen-space click hits a UI button.
   * Returns true if the click was consumed by a UI element.
   */
  handleClick(screenX: number, screenY: number): boolean {
    // Check back button
    if (this.backButton.visible) {
      const bx = this.backButton.x;
      const by = this.backButton.y;
      if (screenX >= bx && screenX <= bx + 44 && screenY >= by && screenY <= by + 44) {
        this.onBack();
        return true;
      }
    }
    // Check fleet button
    if (this.fleetButton.visible) {
      const fx = this.fleetButton.x;
      const fy = this.fleetButton.y;
      if (screenX >= fx && screenX <= fx + 44 && screenY >= fy && screenY <= fy + 44) {
        this.onFleetToggle?.();
        return true;
      }
    }
    return false;
  }

  resize(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;
    this.backButton.position.set(54, 10);
    this.fleetButton.position.set(96, 10);

    // Recipe button: desktop/tablet → bottom-left, phone → under burger
    const small = isSmallScreen();
    if (small) {
      this.recipeButton.position.set(10, 54);
    } else {
      this.recipeButton.position.set(10, height - 54 - 10);
    }
    this.hud.positionAt(width);
    this.factoryNameBar.position.set(width / 2 - 100, 54);
    this.toolbar.positionAt(width, height);
    this.recipeBookUI.positionAt(width, height);
    this.marketUI.positionAt(width, height);
    this.storageUI.positionAt(width, height);
    this.questPanel.positionAt(width, height);
    this.statsPanel.positionAt(width, height);
    this.tutorial.positionAt(width, height);
  }
}
