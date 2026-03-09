import type { ITickable } from '@/interfaces/ITickable';
import { eventBus } from './EventBus';
import { TICK_RATE, TICK_INTERVAL_MS, MAX_CATCHUP_TICKS } from '@/utils/Constants';

export class TickEngine {
  private tickables = new Set<ITickable>();
  private tickNumber = 0;
  private accumulator = 0;
  private running = false;
  private _tickRate = TICK_RATE;
  private _tickIntervalMs = TICK_INTERVAL_MS;

  get currentTick(): number {
    return this.tickNumber;
  }

  get tickRate(): number {
    return this._tickRate;
  }

  set tickRate(rate: number) {
    this._tickRate = rate;
    this._tickIntervalMs = 1000 / rate;
  }

  get interpolationAlpha(): number {
    return this.accumulator / this._tickIntervalMs;
  }

  register(tickable: ITickable): void {
    this.tickables.add(tickable);
  }

  unregister(tickable: ITickable): void {
    this.tickables.delete(tickable);
  }

  start(): void {
    this.running = true;
    this.accumulator = 0;
  }

  stop(): void {
    this.running = false;
  }

  update(deltaMs: number): number {
    if (!this.running) return 0;

    this.accumulator += deltaMs;

    let ticksProcessed = 0;
    const maxAccumulator = this._tickIntervalMs * MAX_CATCHUP_TICKS;
    if (this.accumulator > maxAccumulator) {
      this.accumulator = maxAccumulator;
    }

    while (this.accumulator >= this._tickIntervalMs) {
      this.accumulator -= this._tickIntervalMs;
      this.tick();
      ticksProcessed++;
    }

    return ticksProcessed;
  }

  private tick(): void {
    this.tickNumber++;

    for (const tickable of this.tickables) {
      if (!tickable.sleeping) {
        tickable.onTick(1);
      }
    }

    eventBus.emit('TickCompleted', { tickNumber: this.tickNumber });
  }

  reset(): void {
    this.tickNumber = 0;
    this.accumulator = 0;
    this.tickables.clear();
  }
}
