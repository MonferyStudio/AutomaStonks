import { Application } from 'pixi.js';
import { TickEngine } from './TickEngine';
import { eventBus, type ViewType } from './EventBus';
import { SaveManager } from './SaveManager';
import { GameSaveSystem } from './GameSaveSystem';
import { AutoSupplySystem } from './AutoSupplySystem';
import { computeBorderContext } from './BorderContextComputer';
import { RecipeRegistry } from '@/simulation/RecipeRegistry';
import { RecipeBook } from '@/simulation/RecipeBook';
import { ResourceRegistry } from '@/simulation/Resource';
import { PolyominoRegistry } from '@/simulation/PolyominoRegistry';
import { Factory } from '@/simulation/Factory';
import { FactoryView } from '@/factory/FactoryView';
import { WorldView } from '@/world/WorldView';
import { CityView } from '@/city/CityView';
import { SpriteFactory } from '@/rendering/SpriteFactory';
import { AnimationManager } from '@/rendering/AnimationManager';
import { Wallet } from '@/economy/Wallet';
import { Market } from '@/economy/Market';
import { Shop } from '@/economy/Shop';
import { QuestManager } from '@/economy/QuestManager';
import { TalentTree } from '@/economy/TalentTree';
import { TransportManager } from '@/transport/TransportManager';
import { UIManager } from '@/ui/UIManager';
import { DropdownMenu } from '@/ui/DropdownMenu';
import type { MachineDefinition } from '@/simulation/Machine';
import type { CitySlot } from '@/city/CitySlot';
import type { CityTypeDefinition } from '@/world/CityType';
import { DUST_DEFINITION } from '@/simulation/Dust';
import { Storage } from '@/simulation/Storage';

import recipesData from '@/data/recipes.json';
import machinesData from '@/data/machines.json';
import resourcesData from '@/data/resources.json';
import polyominosData from '@/data/polyominos.json';
import questsData from '@/data/quests.json';
import talentsData from '@/data/talents.json';

export class Game {
  readonly app: Application;
  readonly tickEngine: TickEngine;
  readonly recipeRegistry: RecipeRegistry;
  readonly recipeBook: RecipeBook;
  readonly resourceRegistry: ResourceRegistry;
  readonly polyominoRegistry: PolyominoRegistry;
  readonly spriteFactory: SpriteFactory;
  readonly animationManager: AnimationManager;
  readonly wallet: Wallet;
  readonly market: Market;
  readonly shop: Shop;
  readonly questManager: QuestManager;
  readonly talentTree: TalentTree;
  readonly transportManager: TransportManager;
  readonly saveManager: SaveManager;

  private currentView: ViewType = 'world';

  // Persistent views
  private worldView: WorldView | null = null;
  private cityViews = new Map<string, CityView>();
  private activeCityView: CityView | null = null;
  private factoryView: FactoryView | null = null;

  private uiManager: UIManager;
  private dropdownMenu: DropdownMenu;

  private activeFactory: Factory | null = null;
  private machines: MachineDefinition[] = [];
  private activeCityId: string | null = null;

  private cityTypeCache = new Map<string, CityTypeDefinition>();
  private factories = new Map<string, Factory>();
  private factoryCityMap = new Map<string, string>(); // factoryKey → cityId
  private storages = new Map<string, Storage>();
  private gameSave!: GameSaveSystem;
  private autoSupply!: AutoSupplySystem;

