import { SaveManager } from './SaveManager';
import { TickEngine } from './TickEngine';
import { Wallet } from '@/economy/Wallet';
import { getCurrencySymbol, setCurrencySymbol, type CurrencySymbol } from '@/utils/currency';
import { Market } from '@/economy/Market';
import { RecipeBook } from '@/simulation/RecipeBook';
import { RecipeRegistry } from '@/simulation/RecipeRegistry';
import type { ResourceRegistry } from '@/simulation/Resource';
import { QuestManager } from '@/economy/QuestManager';
import { TalentTree } from '@/economy/TalentTree';
import { XPManager } from '@/economy/XPManager';
import { Factory, type FactorySaveData } from '@/simulation/Factory';
import { Machine } from '@/simulation/Machine';
import { Storage } from '@/simulation/Storage';
import type { CityView } from '@/city/CityView';
import type { CitySlot } from '@/city/CitySlot';
import type { WorldView } from '@/world/WorldView';
import type { UIManager } from '@/ui/UIManager';
import type { FactoryBorderContext } from '@/simulation/FactoryBorderContext';
import type { MachineDefinition } from '@/simulation/Machine';

const SAVE_KEY = 'automastonks_session_save';
const SAVE_VERSION = 1;

export interface StorageSaveData {
  key: string;
  upgradeLevel: number;
  inventory: Record<string, number>;
}

export interface GameSaveData {
  version: number;
  timestamp: number;
  wallet: { coins: number; talent: number };
  unlockedCities: string[];
  /** cityId → array of slot position keys ("x,y") that are purchased */
  purchasedSlots: Record<string, string[]>;
  /** cityId → array of storage slot position keys ("x,y") that are purchased */
  purchasedStorageSlots?: Record<string, string[]>;
  /** factoryKey → factory entity data */
  factories: Record<string, FactorySaveData>;
  /** factoryKey → cityId mapping */
  factoryCityMap?: Record<string, string>;
  /** Storage data keyed by storage key */
  storages?: StorageSaveData[];
  recipeBook?: string[];
  questProgress?: import('@/economy/QuestManager').QuestProgress[];
  talentTree?: string[];
  tutorialDone?: boolean;
  /** Fleet data per city */
  fleets?: Record<string, import('@/transport/FleetManager').FleetSaveData>;
  /** Custom building names: key → name */
  buildingNames?: Record<string, string>;
  /** Currency symbol preference */
  currencySymbol?: string;
  /** XP progression */
  xp?: { totalXP: number };
}

export interface GameSaveContext {
  wallet: Wallet;
  market: Market;
  resourceRegistry: ResourceRegistry;
  recipeBook: RecipeBook;
  recipeRegistry: RecipeRegistry;
  questManager: QuestManager;
  talentTree: TalentTree;
  saveManager: SaveManager;
  tickEngine: TickEngine;
  worldView: WorldView | null;
  cityViews: Map<string, CityView>;
  factories: Map<string, Factory>;
  factoryCityMap: Map<string, string>;
  storages: Map<string, Storage>;
  machines: MachineDefinition[];
  uiManager: UIManager;
  computeBorderContext: (slot: CitySlot, layout?: any) => FactoryBorderContext;
  fleetManagers: Map<string, import('@/transport/FleetManager').FleetManager>;
  buildingNames: Map<string, string>;
  xpManager: XPManager;
}

export class GameSaveSystem {
  pendingSave: GameSaveData | null = null;
  private ctx: GameSaveContext;

  constructor(ctx: GameSaveContext) {
    this.ctx = ctx;
  }

