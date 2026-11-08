import { useSyncExternalStore } from 'react';
import { vi } from 'vitest';

/**
 * A stand-in for `next/navigation` with a real, reactive URL, so components that keep their state
 * in the query string can be tested end to end: pushing a URL re-renders every subscriber.
 *
 * In a spec: `vi.mock('next/navigation', async () => (await import('@/test/navigation')).navigationMock);`
 * and call `resetNavigation('/users?page=2')` in `beforeEach`.
 */
let current = new URL('http://localhost/');
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => current.pathname + current.search;

function navigate(href: string) {
  current = new URL(href, 'http://localhost');
  listeners.forEach((listener) => listener());
}

/** Spies for assertions: every `push` and `replace` the component performed. */
export const router = {
  push: vi.fn((href: string) => navigate(href)),
  replace: vi.fn((href: string) => navigate(href)),
};

export function resetNavigation(href = '/') {
  router.push.mockClear();
  router.replace.mockClear();
  navigate(href);
}

export const currentUrl = () => current.pathname + current.search;

export const navigationMock = {
  useRouter: () => router,
  usePathname: () => {
    useSyncExternalStore(subscribe, snapshot, snapshot);
    return current.pathname;
  },
  useSearchParams: () => {
    useSyncExternalStore(subscribe, snapshot, snapshot);
    return new URLSearchParams(current.search);
  },
};
