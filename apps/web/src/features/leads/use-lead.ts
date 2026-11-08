'use client';

import type { LeadDto } from '@autonova/contracts';
import { leadErrorText } from './lead-format';
import { useLeadQuery } from './leads.queries';

export type LeadState =
  { kind: 'loading' } | { kind: 'ready'; lead: LeadDto } | { kind: 'error'; message: string };

/**
 * Loads one lead by id; shared by the detail and edit screens.
 *
 * Cached data is shown straight away and refreshed in the background. The edit form copies the lead
 * into its own state once, so it passes `requireFresh` and keeps waiting until the server has
 * answered, instead of letting people edit a copy that may be out of date.
 */
export function useLead(id: string, { requireFresh = false } = {}): LeadState {
  const query = useLeadQuery(id);

  if (query.isError) return { kind: 'error', message: leadErrorText(query.error) };
  if (!query.data || (requireFresh && !query.isFetchedAfterMount)) return { kind: 'loading' };
  return { kind: 'ready', lead: query.data };
}