  buildSaveData(): GameSaveData {
    const ctx = this.ctx;

    // Collect unlocked cities
    const unlockedCities: string[] = [];
    if (ctx.worldView) {
      for (const city of ctx.worldView.worldMap.getCities()) {
        if (city.unlocked) unlockedCities.push(city.id);
      }
    }

    // Collect purchased factory slots per city (saved by slotKey e.g. "factory_0")
    const purchasedSlots: Record<string, string[]> = {};
    const purchasedStorageSlots: Record<string, string[]> = {};
    for (const [cityId, cityView] of ctx.cityViews) {
      const boughtFactories = cityView.layout.factorySlots
        .filter(s => s.purchased)
        .map(s => s.slotKey);
      if (boughtFactories.length > 0) purchasedSlots[cityId] = boughtFactories;

      const boughtStorages = cityView.layout.storageSlots
        .filter(s => s.purchased)
        .map(s => s.slotKey);
      if (boughtStorages.length > 0) purchasedStorageSlots[cityId] = boughtStorages;
    }

    // Preserve pending data for cities not yet visited this session
    if (this.pendingSave) {
      for (const [cityId, keys] of Object.entries(this.pendingSave.purchasedSlots)) {
        if (!purchasedSlots[cityId]) purchasedSlots[cityId] = keys;
      }
      if (this.pendingSave.purchasedStorageSlots) {
        for (const [cityId, keys] of Object.entries(this.pendingSave.purchasedStorageSlots)) {
          if (!purchasedStorageSlots[cityId]) purchasedStorageSlots[cityId] = keys;
        }
      }
    }

    // Collect factory data
    const factories: Record<string, FactorySaveData> = {};
    for (const [key, factory] of ctx.factories) {
      const data = factory.serialize();
      if (data.entities.length > 0 || data.ioPorts.length > 0) {
        factories[key] = data;
      }
    }

    // Preserve factory data for factories not yet restored from pending save
    if (this.pendingSave) {
      for (const [key, data] of Object.entries(this.pendingSave.factories)) {
        if (!factories[key] && !ctx.factories.has(key)) {
          factories[key] = data;
        }
      }
    }

    // Collect factoryCityMap
    const factoryCityMap: Record<string, string> = {};
    for (const [k, v] of ctx.factoryCityMap) factoryCityMap[k] = v;

    // Preserve factoryCityMap entries from pending save
    if (this.pendingSave?.factoryCityMap) {
      for (const [k, v] of Object.entries(this.pendingSave.factoryCityMap)) {
        if (!factoryCityMap[k]) factoryCityMap[k] = v;
      }
    }

    // Collect storage data
    const storages: StorageSaveData[] = [];
    const savedStorageKeys = new Set<string>();
    for (const [key, storage] of ctx.storages) {
      const inv: Record<string, number> = {};
      for (const [resId, qty] of storage.getInventory()) inv[resId] = qty;
      storages.push({ key, upgradeLevel: storage.upgradeLevel, inventory: inv });
      savedStorageKeys.add(key);
    }

    // Preserve storage data from pending save for storages not yet restored
    if (this.pendingSave?.storages) {
      for (const sd of this.pendingSave.storages) {
        if (!savedStorageKeys.has(sd.key)) {
          storages.push(sd);
        }
      }
    }

    const tutorial = ctx.uiManager.tutorial;
    const tutorialDone = tutorial.completed || tutorial.dismissed;

    return {
      version: SAVE_VERSION,
      timestamp: Date.now(),
      wallet: ctx.wallet.serialize(),
      unlockedCities,
      purchasedSlots,
      purchasedStorageSlots,
      factories,
      factoryCityMap,
      storages,
      recipeBook: ctx.recipeBook.serialize(),
      questProgress: ctx.questManager.serialize(),
      talentTree: ctx.talentTree.serialize(),
      tutorialDone,
      fleets: this.serializeFleets(),
      buildingNames: Object.fromEntries(ctx.buildingNames),
      currencySymbol: getCurrencySymbol(),
      xp: ctx.xpManager.serialize(),
    };
  }

  private serializeFleets(): Record<string, import('@/transport/FleetManager').FleetSaveData> {
    const result: Record<string, import('@/transport/FleetManager').FleetSaveData> = {};

    // Serialize active fleet managers
    for (const [cityId, fleet] of this.ctx.fleetManagers) {
      const data = fleet.serialize();
      if (data.trucks.length > 0 || data.routes.length > 0) {
        result[cityId] = data;
      }
    }

    // Preserve fleet data for cities not yet visited this session
    if (this.pendingSave?.fleets) {
      for (const [cityId, data] of Object.entries(this.pendingSave.fleets)) {
        if (!result[cityId]) {
          result[cityId] = data;
        }
      }
    }

    return result;
  }

  applySaveData(save: GameSaveData): void {
    const ctx = this.ctx;

    if (save.wallet) {
      ctx.wallet.deserialize(save.wallet);
    }

    if (save.unlockedCities && ctx.worldView) {
      for (const cityId of save.unlockedCities) {
        ctx.worldView.worldMap.unlockCity(cityId);
      }
      ctx.worldView.renderer.markDirty();
    }

    if (save.tutorialDone) {
      ctx.uiManager.tutorial.dismiss();
    }

    if (save.recipeBook) {
      ctx.recipeBook.deserialize(save.recipeBook);
    }

    if (save.questProgress) {
      ctx.questManager.deserialize(save.questProgress);
    }

    if (save.talentTree) {
      ctx.talentTree.deserialize(save.talentTree);
    }

    if (save.factoryCityMap) {
      for (const [k, v] of Object.entries(save.factoryCityMap)) {
        ctx.factoryCityMap.set(k, v);
      }
    }

    if (save.buildingNames) {
      for (const [k, v] of Object.entries(save.buildingNames)) {
        ctx.buildingNames.set(k, v);
      }
    }

    if (save.xp) {
      ctx.xpManager.deserialize(save.xp);
    }

    if (save.currencySymbol) {
      setCurrencySymbol(save.currencySymbol as CurrencySymbol);
    }

    this.pendingSave = save;
  }