  constructor(app: Application) {
    this.app = app;

    this.tickEngine = new TickEngine();
    this.recipeRegistry = new RecipeRegistry();
    this.recipeBook = new RecipeBook();
    this.resourceRegistry = new ResourceRegistry();
    this.polyominoRegistry = new PolyominoRegistry();
    this.spriteFactory = new SpriteFactory();
    this.animationManager = new AnimationManager();
    this.wallet = new Wallet(500);
    this.market = new Market(this.resourceRegistry, this.wallet);
    this.shop = new Shop('shop_main', this.resourceRegistry, this.wallet);
    this.questManager = new QuestManager(this.wallet);
    this.talentTree = new TalentTree(this.wallet);
    this.transportManager = new TransportManager(this.wallet);
    this.saveManager = new SaveManager();

    this.loadData();

    this.app.stage.sortableChildren = true;

    // UI Manager
    this.uiManager = new UIManager(
      this.wallet,
      this.market,
      this.recipeBook,
      this.recipeRegistry,
      this.resourceRegistry,
      this.questManager,
      (tool) => {
        if (this.factoryView) {
          this.factoryView.placementSystem.setTool(tool);
        }
      },
      () => this.goBack(),
    );
    this.app.stage.addChild(this.uiManager.container);

    // Dropdown menu (hamburger top-left)
    this.dropdownMenu = new DropdownMenu({
      onSave: () => this.gameSave.quickSave(),
      onExportSave: () => this.gameSave.exportSave(),
      onImportSave: () => this.gameSave.importSave(() => this.resetAndRestart()),
      onResetSave: () => this.gameSave.resetSave(() => this.resetAndRestart()),
    });
    this.app.stage.addChild(this.dropdownMenu.container);

    // Save system
    this.gameSave = new GameSaveSystem({
      wallet: this.wallet,
      market: this.market,
      recipeBook: this.recipeBook,
      recipeRegistry: this.recipeRegistry,
      questManager: this.questManager,
      talentTree: this.talentTree,
      saveManager: this.saveManager,
      tickEngine: this.tickEngine,
      worldView: this.worldView,
      cityViews: this.cityViews,
      factories: this.factories,
      factoryCityMap: this.factoryCityMap,
      storages: this.storages,
      machines: this.machines,
      uiManager: this.uiManager,
      computeBorderContext: (slot, layout) => computeBorderContext(slot, layout),
    });

    // Auto supply/sell system
    this.autoSupply = new AutoSupplySystem(
      this.factories,
      this.factoryCityMap,
      this.shop,
      (cityId) => this.getStoragesForCity(cityId),
    );
    this.autoSupply.start();

    this.setupInput();

    // Auto-start: jump straight into the game
    this.startGame();

    // Dev-only debug panel (tree-shaken from prod build)
    if (import.meta.env.DEV) {
      import('@/debug/DebugPanel').then(m => m.mountDebugPanel(this));
    }
  }

  private loadData(): void {
    this.resourceRegistry.loadFromData(resourcesData as any);
    this.resourceRegistry.register(DUST_DEFINITION);
    this.recipeRegistry.loadFromData(recipesData as any);
    this.polyominoRegistry.loadFromData(polyominosData as any);
    this.machines = machinesData as MachineDefinition[];
    this.questManager.loadQuests(questsData as any);
    this.talentTree.loadNodes(talentsData as any);
  }

  // --- Game Lifecycle ---

  private startGame(): void {
    this.uiManager.container.visible = true;
    this.uiManager.resize(this.app.screen.width, this.app.screen.height);
    this.dropdownMenu.resize(this.app.screen.width, this.app.screen.height);

    this.createWorldView();

    // Restore session save if available
    this.gameSave.loadSessionSave();

    this.showView('world');
    this.tickEngine.start();
  }

  private resetAndRestart(): void {
    // Stop tick engine
    this.tickEngine.stop();
    this.tickEngine.reset();

    // Destroy factory view
    if (this.factoryView) {
      this.factoryView.camera.unbindFromCanvas();
      this.app.stage.removeChild(this.factoryView.container);
      this.factoryView.destroy();
      this.factoryView = null;
    }
    this.activeFactory = null;

    // Destroy all city views
    for (const cityView of this.cityViews.values()) {
      cityView.camera.unbindFromCanvas();
      this.app.stage.removeChild(cityView.container);
    }
    this.cityViews.clear();
    this.activeCityView = null;
    this.activeCityId = null;

    // Destroy world view
    if (this.worldView) {
      this.worldView.camera.unbindFromCanvas();
      this.app.stage.removeChild(this.worldView.container);
      this.worldView = null;
    }

    // Clear factories and storages
    this.factories.clear();
    this.factoryCityMap.clear();
    this.storages.clear();
    this.cityTypeCache.clear();
    this.gameSave.pendingSave = null;

    // Reset wallet and progression
    this.wallet.reset(500);
    this.recipeBook.deserialize([]);
    this.questManager.deserialize([]);
    this.talentTree.deserialize([]);

    // Re-init quest progress for all loaded quests
    this.questManager.loadQuests(questsData as any);

    // Restart
    this.startGame();
  }

