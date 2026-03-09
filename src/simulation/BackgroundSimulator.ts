import type { Factory } from './Factory';
import { ThroughputCalculator } from './ThroughputCalculator';

export class BackgroundSimulator {
  private factories = new Map<string, Factory>();
  private throughputCalc = new ThroughputCalculator();
  private inputBuffers = new Map<string, Map<string, number>>();
  private outputBuffers = new Map<string, Map<string, number>>();

  register(factory: Factory): void {
    this.factories.set(factory.id, factory);
    this.inputBuffers.set(factory.id, new Map());
    this.outputBuffers.set(factory.id, new Map());
  }

  unregister(factoryId: string): void {
    this.factories.delete(factoryId);
    this.inputBuffers.delete(factoryId);
    this.outputBuffers.delete(factoryId);
    this.throughputCalc.invalidate(factoryId);
  }

  addInput(factoryId: string, resourceId: string, quantity: number): void {
    const buffer = this.inputBuffers.get(factoryId);
    if (!buffer) return;
    buffer.set(resourceId, (buffer.get(resourceId) ?? 0) + quantity);
  }

  extractOutput(factoryId: string, resourceId: string, maxQuantity: number): number {
    const buffer = this.outputBuffers.get(factoryId);
    if (!buffer) return 0;

    const available = buffer.get(resourceId) ?? 0;
    const taken = Math.min(available, maxQuantity);
    buffer.set(resourceId, available - taken);
    return taken;
  }

  tick(): void {
    for (const [factoryId, factory] of this.factories) {
      const throughput = this.throughputCalc.calculate(factory);
      const inputs = this.inputBuffers.get(factoryId)!;
      const outputs = this.outputBuffers.get(factoryId)!;

      for (const t of throughput) {
        let canProduce = true;

        for (const [resId, rate] of t.inputsPerTick) {
          const available = inputs.get(resId) ?? 0;
          if (available < rate) {
            canProduce = false;
            break;
          }
        }

        if (!canProduce) continue;

        for (const [resId, rate] of t.inputsPerTick) {
          inputs.set(resId, (inputs.get(resId) ?? 0) - rate);
        }

        for (const [resId, rate] of t.outputsPerTick) {
          outputs.set(resId, (outputs.get(resId) ?? 0) + rate);
        }
      }
    }
  }

  getOutputBuffer(factoryId: string): Map<string, number> {
    return this.outputBuffers.get(factoryId) ?? new Map();
  }

  getInputBuffer(factoryId: string): Map<string, number> {
    return this.inputBuffers.get(factoryId) ?? new Map();
  }
}
