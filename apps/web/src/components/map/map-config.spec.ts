import { describe, expect, it } from 'vitest';
import { MAP_ATTRIBUTION, MAP_TILE_URL } from './map-config';

describe('map configuration', () => {
  it('defaults to OpenStreetMap tiles, with the attribution their licence requires', () => {
    expect(MAP_TILE_URL).toContain('{z}/{x}/{y}');
    expect(MAP_TILE_URL.startsWith('https://')).toBe(true);
    expect(MAP_ATTRIBUTION).toContain('OpenStreetMap');
  });
});
