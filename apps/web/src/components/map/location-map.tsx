'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';
import { MAP_ATTRIBUTION, MAP_TILE_URL, MAP_ZOOM } from './map-config';

interface LocationMapProps {
  latitude: number;
  longitude: number;
  /** Radius of the uncertainty circle, in metres, when the device reported one. */
  accuracyMetres?: number;
  /** Read by screen readers; the map itself is a picture of the coordinates shown beside it. */
  label: string;
}

/**
 * A read-only map of one point. Leaflet is imported inside the effect because it reads `window`, which
 * does not exist while the page is rendered on the server. Nothing here asks the device for a location.
 */
export function LocationMap({ latitude, longitude, accuracyMetres, label }: LocationMapProps) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    let cancelled = false;
    let teardown: (() => void) | undefined;
    void import('leaflet').then((L) => {
      if (cancelled) return;
      const map = L.map(element, {
        center: [latitude, longitude],
        zoom: MAP_ZOOM,
        scrollWheelZoom: false,
      });
      L.tileLayer(MAP_TILE_URL, { attribution: MAP_ATTRIBUTION, maxZoom: 19 }).addTo(map);
      L.circleMarker([latitude, longitude], {
        radius: 8,
        color: '#2563eb',
        fillColor: '#2563eb',
        fillOpacity: 0.9,
      }).addTo(map);
      if (accuracyMetres !== undefined && accuracyMetres > 0) {
        L.circle([latitude, longitude], {
          radius: accuracyMetres,
          color: '#2563eb',
          weight: 1,
          fillOpacity: 0.1,
        }).addTo(map);
      }
      teardown = () => map.remove();
    });
    return () => {
      cancelled = true;
      teardown?.();
    };
  }, [latitude, longitude, accuracyMetres]);

  return (
    <div
      ref={container}
      role="img"
      aria-label={label}
      className="h-56 w-full overflow-hidden rounded-md border border-line"
    />
  );
}
