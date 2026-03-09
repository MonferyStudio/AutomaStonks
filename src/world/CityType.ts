export interface CityTypeDefinition {
  id: string;
  name: string;
  color: number;
  bgColor: number;
  factorySlots: number;
  shopSlots: number;
  marketModifiers: Record<string, number>;
  description: string;
  hasPort: boolean;
  hasRailway: boolean;
  hasAirport: boolean;
  /** Biomes where this city type can spawn */
  biomes: string[];
}

export const CITY_TYPES: Record<string, CityTypeDefinition> = {
  forest: {
    id: 'forest',
    name: 'Forest Town',
    color: 0x2d5a27,
    bgColor: 0x152a32,
    factorySlots: 4,
    shopSlots: 3,
    marketModifiers: { wood_log: 0.7, plank: 0.85 },
    description: 'Wood -30%, limited shops',
    hasPort: false,
    hasRailway: true,
    hasAirport: false,
    biomes: ['forest', 'dense_forest'],
  },
  coastal: {
    id: 'coastal',
    name: 'Coastal City',
    color: 0x2980b9,
    bgColor: 0x141e34,
    factorySlots: 3,
    shopSlots: 4,
    marketModifiers: {},
    description: 'Port access, limited factories',
    hasPort: true,
    hasRailway: true,
    hasAirport: false,
    biomes: ['beach'],
  },
  industrial: {
    id: 'industrial',
    name: 'Industrial Zone',
    color: 0x7f8c8d,
    bgColor: 0x17192e,
    factorySlots: 7,
    shopSlots: 3,
    marketModifiers: { iron_ore: 1.2, wood_log: 1.15 },
    description: '+2 factory slots, raw materials +15-20%',
    hasPort: false,
    hasRailway: true,
    hasAirport: false,
    biomes: ['plains', 'hills'],
  },
  agricultural: {
    id: 'agricultural',
    name: 'Farm Village',
    color: 0x8bc34a,
    bgColor: 0x162232,
    factorySlots: 3,
    shopSlots: 3,
    marketModifiers: { wheat: 0.7, tomato: 0.7, olive: 0.7, water: 0.5 },
    description: 'Crops -30%, small factories only',
    hasPort: false,
    hasRailway: false,
    hasAirport: false,
    biomes: ['plains', 'forest'],
  },
  mining: {
    id: 'mining',
    name: 'Mining Outpost',
    color: 0x795548,
    bgColor: 0x18192e,
    factorySlots: 4,
    shopSlots: 2,
    marketModifiers: { iron_ore: 0.7 },
    description: 'Ore -30%, restricted terrain',
    hasPort: false,
    hasRailway: true,
    hasAirport: false,
    biomes: ['mountains', 'hills', 'snow'],
  },
  metropolis: {
    id: 'metropolis',
    name: 'Metropolis',
    color: 0xe8e8e8,
    bgColor: 0x191932,
    factorySlots: 5,
    shopSlots: 8,
    marketModifiers: {},
    description: 'Many shops, +20% sell price, everything costs more',
    hasPort: true,
    hasRailway: true,
    hasAirport: true,
    biomes: ['plains', 'beach', 'hills'],
  },
};
