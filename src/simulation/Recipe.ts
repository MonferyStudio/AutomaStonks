export interface RecipeInput {
  resourceId: string;
  quantity: number;
}

export interface RecipeOutput {
  resourceId: string;
  quantity: number;
}

export interface RecipeDefinition {
  id: string;
  machineType: string;
  inputs: RecipeInput[];
  outputs: RecipeOutput[];
  processingTicks: number;
}
