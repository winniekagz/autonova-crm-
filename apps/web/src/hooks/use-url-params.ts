'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { withParams } from '@/lib/url-params';

/**
 * Read access to the current query string, plus `update` to change it. Each update is a history
 * entry (so Back returns to the previous search or page) and keeps the scroll position.
 */
export function useUrlParams() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const update = (changes: Parameters<typeof withParams>[1]) => {
    router.push(`${pathname}${withParams(searchParams, changes)}`, { scroll: false });
  };

  return { searchParams, update };
}
