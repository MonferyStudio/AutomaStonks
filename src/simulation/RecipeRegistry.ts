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

      // Expand recipe inputs by quantity: [{resourceId:"leaf", quantity:2}] → ["leaf","leaf"]
      const expandedRecipeIds: string[] = [];
      for (const inp of recipe.inputs) {
        for (let q = 0; q < inp.quantity; q++) {
          expandedRecipeIds.push(inp.resourceId);
        }
      }
      expandedRecipeIds.sort();

      if (expandedRecipeIds.length !== sortedInputs.length) continue;

      let match = true;
      for (let i = 0; i < expandedRecipeIds.length; i++) {
        if (expandedRecipeIds[i] !== sortedInputs[i]) {
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

  /**
   * Check if the given inputs could partially match any recipe for this machine type.
   * Returns true if there exists a recipe where the provided inputs are a subset
   * (by resource id and quantity) of the recipe's required inputs.
   */
  hasPartialMatch(machineType: string, inputResourceIds: string[]): boolean {
    // Build available quantities from the expanded input list
    const available = new Map<string, number>();
    for (const id of inputResourceIds) {
      available.set(id, (available.get(id) ?? 0) + 1);
    }

    for (const recipe of this.recipes.values()) {
      if (recipe.machineType !== machineType) continue;

      // Check if every available resource is required by this recipe,
      // and quantities don't exceed what's needed
      let couldMatch = true;
      for (const [resId, qty] of available) {
        const needed = recipe.inputs
          .filter(i => i.resourceId === resId)
          .reduce((sum, i) => sum + i.quantity, 0);
        if (qty > needed || needed === 0) {
          couldMatch = false;
          break;
        }
      }
      if (couldMatch) return true;
    }
    return false;
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
