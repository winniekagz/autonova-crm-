'use client';

import { useEffect, useState } from 'react';

/** The value after it has stopped changing for `delayMs`; keeps a search box from querying on every key. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  // A timer is an external system, so this is genuine synchronisation rather than derived state.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
