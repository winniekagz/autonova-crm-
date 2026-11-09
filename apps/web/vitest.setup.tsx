import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

// Leaflet needs a real browser layout; specs assert on what is passed to the map instead.
vi.mock('@/components/map/location-map', () => ({
  LocationMap: ({
    latitude,
    longitude,
    label,
  }: {
    latitude: number;
    longitude: number;
    label: string;
  }) => <div role="img" aria-label={label} data-lat={latitude} data-lng={longitude} />,
}));

// Only meaningful (and only importable) in jsdom specs.
afterEach(async () => {
  if (typeof document !== 'undefined') {
    const { cleanup } = await import('@testing-library/react');
    cleanup();
  }
});