  // --- World View ---

  private createWorldView(): void {
    if (this.worldView) return;

    this.worldView = new WorldView();
    this.worldView.onCityClicked = (cityId) => this.enterCity(cityId);
    this.app.stage.addChild(this.worldView.container);
    this.worldView.centerCamera(this.app.screen.width, this.app.screen.height);
  }

  // --- View Management ---

  private unbindCurrentCamera(): void {
    switch (this.currentView) {
      case 'world':
        this.worldView?.camera.unbindFromCanvas();
        break;
      case 'city':
        this.activeCityView?.camera.unbindFromCanvas();
        break;
      case 'factory':
        this.factoryView?.camera.unbindFromCanvas();
        break;
    }
  }

  private showView(target: ViewType): void {
    const oldView = this.currentView;
    this.unbindCurrentCamera();

    // Hide all game views
    if (this.worldView) this.worldView.container.visible = false;
    if (this.activeCityView) this.activeCityView.container.visible = false;
    if (this.factoryView) this.factoryView.container.visible = false;

    this.currentView = target;
    const canvas = this.app.canvas as HTMLCanvasElement;

    switch (target) {
      case 'world':
        if (this.worldView) {
          this.worldView.container.visible = true;
          this.worldView.camera.bindToCanvas(canvas);
        }
        this.uiManager.setActiveFactory(null);
        this.uiManager.storageUI.hide();
        this.uiManager.entryConfigUI.hide();
        break;

      case 'city':
        if (this.activeCityView) {
          this.activeCityView.container.visible = true;
          this.activeCityView.camera.bindToCanvas(canvas);
        }
        this.uiManager.setActiveFactory(null);
        this.uiManager.entryConfigUI.hide();
        break;

      case 'factory':
        if (this.factoryView) {
          this.factoryView.container.visible = true;
          this.factoryView.camera.bindToCanvas(canvas);
        }
        this.uiManager.setActiveFactory(this.activeFactory);
        this.uiManager.storageUI.hide();
        break;
    }

    // Show/hide toolbar based on view
    this.uiManager.setView(target);

    if (oldView !== target) {
      eventBus.emit('ViewChanged', { from: oldView, to: target });
    }
  }

  // --- Navigation ---

  private enterCity(cityId: string, forceGenerate: boolean = false): void {
    this.activeCityId = cityId;

    let cityView = this.cityViews.get(cityId);
    if (!cityView || forceGenerate) {
      // Destroy existing view if force regenerating
      if (forceGenerate && cityView) {
        cityView.camera.unbindFromCanvas();
        this.app.stage.removeChild(cityView.container);
        cityView.destroy();
        this.cityViews.delete(cityId);
        cityView = undefined;
      }

      const city = this.worldView?.worldMap.getCity(cityId);
      if (!city) return;

      this.cityTypeCache.set(cityId, city.cityType);

      cityView = new CityView(
        cityId,
        city.cityType,
        this.polyominoRegistry,
        this.transportManager,
        this.wallet,
        undefined,
        city.unlockCost,
        forceGenerate,
      );

      cityView.onSlotClicked = (slot: CitySlot) => {
        if (slot.purchased) {
          this.enterFactory(cityId, slot);
        }
      };

      cityView.onStorageClicked = (slot: CitySlot) => {
        if (slot.purchased) {
          const storage = this.getOrCreateStorage(cityId, slot);
          this.uiManager.storageUI.toggle(storage);
        }
      };

      this.cityViews.set(cityId, cityView);
      this.app.stage.addChild(cityView.container);
      cityView.centerCamera(this.app.screen.width, this.app.screen.height);

      // Apply pending save data (purchased slots, factory entities)
      this.gameSave.applyPendingCityData(cityId, cityView);
    }

    this.activeCityView = cityView;
    this.showView('city');
  }

