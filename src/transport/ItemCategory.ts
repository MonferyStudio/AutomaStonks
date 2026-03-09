import type { ItemCategoryType } from '@/simulation/Resource';
import type { VehicleTypeDefinition } from './VehicleType';

export function canTransport(
  vehicleType: VehicleTypeDefinition,
  itemCategory: ItemCategoryType,
): boolean {
  return vehicleType.transportableCategories.includes(itemCategory);
}