  /** Called when entering a city — applies pending save data for that city */
  applyPendingCityData(cityId: string, cityView: CityView): void {
    if (!this.pendingSave) return;
    const ctx = this.ctx;

    // Restore purchased factory slots (keyed by slotKey e.g. "factory_0")
    const slotKeys = this.pendingSave.purchasedSlots[cityId];
    if (slotKeys) {
      const keySet = new Set(slotKeys);
      for (const slot of cityView.layout.factorySlots) {
        // Support both new format ("factory_0") and legacy format ("0,0")
        if (keySet.has(slot.slotKey) || keySet.has(slot.position.toKey())) {
          slot.purchased = true;
        }
      }
    }

    // Restore purchased storage slots
    const storageSlotKeys = this.pendingSave.purchasedStorageSlots?.[cityId];
    if (storageSlotKeys) {
      const keySet = new Set(storageSlotKeys);
      for (const slot of cityView.layout.storageSlots) {
        if (keySet.has(slot.slotKey) || keySet.has(slot.position.toKey())) {
          slot.purchased = true;
        }
      }
    }

    cityView.renderer.markDirty();

    // Restore storage data for this city
    if (this.pendingSave.storages) {
      for (const sd of this.pendingSave.storages) {
        if (!sd.key.startsWith(`${cityId}_`)) continue;
        // Extract slotKey from composite key (e.g. "bramfeld_storage_0" → "storage_0")
        const slotKey = sd.key.slice(cityId.length + 1);
        const slot = cityView.layout.storageSlots.find(
          s => s.slotKey === slotKey && s.purchased,
        );
        if (!slot) continue;

        // Use the canonical key (in case save used legacy format)
        const canonicalKey = `${cityId}_${slot.slotKey}`;
        let storage = ctx.storages.get(canonicalKey);
        if (!storage) {
          storage = new Storage(slot.cellCount);
          storage.setMarket(ctx.market);
          storage.setResourceRegistry(ctx.resourceRegistry);
          ctx.storages.set(canonicalKey, storage);
          ctx.tickEngine.register(storage);
        }
        (storage as any)._upgradeLevel = sd.upgradeLevel;
        for (const [resId, qty] of Object.entries(sd.inventory)) {
          storage.deposit(resId, qty);
        }
      }
    }

    // Restore factory entities
    for (const [factoryKey, factoryData] of Object.entries(this.pendingSave.factories)) {
      if (!factoryKey.startsWith(cityId + '_')) continue;

      // Extract slotKey from composite key (e.g. "bramfeld_factory_0" → "factory_0")
      const slotKey = factoryKey.slice(cityId.length + 1);
      const slot = cityView.layout.factorySlots.find(
        s => s.slotKey === slotKey && s.purchased,
      );
      if (!slot) continue;

      // Use the canonical key
      const canonicalKey = `${cityId}_${slot.slotKey}`;
      let factory = ctx.factories.get(canonicalKey);
      if (!factory) {
        const borderContext = ctx.computeBorderContext(slot, cityView.layout);
        factory = new Factory(canonicalKey, slot.toInteriorPolyomino(), borderContext);
        ctx.factories.set(canonicalKey, factory);
        ctx.factoryCityMap.set(canonicalKey, cityId);
        ctx.tickEngine.register(factory);
      }

      factory.restoreEntities(factoryData, (defId, pos) => {
        const def = ctx.machines.find(m => m.id === defId);
        if (!def) return null;
        return new Machine(def, pos, ctx.recipeRegistry, ctx.recipeBook);
      });
    }

    // Restore fleet data for this city
    if (this.pendingSave.fleets?.[cityId]) {
      const fleet = ctx.fleetManagers.get(cityId);
      if (fleet) {
        fleet.deserialize(this.pendingSave.fleets[cityId], cityView.layout.roadNetwork);
      }
    }
  }

  quickSave(): void {
    const data = this.buildSaveData();
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    console.log('[Save] Session saved');
  }

  loadSessionSave(): void {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    try {
      const save = JSON.parse(raw) as GameSaveData;
      if (save.version !== SAVE_VERSION) {
        console.warn('[Save] Version mismatch, ignoring save');
        return;
      }
      this.applySaveData(save);
      console.log('[Save] Session restored');
    } catch (e) {
      console.error('[Save] Failed to load session save:', e);
    }
  }

  exportSave(): void {
    const data = this.buildSaveData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `automastonks_save_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importSave(onRestart: () => void): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const save = JSON.parse(reader.result as string) as GameSaveData;
          localStorage.setItem(SAVE_KEY, JSON.stringify(save));
          onRestart();
        } catch {
          console.error('[Save] Failed to import save file');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  resetSave(onRestart: () => void): void {
    localStorage.removeItem(SAVE_KEY);
    this.ctx.saveManager.deleteSlot('quicksave');
    this.pendingSave = null;
    onRestart();
  }
}
