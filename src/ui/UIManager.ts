import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { COLORS } from '@/utils/Constants';
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
import type { Wallet } from '@/economy/Wallet';
import type { Market } from '@/economy/Market';
import type { RecipeBook } from '@/simulation/RecipeBook';
import type { RecipeRegistry } from '@/simulation/RecipeRegistry';
import type { ResourceRegistry } from '@/simulation/Resource';
import type { Factory } from '@/simulation/Factory';
import type { QuestManager } from '@/economy/QuestManager';
import type { PlacementTool } from '@/factory/PlacementSystem';
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
  private backButton: Container;

  private screenWidth = 0;
  private screenHeight = 0;
  private onBack: () => void;

  constructor(
    wallet: Wallet,
    market: Market,
    recipeBook: RecipeBook,
    recipeRegistry: RecipeRegistry,
    resourceRegistry: ResourceRegistry,
    questManager: QuestManager,
    onToolSelect: (tool: PlacementTool) => void,
    onBack: () => void,
  ) {
    this.onBack = onBack;
    this.container = new Container();
    this.container.zIndex = 100;

    // Back button (top-right, hidden on world view)
    this.backButton = this.createBackButton();
    this.backButton.visible = false;
    this.container.addChild(this.backButton);

    this.hud = new HUD(wallet);
    this.container.addChild(this.hud.container);

    this.toolbar = new Toolbar(onToolSelect);
    this.container.addChild(this.toolbar.container);

    this.recipeBookUI = new RecipeBookUI(recipeBook, recipeRegistry, resourceRegistry);
    this.container.addChild(this.recipeBookUI.container);

    this.marketUI = new MarketUI(market, wallet);
    this.container.addChild(this.marketUI.container);

    this.storageUI = new StorageUI(resourceRegistry, market, wallet);
    this.container.addChild(this.storageUI.container);

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
    const btn = new Container();
    const bg = new Graphics();
    bg.roundRect(0, 0, 36, 36, 6);
    bg.fill({ color: COLORS.BG_SURFACE, alpha: 0.95 });
    bg.stroke({ color: COLORS.TEXT_DIM, width: 1, alpha: 0.3 });
    btn.addChild(bg);

    // Arrow left icon
    const arrow = new Graphics();
    arrow.moveTo(22, 10);
    arrow.lineTo(12, 18);
    arrow.lineTo(22, 26);
    arrow.stroke({ color: COLORS.TEXT_PRIMARY, width: 2.5 });
    btn.addChild(arrow);

    // No pointertap — click is handled via canvas-level handleClick()
    // Keep hover effects via Pixi events
    btn.eventMode = 'static';
    btn.cursor = 'pointer';

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
      bg.stroke({ color: COLORS.TEXT_DIM, width: 1, alpha: 0.3 });
    });

    return btn;
  }

  setActiveFactory(factory: Factory | null): void {
    this.marketUI.setActiveFactory(factory);
  }

  /** Show/hide toolbar and back button based on current view */
  setView(view: ViewType): void {
    this.toolbar.container.visible = (view === 'factory');
    this.backButton.visible = (view !== 'world');
  }

  /** Returns true if screen-space coordinates hit any interactive UI element */
  hitTestUI(screenX: number, screenY: number): boolean {
    if (this.toolbar.container.visible && this.toolbar.hitTest(screenX, screenY)) return true;
    if (this.backButton.visible) {
      const bx = this.backButton.x;
      const by = this.backButton.y;
      if (screenX >= bx && screenX <= bx + 36 && screenY >= by && screenY <= by + 36) return true;
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
      if (screenX >= bx && screenX <= bx + 36 && screenY >= by && screenY <= by + 36) {
        this.onBack();
        return true;
      }
    }
    return false;
  }

  resize(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;
    this.backButton.position.set(54, 10);
    this.hud.positionAt(width);
    this.toolbar.positionAt(width, height);
    this.recipeBookUI.positionAt(width, height);
    this.marketUI.positionAt(width, height);
    this.storageUI.positionAt(width, height);
    this.questPanel.positionAt(width, height);
    this.statsPanel.positionAt(width, height);
    this.tutorial.positionAt(width, height);
  }
}
