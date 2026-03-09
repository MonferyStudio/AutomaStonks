import type { CityTypeDefinition } from '@/world/CityType';
import type { PolyominoRegistry } from '@/simulation/PolyominoRegistry';
import { CityGenerator, type CityLayout } from './CityGenerator';
import {
  deserializeCityLayout,
  parseBgColor,
  type CityLayoutData,
} from './CityLayoutData';

// Vite eager glob: imports all city JSON files at build time
const cityModules = import.meta.glob<CityLayoutData>(
  '@/data/cities/*.json',
  { eager: true, import: 'default' },
);

/** Map city IDs to their loaded JSON data */
const cityDataCache = new Map<string, CityLayoutData>();

// Parse the glob results into the cache
for (const [path, data] of Object.entries(cityModules)) {
  // path looks like "/src/data/cities/city_bramfeld.json"
  const match = path.match(/\/([^/]+)\.json$/);
  if (match) {
    cityDataCache.set(match[1], data);
  }
}

export interface LoadedCity {
  layout: CityLayout;
  bgColor?: number;
  fromJson: boolean;
}

/**
 * Load a city layout: from JSON if available, otherwise generate procedurally.
 */
export function loadCityLayout(
  cityId: string,
  cityType: CityTypeDefinition,
  polyRegistry: PolyominoRegistry,
  seed?: number,
  unlockCost: number = 0,
  forceGenerate: boolean = false,
): LoadedCity {
  const data = forceGenerate ? undefined : cityDataCache.get(cityId);

  if (data) {
    const layout = deserializeCityLayout(data);
    const bgColor = parseBgColor(data);
    return { layout, bgColor, fromJson: true };
  }

  // Fallback: procedural generation
  const generator = new CityGenerator(polyRegistry);
  const layout = generator.generate(cityType, seed, unlockCost);
  return { layout, bgColor: undefined, fromJson: false };
}

/** Check if a city has a JSON layout file */
export function hasCityJson(cityId: string): boolean {
  return cityDataCache.has(cityId);
}

/** Get all city IDs that have JSON files */
export function getPersistedCityIds(): string[] {
  return [...cityDataCache.keys()];
}
