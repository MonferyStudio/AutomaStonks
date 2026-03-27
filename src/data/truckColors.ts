/** Truck color palette definitions.
 *  Each variant has a dark and light shade used for the truck body.
 *  The red spritesheet is used as the base for palette-swapping at runtime. */
export interface TruckColorDef {
  id: string;
  name: string;
  dark: number;   // body dark shade (hex)
  light: number;  // body light shade (hex)
}

/** Source colors in the small_truck spritesheet that get replaced */
export const TRUCK_BASE_DARK  = 0x7d2a2c;
export const TRUCK_BASE_LIGHT = 0xd04648;

export const TRUCK_COLORS: TruckColorDef[] = [
  { id: 'red',    name: 'Red',    dark: 0x7d2a2c, light: 0xd04648 },
  { id: 'blue',   name: 'Blue',   dark: 0x2858a9, light: 0x3b7ddb },
  { id: 'green',  name: 'Green',  dark: 0x2d8e3f, light: 0x3db850 },
  { id: 'yellow', name: 'Yellow', dark: 0xc29218, light: 0xe8b620 },
  { id: 'purple', name: 'Purple', dark: 0x7b3594, light: 0x9d45ba },
  { id: 'orange', name: 'Orange', dark: 0xc45c24, light: 0xe87830 },
  { id: 'cyan',   name: 'Cyan',   dark: 0x1a8a8a, light: 0x22b2b2 },
  { id: 'pink',   name: 'Pink',   dark: 0xb03070, light: 0xd84090 },
  { id: 'brown',  name: 'Brown',  dark: 0x7a4f30, light: 0x9c6840 },
  { id: 'grey',   name: 'Grey',   dark: 0x8c9aaa, light: 0xb0c0d0 },
];

export function getTruckColor(id: string): TruckColorDef {
  return TRUCK_COLORS.find(c => c.id === id) ?? TRUCK_COLORS[0];
}
