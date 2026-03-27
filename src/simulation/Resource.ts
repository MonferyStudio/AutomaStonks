export type ItemCategoryType = 'solid' | 'liquid' | 'fragile' | 'bulky';
export type ResourceShape = 'square' | 'rect' | 'circle' | 'cloud';
export type ResourceOrigin = 'natural' | 'processed' | 'manufactured' | 'waste';
export type ResourceMaterial = 'wood' | 'metal' | 'stone' | 'food' | 'fluid' | 'misc';

export interface ResourceDefinition {
  id: string;
  name: string;
  color: number;
  shape: ResourceShape;
  category: ItemCategoryType;
  origin: ResourceOrigin;
  material: ResourceMaterial;
  storageWeight: number;
  basePrice: number;
  sellPrice: number;
  tier: number;
  requiredLevel?: number;
}

export class ResourceRegistry {
  private resources = new Map<string, ResourceDefinition>();

  register(def: ResourceDefinition): void {
    this.resources.set(def.id, def);
  }

  get(id: string): ResourceDefinition | undefined {
    return this.resources.get(id);
  }

  getAll(): ResourceDefinition[] {
    return [...this.resources.values()];
  }

  loadFromData(data: ResourceDefinition[]): void {
    for (const def of data) {
      this.register(def);
    }
  }
}
