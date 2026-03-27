import { Application } from 'pixi.js';
import { COLORS } from '@/utils/Constants';
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
import { CityShop, type ShopDefinition } from '@/economy/CityShop';
import { PriceEngine } from '@/economy/PriceEngine';
import { QuestManager } from '@/economy/QuestManager';
import { TalentTree } from '@/economy/TalentTree';
import { FleetManager } from '@/transport/FleetManager';
import { UIManager } from '@/ui/UIManager';
import { FleetUI } from '@/ui/FleetUI';
import { ShopUI } from '@/ui/ShopUI';
import { MarketBoardUI } from '@/ui/MarketBoardUI';
import { CityToolbar } from '@/ui/CityToolbar';
import { DropdownMenu } from '@/ui/DropdownMenu';
import { Machine, type MachineDefinition } from '@/simulation/Machine';
import { Belt } from '@/simulation/Belt';
import { TunnelEntry } from '@/simulation/Tunnel';
import { Exchanger } from '@/simulation/Exchanger';
import { IOPort } from '@/factory/IOPort';
import type { CitySlot } from '@/city/CitySlot';
import type { CityTypeDefinition } from '@/world/CityType';
import { DUST_DEFINITION } from '@/simulation/Dust';
import { Storage } from '@/simulation/Storage';
import { ItemStack } from '@/simulation/ItemStack';
import { NotificationSystem } from '@/ui/NotificationSystem';
import { Toolbar } from '@/ui/Toolbar';
import { AlertMonitor } from './AlertMonitor';
import { RecipeDictionaryUI } from '@/ui/RecipeDictionaryUI';
import { AssemblerUI } from '@/ui/AssemblerUI';
import { XPManager } from '@/economy/XPManager';
import { DiscoveryPopup } from '@/ui/DiscoveryPopup';