  private enterFactory(cityId: string, slot: CitySlot): void {
    const factoryKey = `${cityId}_${slot.position.toKey()}`;

    const borderContext = computeBorderContext(slot, this.activeCityView?.layout);

    let factory = this.factories.get(factoryKey);
    if (!factory) {
      factory = new Factory(factoryKey, slot.polyomino, borderContext);
      this.factories.set(factoryKey, factory);
      this.factoryCityMap.set(factoryKey, cityId);
      this.tickEngine.register(factory);
    } else {
      factory.borderContext = borderContext;
    }

    this.activeFactory = factory;

    // Return items from deleted belts/ports back to city storages
    factory.onItemRecovered = (item) => {
      const storages = this.getStoragesForCity(cityId);
      for (const storage of storages) {
        const deposited = storage.deposit(item.resourceId, item.quantity);
        if (deposited > 0) {
          eventBus.emit('StorageUpdated', { storageId: storage.id });
          break;
        }
      }
    };

    if (this.factoryView) {
      this.app.stage.removeChild(this.factoryView.container);
      this.factoryView.destroy();
      this.factoryView = null;
    }

    this.factoryView = new FactoryView(
      factory,
      this.spriteFactory,
      this.resourceRegistry,
      this.recipeRegistry,
      this.recipeBook,
      this.tickEngine,
    );
    this.app.stage.addChild(this.factoryView.container);
    this.factoryView.centerCamera(this.app.screen.width, this.app.screen.height);

    // Wire up entry click → config popup (shows resources from city storages)
    this.factoryView.onEntryClicked = (port, screenX, screenY) => {
      const ui = this.uiManager.entryConfigUI;
      if (ui.isVisible() && ui.getPort() === port) {
        ui.hide();
      } else {
        const cityStorages = cityId ? this.getStoragesForCity(cityId) : [];
        ui.show(port, screenX, screenY, cityStorages);
        ui.onResourceSet = () => {
          this.factoryView?.markEntityDirty();
        };
      }
    };

    // Wire selection callbacks for copy/paste buttons
    this.factoryView.onSelectionChanged = (hasSelection, hasClipboard) => {
      this.uiManager.toolbar.setSelectionState(hasSelection, hasClipboard);
    };

    // Wire toolbar copy/paste/reset buttons
    this.uiManager.toolbar.onCopy = () => {
      this.factoryView?.copySelection();
    };
    this.uiManager.toolbar.onPaste = () => {
      this.factoryView?.startPaste();
    };
    this.uiManager.toolbar.onReset = () => {
      this.factoryView?.resetState();
    };
    this.uiManager.toolbar.onRotate = () => {
      this.factoryView?.placementSystem.rotateDirection();
    };

    this.showView('factory');
    eventBus.emit('FactoryEntered', { factoryId: factoryKey });
  }

  private getOrCreateStorage(cityId: string, slot: CitySlot): Storage {
    const key = `${cityId}_storage_${slot.position.toKey()}`;
    let storage = this.storages.get(key);
    if (!storage) {
      storage = new Storage(slot.polyomino.cells.length);
      storage.setMarket(this.market);
      this.storages.set(key, storage);
      this.tickEngine.register(storage);
    }
    return storage;
  }

  /** Get all storages for a given city */
  getStoragesForCity(cityId: string): Storage[] {
    const result: Storage[] = [];
    for (const [key, storage] of this.storages) {
      if (key.startsWith(`${cityId}_storage_`)) {
        result.push(storage);
      }
    }
    return result;
  }

