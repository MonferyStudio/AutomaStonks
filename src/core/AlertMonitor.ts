import { eventBus } from './EventBus';
import type { NotificationSystem } from '@/ui/NotificationSystem';
import type { Factory } from '@/simulation/Factory';
import type { Storage } from '@/simulation/Storage';

export interface BuildingAlert {
  slotKey: string;
  type: 'empty_storage' | 'starved_input' | 'output_full';
  message: string;
}

const CHECK_INTERVAL_TICKS = 50; // every 5 seconds at 10 tps
const STARVE_THRESHOLD_TICKS = 100; // 10 seconds without items

export class AlertMonitor {
  private notifications: NotificationSystem;
  private factories: Map<string, Factory>;
  private storages: Map<string, Storage>;
  private factoryCityMap: Map<string, string>;
  private tickCount = 0;
  private unsub: (() => void) | null = null;

  /** Track how many ticks each input port has been empty */
  private inputStarvation = new Map<string, number>(); // portId → ticks empty

  /** Active building alerts for city overlay rendering */
  readonly buildingAlerts = new Map<string, BuildingAlert>(); // slotKey → alert

  /** Set of recently fired alert messages (to avoid spamming) */
  private recentAlerts = new Map<string, number>(); // message → tick when fired
  private static COOLDOWN_TICKS = 300; // 30 seconds between repeats

  constructor(
    notifications: NotificationSystem,
    factories: Map<string, Factory>,
    storages: Map<string, Storage>,
    factoryCityMap: Map<string, string>,
  ) {
    this.notifications = notifications;
    this.factories = factories;
    this.storages = storages;
    this.factoryCityMap = factoryCityMap;
  }

  start(): void {
    this.unsub = eventBus.on('TickCompleted', ({ tickNumber }) => {
      this.tickCount = tickNumber;
      this.trackStarvation();
      if (tickNumber % CHECK_INTERVAL_TICKS === 0) {
        this.runChecks();
      }
    });
  }

  stop(): void {
    this.unsub?.();
    this.unsub = null;
  }

  private trackStarvation(): void {
    for (const [factoryKey, factory] of this.factories) {
      for (const port of factory.getIOPorts()) {
        if (port.portType === 'input') {
          const key = `${factoryKey}_${port.id}`;
          if (!port.hasItem()) {
            this.inputStarvation.set(key, (this.inputStarvation.get(key) ?? 0) + 1);
          } else {
            this.inputStarvation.set(key, 0);
          }
        }
      }
    }
  }

  private runChecks(): void {
    this.buildingAlerts.clear();

    this.checkEmptyStorages();
    this.checkStarvedInputs();
    this.checkFullOutputs();

    // Clean old cooldowns
    for (const [msg, tick] of this.recentAlerts) {
      if (this.tickCount - tick > AlertMonitor.COOLDOWN_TICKS) {
        this.recentAlerts.delete(msg);
      }
    }
  }

  private fireAlert(slotKey: string, alert: BuildingAlert): void {
    this.buildingAlerts.set(slotKey, alert);

    if (!this.recentAlerts.has(alert.message)) {
      this.recentAlerts.set(alert.message, this.tickCount);
      this.notifications.push('warning', alert.message);
    }
  }

  private checkEmptyStorages(): void {
    for (const [key, storage] of this.storages) {
      if (storage.getInventory().size === 0) {
        // Composite key format: "{cityId}_{slotKey}" e.g. "bramfeld_storage_0"
        // Extract slotKey by matching "_storage_" pattern
        const match = key.match(/_?(storage_\d+)$/);
        const slotKey = match?.[1];
        if (slotKey) {
          this.fireAlert(slotKey, {
            slotKey,
            type: 'empty_storage',
            message: `Storage is empty`,
          });
        }
      }
    }
  }

  private checkStarvedInputs(): void {
    for (const [factoryKey, factory] of this.factories) {
      for (const port of factory.getIOPorts()) {
        if (port.portType !== 'input' || !port.resourceFilter) continue;
        const starvKey = `${factoryKey}_${port.id}`;
        const ticks = this.inputStarvation.get(starvKey) ?? 0;
        if (ticks >= STARVE_THRESHOLD_TICKS) {
          // Extract slotKey from factoryKey: "{cityId}_{slotKey}" e.g. "bramfeld_factory_0"
          const cityId = this.factoryCityMap.get(factoryKey);
          const slotKey = cityId ? factoryKey.slice(cityId.length + 1) : factoryKey;
          this.fireAlert(slotKey, {
            slotKey,
            type: 'starved_input',
            message: `Factory not receiving ${port.resourceFilter}`,
          });
        }
      }
    }
  }

  private checkFullOutputs(): void {
    for (const [factoryKey, factory] of this.factories) {
      for (const port of factory.getIOPorts()) {
        if (port.portType !== 'output') continue;
        if (!port.canAcceptItem()) {
          const cityId = this.factoryCityMap.get(factoryKey);
          const slotKey = cityId ? factoryKey.slice(cityId.length + 1) : factoryKey;
          this.fireAlert(slotKey, {
            slotKey,
            type: 'output_full',
            message: `Factory output is full`,
          });
        }
      }
    }
  }

  destroy(): void {
    this.stop();
    this.buildingAlerts.clear();
    this.inputStarvation.clear();
    this.recentAlerts.clear();
  }
}
