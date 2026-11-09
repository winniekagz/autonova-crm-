'use client';

import { useState } from 'react';
import { LocationMap } from '@/components/map/location-map';
import { Button } from '@/components/ui/button';

/**
 * A saved check-in. The map (and its tile requests to the map provider) loads only when asked for,
 * so a long timeline does not send every visit's coordinates to a third party on page load.
 */
export function ActivityGpsMap({ latitude, longitude }: { latitude: number; longitude: number }) {
  const [shown, setShown] = useState(false);
  const text = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  return (
    <div className="mt-2">
      <dt className="text-xs text-ink-soft">Check-in</dt>
      <dd className="mt-1 space-y-2 text-sm">
        <p>{text}</p>
        {shown ? (
          <LocationMap
            latitude={latitude}
            longitude={longitude}
            label={`Map of the check-in at ${text}`}
          />
        ) : null}
        <Button
          type="button"
          variant="secondary"
          aria-expanded={shown}
          onClick={() => setShown((open) => !open)}
        >
          {shown ? 'Hide map' : 'Show map'}
        </Button>
      </dd>
    </div>
  );
}
