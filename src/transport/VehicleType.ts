import type { ItemCategoryType } from '@/simulation/Resource';

export interface VehicleTypeDefinition {
  id: string;
  name: string;
  scope: 'intra' | 'inter' | 'both';
  capacity: number;
  speed: number;
  costPerTrip: number;
  purchaseCost: number;
  transportableCategories: ItemCategoryType[];
  color: number;
  requiresPort?: boolean;
  requiresRailway?: boolean;
  requiresAirport?: boolean;
}

export const VEHICLE_TYPES: Record<string, VehicleTypeDefinition> = {
  truck: {
    id: 'truck',
    name: 'Truck',
    scope: 'both',
    capacity: 10,
    speed: 2,
    costPerTrip: 3,
    purchaseCost: 50,
    transportableCategories: ['solid', 'bulky'],
    color: 0xff8c42,
  },
  train: {
    id: 'train',
    name: 'Train',
    scope: 'inter',
    capacity: 40,
    speed: 2,
    costPerTrip: 8,
    purchaseCost: 200,
    transportableCategories: ['solid', 'bulky', 'liquid'],
    color: 0x4dc9f6,
    requiresRailway: true,
  },
  boat: {
    id: 'boat',
    name: 'Boat',
    scope: 'inter',
    capacity: 60,
    speed: 1,
    costPerTrip: 5,
    purchaseCost: 300,
    transportableCategories: ['solid', 'bulky', 'liquid', 'fragile'],
    color: 0x2980b9,
    requiresPort: true,
  },
  plane: {
    id: 'plane',
    name: 'Plane',
    scope: 'inter',
    capacity: 8,
    speed: 5,
    costPerTrip: 15,
    purchaseCost: 500,
    transportableCategories: ['solid', 'fragile'],
    color: 0xe8e8e8,
    requiresAirport: true,
  },
};
