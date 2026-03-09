import type { ISerializable } from '@/interfaces/ISerializable';
import { eventBus } from '@/core/EventBus';

export class RecipeBook implements ISerializable<string[]> {
  private discovered = new Set<string>();

  discover(recipeId: string): boolean {
    if (this.discovered.has(recipeId)) return false;
    this.discovered.add(recipeId);
    eventBus.emit('RecipeDiscovered', { recipeId });
    return true;
  }

  isDiscovered(recipeId: string): boolean {
    return this.discovered.has(recipeId);
  }

  getDiscoveredRecipes(): string[] {
    return [...this.discovered];
  }

  get count(): number {
    return this.discovered.size;
  }

  serialize(): string[] {
    return [...this.discovered];
  }

  deserialize(data: string[]): void {
    this.discovered.clear();
    for (const id of data) {
      this.discovered.add(id);
    }
  }
}
