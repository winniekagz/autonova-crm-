/**
 * Tile server for the check-in map. The public OpenStreetMap server is acceptable for development and
 * light internal use only (its usage policy forbids heavy use); production needs a hosted tile provider,
 * set through NEXT_PUBLIC_MAP_TILE_URL at build time. See docs/flows/sales-activities.md.
 */
export const MAP_TILE_URL =
  process.env.NEXT_PUBLIC_MAP_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export const MAP_ATTRIBUTION =
  process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ??
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export const MAP_ZOOM = 16;
