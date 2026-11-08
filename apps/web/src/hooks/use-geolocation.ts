'use client';

import { useState } from 'react';

export type GeoState =
  | { status: 'idle' }
  | { status: 'locating' }
  | { status: 'ready'; latitude: number; longitude: number; accuracyMetres: number }
  | { status: 'denied' }
  | { status: 'unavailable' }
  | { status: 'timeout' };

/**
 * One-off location check-in. Nothing is requested until `locate` is called from a button; there is no
 * watching, no background updates and no fallback guess from an IP address. `clear` forgets the fix.
 */
export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ status: 'idle' });

  const locate = () => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setState({ status: 'unavailable' });
      return;
    }
    setState({ status: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setState({
          status: 'ready',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMetres: position.coords.accuracy,
        }),
      (error) =>
        setState({
          status:
            error.code === error.PERMISSION_DENIED
              ? 'denied'
              : error.code === error.TIMEOUT
                ? 'timeout'
                : 'unavailable',
        }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  };

  return { state, locate, clear: () => setState({ status: 'idle' }) };
}
