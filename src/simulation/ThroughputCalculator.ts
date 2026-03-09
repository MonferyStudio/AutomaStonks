import type { Factory } from './Factory';
import type { RecipeDefinition } from './Recipe';

export interface ThroughputData {
  recipeId: string;
  inputsPerTick: Map<string, number>;
  outputsPerTick: Map<string, number>;
}

export class ThroughputCalculator {
  private cache = new Map<string, { version: number; data: ThroughputData[] }>();

  calculate(factory: Factory): ThroughputData[] {
    const cached = this.cache.get(factory.id);
    if (cached && cached.version === factory.layoutVersion) {
      return cached.data;
    }

    const data = this.analyzeFactory(factory);
    this.cache.set(factory.id, { version: factory.layoutVersion, data });
    return data;
  }

  private analyzeFactory(factory: Factory): ThroughputData[] {
    const machines = factory.getMachines();
    const results: ThroughputData[] = [];

    for (const machine of machines) {
      if (machine.state === 'idle' || machine.state === 'blocked') continue;

      const recipe = this.getActiveRecipe(machine);
      if (!recipe) continue;

      const ticksPerCycle = recipe.processingTicks;
      const inputsPerTick = new Map<string, number>();
      const outputsPerTick = new Map<string, number>();

      for (const input of recipe.inputs) {
        inputsPerTick.set(input.resourceId, input.quantity / ticksPerCycle);
      }
      for (const output of recipe.outputs) {
        outputsPerTick.set(output.resourceId, output.quantity / ticksPerCycle);
      }

      results.push({ recipeId: recipe.id, inputsPerTick, outputsPerTick });
    }

    return results;
  }

  private getActiveRecipe(machine: { state: string; definition: { operationType: string } }): RecipeDefinition | null {
    return null;
  }

  invalidate(factoryId: string): void {
    this.cache.delete(factoryId);
  }

  invalidateAll(): void {
    this.cache.clear();
  }
}
