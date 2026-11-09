'use client';

import { Alert } from '@/components/ui/alert';
import { LocationMap } from '@/components/map/location-map';
import { Button } from '@/components/ui/button';
import { useGeolocation } from '@/hooks/use-geolocation';
import type { GpsFix } from './activity-input';

const PROBLEM: Record<'denied' | 'unavailable' | 'timeout', string> = {
  denied:
    'Location access was declined, so no check-in was added. You can still save the report, or allow location for this site in your browser and try again.',
  unavailable:
    'Your location is not available on this device right now. You can still save the report.',
  timeout: 'Finding your location took too long. You can try again, or save the report without it.',
};

interface GpsCheckInProps {
  /** A check-in already saved with the report, shown until replaced or removed. */
  value: GpsFix | null;
  onChange: (fix: GpsFix | null) => void;
}

/** Optional site-visit check-in. It asks the device for one position, only when the button is pressed. */
export function GpsCheckIn({ value, onChange }: GpsCheckInProps) {
  const { state, locate, clear } = useGeolocation();

  return (
    <div className="space-y-2 rounded-md border border-line bg-canvas p-3 sm:col-span-2">
      <p className="text-[13px] font-medium text-ink">Location check-in (optional)</p>
      <p className="text-xs text-ink-soft">
        Records where you are right now, once, so the report shows you were on site. Your location
        is only requested when you press the button, and is saved with this report only.
      </p>
      {value ? (
        <>
          <p className="text-sm">
            Checked in at {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}
          </p>
          <LocationMap
            latitude={value.latitude}
            longitude={value.longitude}
            label="Map of the saved check-in"
          />
        </>
      ) : null}
      {state.status === 'locating' ? (
        <p role="status" className="text-sm text-ink-soft">
          Finding your location…
        </p>
      ) : null}
      {state.status === 'denied' || state.status === 'unavailable' || state.status === 'timeout' ? (
        <Alert tone="warning">{PROBLEM[state.status]}</Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={state.status === 'locating'}
          onClick={() => {
            locate();
          }}
        >
          {value ? 'Update check-in' : 'Check in here'}
        </Button>
        {value ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              clear();
              onChange(null);
            }}
          >
            Remove check-in
          </Button>
        ) : null}
      </div>
      <GpsResult state={state} onAccept={onChange} />
    </div>
  );
}

function GpsResult({
  state,
  onAccept,
}: {
  state: ReturnType<typeof useGeolocation>['state'];
  onAccept: (fix: GpsFix) => void;
}) {
  if (state.status !== 'ready') return null;
  const fix = { latitude: state.latitude, longitude: state.longitude };
  return (
    <div className="space-y-2">
      <p className="text-sm">
        Found you at {fix.latitude.toFixed(5)}, {fix.longitude.toFixed(5)} (within about{' '}
        {Math.round(state.accuracyMetres)} m).
      </p>
      <LocationMap
        latitude={fix.latitude}
        longitude={fix.longitude}
        accuracyMetres={state.accuracyMetres}
        label="Map of the position found"
      />
      <Button type="button" onClick={() => onAccept(fix)}>
        Use this location
      </Button>
    </div>
  );
}
