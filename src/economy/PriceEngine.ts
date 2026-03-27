import type { ITickable } from '@/interfaces/ITickable';
import type { ResourceRegistry, ResourceDefinition } from '@/simulation/Resource';
import { eventBus } from '@/core/EventBus';

/** Number of price history entries to keep per resource */
const HISTORY_LENGTH = 60;
/** Ticks between price updates */
const UPDATE_INTERVAL = 100; // 10 seconds at 10 ticks/s
/** Maximum price deviation from base (±%) */
const MAX_DEVIATION = 0.35;
/** How quickly prices drift toward base (0-1, lower = slower) */
const MEAN_REVERSION = 0.02;

export interface PriceSnapshot {
  buy: number;
  sell: number;
  timestamp: number;
}

export class PriceEngine implements ITickable {
  sleeping = false;
  private resourceRegistry: ResourceRegistry;

  /** Current price modifiers per resource (1.0 = base price) */
  private modifiers = new Map<string, number>();
  /** Price history per resource (most recent last) */
  private history = new Map<string, PriceSnapshot[]>();
  /** Internal tick counter */
  private tickCount = 0;
  /** Noise phase offsets per resource (for different oscillation patterns) */
  private phaseOffsets = new Map<string, number>();

  /** Supply/demand pressure: positive = oversupply (prices drop), negative = high demand (prices rise) */
  private supplyPressure = new Map<string, number>();

  constructor(resourceRegistry: ResourceRegistry) {
    this.resourceRegistry = resourceRegistry;
    this.initModifiers();
  }

  private initModifiers(): void {
    for (const res of this.resourceRegistry.getAll()) {
      this.modifiers.set(res.id, 1.0);
      this.history.set(res.id, []);
      this.phaseOffsets.set(res.id, Math.random() * Math.PI * 2);
    }
  }

  /** Get current buy price for a resource */
  getBuyPrice(resourceId: string): number {
    const def = this.resourceRegistry.get(resourceId);
    if (!def || def.basePrice <= 0) return 0;
    const mod = this.modifiers.get(resourceId) ?? 1.0;
    return Math.max(1, Math.round(def.basePrice * mod));
  }

  /** Get current sell price for a resource */
  getSellPrice(resourceId: string): number {
    const def = this.resourceRegistry.get(resourceId);
    if (!def) return 0;
    const mod = this.modifiers.get(resourceId) ?? 1.0;
    return Math.max(1, Math.round(def.sellPrice * mod));
  }

  /** Get the current modifier for a resource (1.0 = base) */
  getModifier(resourceId: string): number {
    return this.modifiers.get(resourceId) ?? 1.0;
  }

  /** Get price history for a resource */
  getHistory(resourceId: string): readonly PriceSnapshot[] {
    return this.history.get(resourceId) ?? [];
  }

  /** Report a trade event — affects supply/demand pressure */
  reportBuy(resourceId: string, qty: number): void {
    const current = this.supplyPressure.get(resourceId) ?? 0;
    // Buying reduces supply → prices should increase
    this.supplyPressure.set(resourceId, current - qty * 0.01);
  }

  reportSell(resourceId: string, qty: number): void {
    const current = this.supplyPressure.get(resourceId) ?? 0;
    // Selling increases supply → prices should decrease
    this.supplyPressure.set(resourceId, current + qty * 0.005);
  }

  onTick(deltaTicks: number): void {
    this.tickCount += deltaTicks;

    if (this.tickCount >= UPDATE_INTERVAL) {
      this.tickCount -= UPDATE_INTERVAL;
      this.updatePrices();
    }
  }

  private updatePrices(): void {
    const time = Date.now() / 1000;

    for (const res of this.resourceRegistry.getAll()) {
      const current = this.modifiers.get(res.id) ?? 1.0;
      const phase = this.phaseOffsets.get(res.id) ?? 0;

      // Sinusoidal base oscillation (slow wave)
      const slowWave = Math.sin(time * 0.01 + phase) * 0.08;
      // Faster secondary wave
      const fastWave = Math.sin(time * 0.04 + phase * 2.7) * 0.04;
      // Random noise
      const noise = (Math.random() - 0.5) * 0.03;

      // Supply/demand pressure
      const pressure = this.supplyPressure.get(res.id) ?? 0;

      // Target modifier: base (1.0) + waves + pressure
      let target = 1.0 + slowWave + fastWave + noise - pressure;

      // Clamp target
      target = Math.max(1.0 - MAX_DEVIATION, Math.min(1.0 + MAX_DEVIATION, target));

      // Smooth toward target with mean reversion
      const newMod = current + (target - current) * MEAN_REVERSION;

      this.modifiers.set(res.id, newMod);

      // Decay supply pressure toward 0
      if (pressure !== 0) {
        this.supplyPressure.set(res.id, pressure * 0.95);
      }

      // Record history snapshot
      const hist = this.history.get(res.id);
      if (hist) {
        hist.push({
          buy: this.getBuyPrice(res.id),
          sell: this.getSellPrice(res.id),
          timestamp: Date.now(),
        });
        while (hist.length > HISTORY_LENGTH) {
          hist.shift();
        }
      }
    }

    eventBus.emit('PricesUpdated', {});
  }

  wake(): void { this.sleeping = false; }
  sleep(): void { this.sleeping = true; }
}
