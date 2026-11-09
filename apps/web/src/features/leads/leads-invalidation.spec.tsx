// @vitest-environment jsdom
import type { QueryClient } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderAs } from '@/test/render';
import { BD, makeLead } from './lead-test-fixtures';
import { leadsKeys, useSaveLead, useTransitionLead } from './leads.queries';

afterEach(() => vi.unstubAllGlobals());

const PIPELINE = ['sales', 'pipeline'] as const;
const COMPANIES = ['companies', 'list', {}] as const;
const stale = (client: QueryClient, key: readonly unknown[]) =>
  client.getQueryState(key)?.isInvalidated === true;

function seed(client: QueryClient) {
  client.setQueryData(PIPELINE, { cached: true });
  client.setQueryData(COMPANIES, { cached: true });
  client.setQueryData(leadsKeys.list('', 1), { cached: true });
}

function CreateButton() {
  const save = useSaveLead(undefined);
  return (
    <button onClick={() => save.mutate({ name: 'New' } as never)}>
      {save.isSuccess ? 'saved' : 'create'}
    </button>
  );
}

function TransitionButton() {
  const move = useTransitionLead('l-1');
  return (
    <button onClick={() => move.mutate({ toStage: 'VISITS_AND_CALLS' } as never)}>
      {move.isSuccess ? 'moved' : 'move'}
    </button>
  );
}

describe('a successful lead write refreshes everything derived from it', () => {
  it('creating a lead marks the lead lists, the pipeline summary and companies for refetch', async () => {
    mockApi({ 'POST /leads': () => ({ status: 201, body: makeLead({ id: 'l-new' }) }) });
    const { queryClient } = renderAs(BD, <CreateButton />);
    seed(queryClient);

    await userEvent.setup().click(screen.getByRole('button', { name: 'create' }));
    await screen.findByRole('button', { name: 'saved' });

    expect(stale(queryClient, leadsKeys.list('', 1))).toBe(true);
    expect(stale(queryClient, PIPELINE)).toBe(true);
    expect(stale(queryClient, COMPANIES)).toBe(true);
    expect(queryClient.getQueryData(leadsKeys.detail('l-new'))).toMatchObject({ id: 'l-new' });
  });

  it('moving a lead to the next stage does the same, and refreshes its history', async () => {
    mockApi({
      'POST /leads/l-1/transitions': () => ({ body: makeLead({ stage: 'VISITS_AND_CALLS' }) }),
    });
    const { queryClient } = renderAs(BD, <TransitionButton />);
    seed(queryClient);
    queryClient.setQueryData(leadsKeys.history('l-1'), { cached: true });

    await userEvent.setup().click(screen.getByRole('button', { name: 'move' }));
    await waitFor(() => expect(stale(queryClient, PIPELINE)).toBe(true));

    expect(stale(queryClient, leadsKeys.list('', 1))).toBe(true);
    expect(stale(queryClient, leadsKeys.history('l-1'))).toBe(true);
    expect(stale(queryClient, COMPANIES)).toBe(true);
  });

  it('a failed write leaves the cache alone', async () => {
    const { calls } = mockApi({
      'POST /leads': () => ({ status: 400, body: { code: 'VALIDATION_FAILED' } }),
    });
    const { queryClient } = renderAs(BD, <CreateButton />);
    seed(queryClient);

    await userEvent.setup().click(screen.getByRole('button', { name: 'create' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));

    expect(stale(queryClient, PIPELINE)).toBe(false);
    expect(stale(queryClient, leadsKeys.list('', 1))).toBe(false);
  });
});