import recipesData from '@/data/recipes.json';
import machinesData from '@/data/machines.json';
import resourcesData from '@/data/resources.json';
import polyominosData from '@/data/polyominos.json';
import questsData from '@/data/quests.json';
import talentsData from '@/data/talents.json';
import shopsData from '@/data/shops.json';

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
  readonly priceEngine: PriceEngine;
  readonly questManager: QuestManager;
  readonly talentTree: TalentTree;
  readonly xpManager: XPManager;
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
  private cityShops = new Map<string, CityShop>(); // key → CityShop
  private shopDefinitions: ShopDefinition[] = [];
  private fleetManagers = new Map<string, FleetManager>(); // cityId → FleetManager
  /** Custom names for factories and storages: key → user-defined name */
  readonly buildingNames = new Map<string, string>();
  private autoSaveInterval: ReturnType<typeof setInterval> | null = null;
  private fleetUI: FleetUI | null = null;
  private marketBoardUI: MarketBoardUI | null = null;
  private recipeDictionaryUI!: RecipeDictionaryUI;
  private assemblerUI!: AssemblerUI;
  private discoveryPopup!: DiscoveryPopup;
  private cityToolbar: CityToolbar;
  private gameSave!: GameSaveSystem;
  private autoSupply!: AutoSupplySystem;
  private notifications!: NotificationSystem;
  private alertMonitor!: AlertMonitor;

  constructor(app: Application) {
    this.app = app;

    this.tickEngine = new TickEngine();
    this.recipeRegistry = new RecipeRegistry();
    this.recipeBook = new RecipeBook();
    this.resourceRegistry = new ResourceRegistry();
    this.polyominoRegistry = new PolyominoRegistry();
    this.spriteFactory = new SpriteFactory();
    this.animationManager = new AnimationManager();
    this.wallet = new Wallet(10000);
    this.market = new Market(this.resourceRegistry, this.wallet);
    this.shop = new Shop('shop_main', this.resourceRegistry, this.wallet);
    this.priceEngine = new PriceEngine(this.resourceRegistry);
    this.market.setPriceEngine(this.priceEngine);
    this.shop.setPriceEngine(this.priceEngine);
    this.questManager = new QuestManager(this.wallet);
    this.talentTree = new TalentTree(this.wallet);
    this.xpManager = new XPManager();
    this.saveManager = new SaveManager();

    this.loadData();
    this.tickEngine.register(this.priceEngine);

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
      this.machines,
    );
    this.app.stage.addChild(this.uiManager.container);
    this.uiManager.setXPManager(this.xpManager);

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
      resourceRegistry: this.resourceRegistry,
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
      fleetManagers: this.fleetManagers,
      buildingNames: this.buildingNames,
      xpManager: this.xpManager,
    });

    // Auto supply/sell system
    this.autoSupply = new AutoSupplySystem(
      this.factories,
      this.factoryCityMap,
      this.shop,
      (cityId) => this.getStoragesForCity(cityId),
    );
    this.autoSupply.start();

    // Notification & alert system
    this.notifications = new NotificationSystem();
    this.alertMonitor = new AlertMonitor(
      this.notifications,
      this.factories,
      this.storages,
      this.factoryCityMap,
    );
    this.alertMonitor.start();

    // Level-up notification (skip restore events where oldLevel=0)
    let gameStarted = false;
    eventBus.on('LevelChanged', ({ oldLevel, newLevel }) => {
      if (gameStarted && oldLevel < newLevel) {
        this.notifications.push('success', `Level Up! You are now Level ${newLevel}`);
      }
    });
    // Mark game as started after first frame to skip restore notifications
    requestAnimationFrame(() => { gameStarted = true; });

    // Floating text for sell/buy events in city view
    eventBus.on('ItemSold', ({ shopId, revenue }) => {
      if (!this.activeCityView || !this.activeCityId) return;
      for (const [key, shop] of this.cityShops) {
        if (shop.id === shopId && key.startsWith(`${this.activeCityId}_`)) {
          const slotKey = key.slice(this.activeCityId.length + 1); // e.g. "shop_0"
          const allSlots = this.activeCityView.layout.shopSlots;
          this.activeCityView.renderer.spawnFloatingText(slotKey, revenue, 0x53d769, allSlots);
          break;
        }
      }
    });

    eventBus.on('ItemBought', ({ storageId, cost }) => {
      if (!this.activeCityView || !this.activeCityId) return;
      for (const [key, storage] of this.storages) {
        if (storage.id === storageId && key.startsWith(`${this.activeCityId}_`)) {
          const slotKey = key.slice(this.activeCityId.length + 1); // e.g. "storage_0"
          const allSlots = this.activeCityView.layout.storageSlots;
          this.activeCityView.renderer.spawnFloatingText(slotKey, -cost, 0xe94560, allSlots);
          break;
        }
      }
    });

    // Shop UI
    this.uiManager.shopUI = new ShopUI(this.resourceRegistry, this.recipeBook, this.recipeRegistry);

    // Market Board UI
    this.marketBoardUI = new MarketBoardUI(this.priceEngine, this.resourceRegistry, this.recipeBook, this.recipeRegistry);

    // Recipe Dictionary UI (shared across city/factory views)
    this.recipeDictionaryUI = new RecipeDictionaryUI(this.recipeRegistry, this.resourceRegistry, this.recipeBook);
    this.uiManager.onRecipeDictionaryToggle = () => this.recipeDictionaryUI.toggle();

    // Assembler recipe selection UI
    this.assemblerUI = new AssemblerUI();
    this.discoveryPopup = new DiscoveryPopup(this.recipeRegistry, this.resourceRegistry);

    // City toolbar (bottom bar, replaces the old "F" button in UIManager)
    this.cityToolbar = new CityToolbar();
    this.cityToolbar.onRecipeDictionaryToggle = () => this.recipeDictionaryUI.toggle();
    this.cityToolbar.onFleetToggle = () => this.fleetUI?.toggle();
    this.cityToolbar.onMarketBoardToggle = () => this.marketBoardUI?.toggle();

    // Keep old UIManager fleet toggle as fallback
    this.uiManager.onFleetToggle = () => {
      this.fleetUI?.toggle();
    };

    this.setupInput();

    // Auto-start: jump straight into the game
    this.startGame();

    // Dev-only debug panel (tree-shaken from prod build)
    if (import.meta.env.DEV) {
      import('@/debug/DebugPanel').then(m => m.mountDebugPanel(this));
    }
  }

  getCurrentCityView(): CityView | null {
    return this.activeCityView;
  }

  /** Find the CitySlot that owns the currently active factory */
  getActiveFactorySlot(): CitySlot | null {
    if (!this.activeFactory || !this.activeCityView) return null;
    for (const slot of this.activeCityView.layout.factorySlots) {
      const factoryKey = `${this.activeCityId}_${slot.slotKey}`;
      if (this.factories.get(factoryKey) === this.activeFactory) return slot;
    }
    return null;
  }

  private loadData(): void {
    this.resourceRegistry.loadFromData(resourcesData as any);
    this.resourceRegistry.register(DUST_DEFINITION);
    this.recipeRegistry.loadFromData(recipesData as any);
    this.polyominoRegistry.loadFromData(polyominosData as any);
    this.machines = machinesData as MachineDefinition[];
    this.shopDefinitions = shopsData as unknown as ShopDefinition[];
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

    // Clear factories, storages, and fleets
    this.factories.clear();
    this.factoryCityMap.clear();
    this.storages.clear();
    this.fleetManagers.clear();
    if (this.fleetUI) {
      this.fleetUI.destroy();
      this.fleetUI = null;
    }
    this.cityTypeCache.clear();
    this.buildingNames.clear();
    this.gameSave.pendingSave = null;
    this.alertMonitor.destroy();
    this.alertMonitor = new AlertMonitor(
      this.notifications,
      this.factories,
      this.storages,
      this.factoryCityMap,
    );
    this.alertMonitor.start();

    // Reset wallet and progression
    this.wallet.reset(10000);
    this.recipeBook.deserialize([]);
    this.questManager.deserialize([]);
    this.talentTree.deserialize([]);
    this.xpManager.reset();

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
        this.app.renderer.background.color = COLORS.BG_PRIMARY;
        this.uiManager.setActiveFactory(null);
        this.uiManager.storageUI.hide();
        this.uiManager.entryConfigUI.hide();
        this.cityToolbar.hide();
        this.marketBoardUI?.hide();
        this.uiManager.shopUI?.hide();
        break;

      case 'city':
        if (this.activeCityView) {
          this.activeCityView.container.visible = true;
          this.activeCityView.camera.bindToCanvas(canvas);
          this.activeCityView.renderer.setApp(this.app);
        }
        this.uiManager.setActiveFactory(null);
        this.uiManager.entryConfigUI.hide();
        this.cityToolbar.show();
        break;

      case 'factory':
        if (this.factoryView) {
          this.factoryView.container.visible = true;
          this.factoryView.camera.bindToCanvas(canvas);
        }
        this.app.renderer.background.color = COLORS.BG_PRIMARY;
        this.uiManager.setActiveFactory(this.activeFactory);
        this.uiManager.storageUI.hide();
        this.cityToolbar.hide();
        this.marketBoardUI?.hide();
        this.uiManager.shopUI?.hide();
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
        this.wallet,
        this.resourceRegistry,
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
          this.uiManager.storageUI.toggle(
            storage,
            () => this.buildingNames.get(slot.slotKey) ?? '',
            (name) => {
              if (name) this.buildingNames.set(slot.slotKey, name);
              else this.buildingNames.delete(slot.slotKey);
              cityView!.renderer.markDirty();
            },
          );
        }
      };

      cityView.onShopClicked = (slot: CitySlot) => {
        if (slot.purchased) {
          const shop = this.getOrCreateShop(cityId, slot);
          this.uiManager.shopUI?.toggle(shop);
        }
      };

      cityView.onSlotPurchased = (slot: CitySlot) => {
        if (!this.buildingNames.has(slot.slotKey)) {
          const type = slot.slotType === 'factory' ? 'Factory' : 'Storage';
          const slotsOfType = slot.slotType === 'factory'
            ? cityView!.layout.factorySlots : cityView!.layout.storageSlots;
          const idx = slotsOfType.filter(s => s.purchased).length;
          this.buildingNames.set(slot.slotKey, `${type} ${idx}`);
        }
      };

      cityView.renderer.setApp(this.app);
      this.cityViews.set(cityId, cityView);
      this.app.stage.addChild(cityView.container);
      cityView.centerCamera(this.app.screen.width, this.app.screen.height);

      // Create fleet manager before applying save (save needs it to restore trucks)
      let fleet = this.fleetManagers.get(cityId);
      if (!fleet) {
        fleet = new FleetManager(this.wallet, this.resourceRegistry);
        this.fleetManagers.set(cityId, fleet);
        this.tickEngine.register(fleet);
      }

      // Apply pending save data (purchased slots, factory entities, fleet)
      this.gameSave.applyPendingCityData(cityId, cityView);

      // Generate default building names for purchased slots that don't have one yet
      this.ensureDefaultBuildingNames(cityView);
    }

    // Fleet manager for this city (may already exist from above or previous visit)
    let fleet = this.fleetManagers.get(cityId);
    if (!fleet) {
      fleet = new FleetManager(this.wallet, this.resourceRegistry);
      this.fleetManagers.set(cityId, fleet);
      this.tickEngine.register(fleet);
    }
    this.wireFleetContext(cityId, fleet, cityView);
    cityView.fleetManager = fleet;
    cityView.tickEngine = this.tickEngine;

    // Fleet UI
    if (!this.fleetUI) {
      this.fleetUI = new FleetUI(fleet);
    }
    this.fleetUI.setCityContext(
      fleet,
      cityView.layout,
      cityView.layout.roadNetwork,
      this.resourceRegistry,
      // getStorageForSlot — slotKey is e.g. "storage_0"
      (slotKey) => this.storages.get(`${cityId}_${slotKey}`) ?? null,
      // getOutputPortItems — slotKey is e.g. "factory_0"
      (slotKey) => {
        const factoryKey = `${cityId}_${slotKey}`;
        const factory = this.factories.get(factoryKey);
        if (!factory) return [];
        const items: { resourceId: string; qty: number }[] = [];
        for (const port of factory.getIOPorts()) {
          if (port.portType === 'output') {
            for (const stack of port.bufferQueue) {
              const existing = items.find(i => i.resourceId === stack.resourceId);
              if (existing) existing.qty += stack.quantity;
              else items.push({ resourceId: stack.resourceId, qty: stack.quantity });
            }
          }
        }
        return items;
      },
      // getShopForSlot — slotKey is e.g. "shop_0"
      (slotKey) => {
        const shopKey = `${cityId}_${slotKey}`;
        let shop = this.cityShops.get(shopKey);
        if (!shop) {
          const slot = cityView!.layout.shopSlots.find(s => s.slotKey === slotKey);
          if (slot) shop = this.getOrCreateShop(cityId, slot);
        }
        return shop ?? null;
      },
      // getBuildingName
      (slotKey) => this.buildingNames.get(slotKey),
    );
    this.fleetUI.onDirty = () => cityView!.renderer.markDirty();

    // Wire building selection mode
    this.fleetUI.onStartBuildingSelection = (callback) => {
      if (cityView) {
        cityView.buildingSelectionCallback = callback;
      }
    };
    this.fleetUI.onCancelBuildingSelection = () => {
      if (cityView) {
        cityView.buildingSelectionCallback = null;
      }
    };

    // Feed building alerts and names to city renderer
    cityView.renderer.setAlertData(this.alertMonitor.buildingAlerts);
    cityView.renderer.setBuildingNames(this.buildingNames);

    this.activeCityView = cityView;
    this.showView('city');
  }

  private enterFactory(cityId: string, slot: CitySlot): void {
    const factoryKey = `${cityId}_${slot.slotKey}`;

    const borderContext = computeBorderContext(slot, this.activeCityView?.layout);

    let factory = this.factories.get(factoryKey);
    if (!factory) {
      factory = new Factory(factoryKey, slot.toInteriorPolyomino(), borderContext);
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
      this.tickEngine,
    );
    this.app.stage.addChild(this.factoryView.container);
    this.factoryView.setRecipeRegistry(this.recipeRegistry);
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

    // Wire placement rejection notifications
    this.factoryView.placementSystem.onPlacementRejected = (reason) => {
      this.notifications.push('warning', reason);
    };

    // Wire placement cost deduction + floating text (single-click placements)
    this.factoryView.onEntityPlaced = (tool, gridPos) => {
      let cost = 0;
      if (tool === 'machine') {
        cost = this.factoryView!.placementSystem.currentMachineDef?.cost ?? 0;
      } else {
        cost = Toolbar.getToolCost(tool);
      }
      if (cost > 0) {
        this.wallet.spendCoins(cost);
        this.factoryView!.spawnFloatingText(gridPos.x, gridPos.y, -cost, 0xe94560);
      }
    };

    // Wire belt drag cost (batched: one floating text for the whole drag)
    this.factoryView.onBeltsDragPlaced = (count, lastPos) => {
      const unitCost = Toolbar.getToolCost('belt');
      const totalCost = unitCost * count;
      if (totalCost > 0) {
        this.wallet.spendCoins(totalCost);
        this.factoryView!.spawnFloatingText(lastPos.x, lastPos.y, -totalCost, 0xe94560);
      }
    };

    // Wire delete refund (100% of placement cost)
    this.factoryView.placementSystem.onEntityDeleted = (entity, pos) => {
      let refund = 0;
      if (entity instanceof Belt) {
        refund = Toolbar.getToolCost('belt');
      } else if (entity instanceof Machine) {
        refund = entity.definition.cost;
      } else if (entity instanceof TunnelEntry) {
        refund = Toolbar.getToolCost('tunnel');
      } else if (entity instanceof Exchanger) {
        refund = Toolbar.getToolCost('exchanger');
      } else if (entity instanceof IOPort) {
        refund = Toolbar.getToolCost(entity.portType === 'input' ? 'entry' : 'exit');
      }
      if (refund > 0) {
        this.wallet.addCoins(refund);
        this.factoryView!.spawnFloatingText(pos.x, pos.y, refund, 0x53d769);
      }
    };

    // Wire assembler click → recipe selection UI
    this.factoryView.onMachineClicked = (machine) => {
      this.assemblerUI.show(machine, this.recipeRegistry, this.resourceRegistry, this.recipeBook);
      this.assemblerUI.onRecipeSelected = () => {
        this.factoryView?.markEntityDirty();
      };
    };

    // Wire machine placement
    this.factoryView.placementSystem.machineFactory = (def, pos) => {
      return new Machine(def, pos, this.recipeRegistry, this.recipeBook);
    };
    this.uiManager.toolbar.onMachineSelect = (def) => {
      if (this.factoryView) {
        this.factoryView.placementSystem.currentMachineDef = def;
      }
    };

    // Wire factory name display
    this.uiManager.setFactoryName(this.buildingNames.get(slot.slotKey) ?? '');
    this.uiManager.onFactoryRename = (name) => {
      if (name) this.buildingNames.set(slot.slotKey, name);
      else this.buildingNames.delete(slot.slotKey);
      this.uiManager.setFactoryName(name);
      this.activeCityView?.renderer.markDirty();
    };

    this.showView('factory');
    eventBus.emit('FactoryEntered', { factoryId: factoryKey });
  }

  private wireFleetContext(cityId: string, fleet: FleetManager, cityView: CityView): void {
    fleet.setCityContext(
      // getStorage — slotKey is e.g. "storage_0"
      (slotKey) => this.storages.get(`${cityId}_${slotKey}`) ?? null,
      // getInputPortDeposit — slotKey is e.g. "factory_0"
      (slotKey, resourceId, qty) => {
        const factoryKey = `${cityId}_${slotKey}`;
        const factory = this.factories.get(factoryKey);
        if (!factory) return 0;
        const inputPorts = factory.getIOPorts().filter(
          p => p.portType === 'input' && !p.hasItem() &&
            p.resourceFilter === resourceId,
        );
        let deposited = 0;
        for (const port of inputPorts) {
          if (deposited >= qty) break;
          const item = new ItemStack(resourceId, 1);
          if (port.acceptItem(item)) deposited++;
        }
        return deposited;
      },
      // getFactoryNeeds
      (slotKey) => {
        const factoryKey = `${cityId}_${slotKey}`;
        const factory = this.factories.get(factoryKey);
        if (!factory) return [];
        const needs: string[] = [];
        for (const port of factory.getIOPorts()) {
          if (port.portType === 'input' && port.resourceFilter) {
            if (!needs.includes(port.resourceFilter)) {
              needs.push(port.resourceFilter);
            }
          }
        }
        return needs;
      },
      // getOutputPortItems
      (slotKey) => {
        const factoryKey = `${cityId}_${slotKey}`;
        const factory = this.factories.get(factoryKey);
        if (!factory) return [];
        const items: { resourceId: string; qty: number }[] = [];
        for (const port of factory.getIOPorts()) {
          if (port.portType === 'output') {
            for (const stack of port.bufferQueue) {
              const existing = items.find(i => i.resourceId === stack.resourceId);
              if (existing) {
                existing.qty += stack.quantity;
              } else {
                items.push({ resourceId: stack.resourceId, qty: stack.quantity });
              }
            }
          }
        }
        return items;
      },
      // withdrawOutputPort
      (slotKey, resourceId, qty) => {
        const factoryKey = `${cityId}_${slotKey}`;
        const factory = this.factories.get(factoryKey);
        if (!factory) return 0;
        let withdrawn = 0;
        for (const port of factory.getIOPorts()) {
          if (withdrawn >= qty) break;
          if (port.portType === 'output') {
            const stack = port.bufferQueue.find(s => s.resourceId === resourceId);
            if (stack) {
              const take = Math.min(stack.quantity, qty - withdrawn);
              stack.quantity -= take;
              withdrawn += take;
              if (stack.quantity <= 0) {
                port.bufferQueue.splice(port.bufferQueue.indexOf(stack), 1);
              }
            }
          }
        }
        return withdrawn;
      },
      // sellToShop
      (shopSlotKey, resourceId, qty) => {
        const shopKey = `${cityId}_${shopSlotKey}`;
        let cityShop = this.cityShops.get(shopKey);
        if (!cityShop) {
          const cv = this.cityViews.get(cityId);
          const slot = cv?.layout.shopSlots.find(s => s.slotKey === shopSlotKey);
          if (slot) {
            cityShop = this.getOrCreateShop(cityId, slot);
          }
        }
        if (cityShop) {
          const item = new ItemStack(resourceId, qty);
          return cityShop.sell(item);
        }
        // Fallback to global shop
        const item = new ItemStack(resourceId, qty);
        return this.shop.sell(item);
      },
    );
  }

  private getOrCreateShop(cityId: string, slot: CitySlot): CityShop {
    const key = `${cityId}_${slot.slotKey}`;
    let shop = this.cityShops.get(key);
    if (!shop) {
      let def: ShopDefinition;
      if (slot.shopConfig) {
        // Use shop config from city JSON
        def = {
          id: 'custom',
          name: slot.shopConfig.name,
          color: slot.shopConfig.color,
          description: slot.shopConfig.description,
          acceptedCategories: slot.shopConfig.acceptedCategories ?? [],
          acceptedItems: slot.shopConfig.acceptedItems,
          priceModifier: slot.shopConfig.priceModifier,
          itemPriceModifiers: slot.shopConfig.itemPriceModifiers,
        };
      } else {
        // Fallback: cycle through preset definitions
        const shopSlots = this.cityViews.get(cityId)?.layout.shopSlots ?? [];
        const slotIdx = shopSlots.indexOf(slot);
        def = this.shopDefinitions[slotIdx % this.shopDefinitions.length]
          ?? this.shopDefinitions[0];
      }
      shop = new CityShop(def, slot.slotKey, this.resourceRegistry, this.wallet);
      this.cityShops.set(key, shop);
    }
    return shop;
  }

  /** Get all city shops for a given city */
  getShopsForCity(cityId: string): CityShop[] {
    const result: CityShop[] = [];
    for (const [key, shop] of this.cityShops) {
      if (key.startsWith(`${cityId}_shop_`)) {
        result.push(shop);
      }
    }
    return result;
  }

  private getOrCreateStorage(cityId: string, slot: CitySlot): Storage {
    const key = `${cityId}_${slot.slotKey}`;
    let storage = this.storages.get(key);
    if (!storage) {
      storage = new Storage(slot.cellCount);
      storage.setMarket(this.market);
      storage.setResourceRegistry(this.resourceRegistry);
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

  /** Generate default names (Factory 1, Storage 1, etc.) for purchased slots without a name */
  private ensureDefaultBuildingNames(cityView: CityView): void {
    let factoryIdx = 1;
    let storageIdx = 1;
    for (const slot of cityView.layout.factorySlots) {
      if (!slot.purchased) continue;
      if (!this.buildingNames.has(slot.slotKey)) {
        this.buildingNames.set(slot.slotKey, `Factory ${factoryIdx}`);
      }
      factoryIdx++;
    }
    for (const slot of cityView.layout.storageSlots) {
      if (!slot.purchased) continue;
      if (!this.buildingNames.has(slot.slotKey)) {
        this.buildingNames.set(slot.slotKey, `Storage ${storageIdx}`);
      }
      storageIdx++;
    }
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
      // Hide city UI panels
      this.fleetUI?.hide();
      this.cityToolbar.hide();
      this.marketBoardUI?.hide();
      this.uiManager.shopUI?.hide();
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
        // Let debug border painting intercept first
        if (this.factoryView.handleRightClick(e.offsetX, e.offsetY)) return;
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
    if (this.autoSaveInterval) clearInterval(this.autoSaveInterval);
    this.autoSaveInterval = setInterval(() => this.gameSave.quickSave(), 30_000);

  }

  /** Emergency save (used before WebGL context loss reload) */
  forceSave(): void {
    this.gameSave.quickSave();
  }

  update(deltaMs: number): void {
    this.tickEngine.update(deltaMs);
    this.animationManager.update(deltaMs);

    switch (this.currentView) {
      case 'world':
        this.worldView?.update(deltaMs);
        break;
      case 'city':
        this.activeCityView?.update(deltaMs);
        break;
      case 'factory':
        this.factoryView?.update(deltaMs);
        break;
    }
  }
}
