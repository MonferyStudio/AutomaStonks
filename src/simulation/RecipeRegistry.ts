import type { RecipeDefinition } from './Recipe';
import { DUST_RESOURCE_ID } from './Dust';

export class RecipeRegistry {
  private recipes = new Map<string, RecipeDefinition>();
  private lookupCache = new Map<string, RecipeDefinition | null>();

  register(recipe: RecipeDefinition): void {
    this.recipes.set(recipe.id, recipe);
    this.lookupCache.clear();
  }

  get(id: string): RecipeDefinition | undefined {
    return this.recipes.get(id);
  }

  findRecipe(machineType: string, inputResourceIds: string[]): RecipeDefinition | null {
    const key = this.buildLookupKey(machineType, inputResourceIds);
    if (this.lookupCache.has(key)) {
      return this.lookupCache.get(key)!;
    }

    const sortedInputs = [...inputResourceIds].sort();

    for (const recipe of this.recipes.values()) {
      if (recipe.machineType !== machineType) continue;

      const recipeInputIds = recipe.inputs.map((i) => i.resourceId).sort();
      if (recipeInputIds.length !== sortedInputs.length) continue;

      let match = true;
      for (let i = 0; i < recipeInputIds.length; i++) {
        if (recipeInputIds[i] !== sortedInputs[i]) {
          match = false;
          break;
        }
      }

      if (match) {
        this.lookupCache.set(key, recipe);
        return recipe;
      }
    }

    this.lookupCache.set(key, null);
    return null;
  }

  getDustOutputForMachine(machineType: string): RecipeDefinition {
    return {
      id: `dust_${machineType}`,
      machineType,
      inputs: [],
      outputs: [{ resourceId: DUST_RESOURCE_ID, quantity: 1 }],
      processingTicks: 10,
    };
  }

  getAll(): RecipeDefinition[] {
    return [...this.recipes.values()];
  }

  getByMachineType(machineType: string): RecipeDefinition[] {
    return [...this.recipes.values()].filter((r) => r.machineType === machineType);
  }

  loadFromData(data: RecipeDefinition[]): void {
    for (const recipe of data) {
      this.register(recipe);
    }
  }

  private buildLookupKey(machineType: string, inputResourceIds: string[]): string {
    return `${machineType}:${[...inputResourceIds].sort().join(',')}`;
  }
}
