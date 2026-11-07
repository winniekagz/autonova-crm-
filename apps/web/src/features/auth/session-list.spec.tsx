// @vitest-environment jsdom
import type { SessionDto } from '@autonova/contracts';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { FINANCE, apiError, mockApi, renderAs } from '@/test/render';
import { SessionList, describeDevice } from './session-list';

afterEach(() => vi.unstubAllGlobals());

// jsdom does not implement <dialog>.showModal/close.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});

const CHROME = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1';
const session = (over: Partial<SessionDto> = {}): SessionDto => ({
  id: 's-1',
  createdAt: '2026-11-01T08:00:00.000Z',
  expiresAt: '2026-12-01T08:00:00.000Z',
  current: false,
  ip: '10.0.0.2',
  userAgent: IPHONE,
  ...over,
});

describe('describeDevice', () => {
  it.each([
    [CHROME, 'Chrome on Linux'],
    [IPHONE, 'Safari on iOS'],
    [null, 'Unknown device'],
    ['curl/8.0', 'curl/8.0'],
  ])('%s -> %s', (agent, label) => expect(describeDevice(agent)).toBe(label));
});

describe('SessionList', () => {
  it('shows a loading state, then the current session without a revoke action and others with one', async () => {
    mockApi({
      'GET /auth/sessions': () => ({
        body: [session({ id: 'cur', current: true, userAgent: CHROME }), session({ id: 'other' })],
      }),
    });
    renderAs(FINANCE, <SessionList />);
    expect(screen.getByRole('status', { name: 'Loading sessions' })).toBeInTheDocument();

    const list = await screen.findByRole('list', { name: 'Sessions' });
    const [currentItem, otherItem, ...rest] = within(list).getAllByRole('listitem');
    expect(rest).toHaveLength(0);
    if (!currentItem || !otherItem) throw new Error('expected two sessions');
    expect(within(currentItem).getByText('This device')).toBeInTheDocument();
    expect(within(currentItem).queryByRole('button')).toBeNull();
    expect(
      within(otherItem).getByRole('button', { name: /Sign out Safari on iOS/ }),
    ).toBeInTheDocument();
    expect(within(otherItem).getByText('10.0.0.2')).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    mockApi({ 'GET /auth/sessions': () => ({ body: [] }) });
    renderAs(FINANCE, <SessionList />);
    expect(await screen.findByText('No active sessions')).toBeInTheDocument();
  });

  it('shows an error with retry, and retry reloads', async () => {
    const user = userEvent.setup();
    let fail = true;
    mockApi({
      'GET /auth/sessions': () => (fail ? apiError(500, 'INTERNAL_ERROR') : { body: [session()] }),
    });
    renderAs(FINANCE, <SessionList />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: 'Sessions' })).toBeInTheDocument();
  });

  it('asks for confirmation, then revokes, removes the row and confirms success', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /auth/sessions': () => ({
        body: [session({ id: 'cur', current: true }), session({ id: 'other' })],
      }),
      'DELETE /auth/sessions/other': () => ({ status: 204 }),
    });
    renderAs(FINANCE, <SessionList />);
    await screen.findByRole('list', { name: 'Sessions' });

    await user.click(screen.getByRole('button', { name: /Sign out Safari on iOS/ }));
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    const dialog = screen.getByRole('dialog', { name: 'Sign out this session?' });
    await user.click(within(dialog).getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByText('Session signed out.')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    const del = calls.find((c) => c.method === 'DELETE');
    expect(del).toMatchObject({
      path: '/auth/sessions/other',
      auth: 'Bearer test-token',
      csrf: '1',
    });
  });

  it('cancelling the confirmation revokes nothing', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /auth/sessions': () => ({ body: [session({ id: 'other' })] }),
    });
    renderAs(FINANCE, <SessionList />);
    await screen.findByRole('list', { name: 'Sessions' });
    await user.click(screen.getByRole('button', { name: /Sign out Safari on iOS/ }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Sign out this session?' })).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('a session that already ended (404) reloads the list instead of showing an error', async () => {
    const user = userEvent.setup();
    let reloaded = false;
    mockApi({
      'GET /auth/sessions': () => {
        const body = reloaded ? [] : [session({ id: 'gone' })];
        return { body };
      },
      'DELETE /auth/sessions/gone': () => {
        reloaded = true;
        return apiError(404, 'SESSION_NOT_FOUND');
      },
    });
    renderAs(FINANCE, <SessionList />);
    await screen.findByRole('list', { name: 'Sessions' });
    await user.click(screen.getByRole('button', { name: /Sign out/ }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Sign out this session?' })).getByRole('button', {
        name: 'Sign out',
      }),
    );
    expect(await screen.findByText('That session had already ended.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('No active sessions')).toBeInTheDocument());
  });

  it('shows an error notice when revoking fails and keeps the row', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /auth/sessions': () => ({ body: [session({ id: 'other' })] }),
      'DELETE /auth/sessions/other': () => apiError(500, 'INTERNAL_ERROR'),
    });
    renderAs(FINANCE, <SessionList />);
    await screen.findByRole('list', { name: 'Sessions' });
    await user.click(screen.getByRole('button', { name: /Sign out/ }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Sign out this session?' })).getByRole('button', {
        name: 'Sign out',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });
});