  /** Go back one level: factory→city, city→world. */
  private goBack(): void {
    if (this.currentView === 'factory') {
      if (this.activeFactory) {
        eventBus.emit('FactoryExited', { factoryId: this.activeFactory.id });
      }
      if (this.factoryView) {
        this.factoryView.camera.unbindFromCanvas();
        this.app.stage.removeChild(this.factoryView.container);
        this.factoryView.destroy();
        this.factoryView = null;
      }
      this.activeFactory = null;

      // Auto-save when leaving factory
      this.gameSave.quickSave();

      if (this.activeCityId && this.activeCityView) {
        this.showView('city');
      } else {
        this.showView('world');
      }
    } else if (this.currentView === 'city') {
      // Auto-save when leaving city
      this.gameSave.quickSave();

      // showView needs activeCityView to unbind camera & hide container
      this.showView('world');
      this.activeCityId = null;
      this.activeCityView = null;
    }
  }

  private getActiveCamera() {
    switch (this.currentView) {
      case 'world': return this.worldView?.camera ?? null;
      case 'city': return this.activeCityView?.camera ?? null;
      case 'factory': return this.factoryView?.camera ?? null;
    }
  }

  // --- Input ---

  private setupInput(): void {
    const canvas = this.app.canvas as HTMLCanvasElement;

    canvas.addEventListener('pointermove', (e) => {
      if (this.currentView === 'factory') {
        this.factoryView?.handlePointerMove(e.offsetX, e.offsetY);
      }
    });

    // Pointer down: start drag paint in factory view
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      if (this.currentView === 'factory') {
        // Don't start factory interactions when clicking UI buttons
        if (this.uiManager.hitTestUI(e.offsetX, e.offsetY)) return;
        this.factoryView?.handlePointerDown(e.offsetX, e.offsetY);
      }
    });

    // Left-click: only fire click if it wasn't a camera drag
    canvas.addEventListener('pointerup', (e) => {
      if (e.button !== 0) return;

      // End factory drag paint (skip if clicking UI)
      if (this.currentView === 'factory') {
        if (!this.uiManager.hitTestUI(e.offsetX, e.offsetY)) {
          this.factoryView?.handlePointerUp();
        }
      }

      // Check if the active camera was dragged (panned)
      const camera = this.getActiveCamera();
      if (camera?.didDrag) return;

      // Check if UI consumed the click (back button, etc.)
      if (this.uiManager.handleClick(e.offsetX, e.offsetY)) return;

      switch (this.currentView) {
        case 'world':
          this.worldView?.handleClick(e.offsetX, e.offsetY);
          break;
        case 'city':
          this.activeCityView?.handleClick(e.offsetX, e.offsetY);
          break;
        case 'factory':
          this.factoryView?.handleClick(e.offsetX, e.offsetY);
          break;
      }
    });

    // Right-click: reset tool state (cancel paste, clear selection, set tool to none)
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.currentView === 'factory' && this.factoryView) {
        this.factoryView.resetState();
        this.uiManager.toolbar.selectTool('none');
      }
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (this.currentView === 'factory' && this.factoryView) {
        if (this.factoryView.handleKeyDown(e)) {
          e.preventDefault();
        }
      }
    });

    window.addEventListener('resize', () => {
      this.app.renderer.resize(window.innerWidth, window.innerHeight);
      this.uiManager.resize(window.innerWidth, window.innerHeight);
      this.dropdownMenu.resize(window.innerWidth, window.innerHeight);
      this.activeCityView?.resize(window.innerWidth, window.innerHeight);
    });

    // Auto-save when closing/refreshing the page
    window.addEventListener('beforeunload', () => {
      this.gameSave.quickSave();
    });

    // Auto-save periodically (every 30s) to catch in-place changes
    setInterval(() => this.gameSave.quickSave(), 30_000);

  }

  update(deltaMs: number): void {
    this.tickEngine.update(deltaMs);
    this.animationManager.update(deltaMs);

    switch (this.currentView) {
      case 'world':
        this.worldView?.update(deltaMs);
        break;
      case 'city':
        this.activeCityView?.update();
        break;
      case 'factory':
        this.factoryView?.update(deltaMs);
        break;
    }
  }
}
