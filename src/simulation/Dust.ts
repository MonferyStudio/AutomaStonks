import type { ResourceDefinition } from './Resource';

export const DUST_RESOURCE_ID = 'dust';

export const DUST_DEFINITION: ResourceDefinition = {
  id: DUST_RESOURCE_ID,
  name: 'Dust',
  color: 0x8892a4,
  shape: 'cloud',
  category: 'solid',
  basePrice: 0,
  sellPrice: 1,
  tier: 0,
};
