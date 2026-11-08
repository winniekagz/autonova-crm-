// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiError, mockApi, renderAs } from '@/test/render';
import { BD, makeLead, page } from './lead-test-fixtures';
import { LeadReminders } from './lead-reminders';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const reminder = (over: Record<string, unknown> = {}) => ({
  id: 'r-1',
  leadId: 'l-1',
  dueAt: '2026-11-10T09:00:00.000Z',
  status: 'SENT',
  attempts: 1,
  lastAttemptAt: '2026-11-10T09:01:00.000Z',
  sentAt: '2026-11-10T09:01:00.000Z',
  reason: null,
  recipientName: 'Dee Director',
  ...over,
});

describe('LeadReminders', () => {
  it('shows when the reminder was emailed, in Nairobi time', async () => {
    mockApi({ 'GET /leads/l-1/reminders': () => page([reminder()]) });
    renderAs(BD, <LeadReminders lead={makeLead()} />);
    expect(await screen.findByText(/Email sent/)).toBeInTheDocument();
    expect(screen.getByText(/Emailed to Dee Director on 10 Nov 2026, 12:01/)).toBeInTheDocument();
  });

  it('says plainly when delivery failed and why, with no raw provider text', async () => {
    mockApi({
      'GET /leads/l-1/reminders': () =>
        page([
          reminder({ status: 'FAILED', sentAt: null, reason: 'DELIVERY_FAILED', attempts: 5 }),
        ]),
    });
    renderAs(BD, <LeadReminders lead={makeLead()} />);
    expect(await screen.findByText(/Not delivered/)).toBeInTheDocument();
    expect(screen.getByText(/did not accept the message\. 5 attempt/)).toBeInTheDocument();
  });

  it('explains a retry that is still pending', async () => {
    mockApi({
      'GET /leads/l-1/reminders': () =>
        page([
          reminder({ status: 'PENDING', sentAt: null, reason: 'SMTP_NOT_CONFIGURED', attempts: 1 }),
        ]),
    });
    renderAs(BD, <LeadReminders lead={makeLead()} />);
    expect(await screen.findByText(/Waiting to send/)).toBeInTheDocument();
    expect(
      screen.getByText(/not set up on this system\. Will retry automatically/),
    ).toBeInTheDocument();
  });

  it('shows an empty state before anything is due', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T00:00:00.000Z'));
    mockApi({ 'GET /leads/l-1/reminders': () => page([]) });
    renderAs(BD, <LeadReminders lead={makeLead()} />);
    expect(await screen.findByText('No reminders sent yet.')).toBeInTheDocument();
    expect(screen.queryByText(/overdue/)).not.toBeInTheDocument();
  });

  it('does not claim a reminder exists when the follow-up is overdue and nothing was recorded', async () => {
    mockApi({ 'GET /leads/l-1/reminders': () => page([]) });
    renderAs(BD, <LeadReminders lead={makeLead({ nextActionAt: '2020-01-01T09:00:00.000Z' })} />);
    expect(
      await screen.findByText(/overdue and no reminder has been recorded yet/),
    ).toBeInTheDocument();
  });

  it('shows a closed lead as not reminded', async () => {
    mockApi({ 'GET /leads/l-1/reminders': () => page([]) });
    renderAs(BD, <LeadReminders lead={makeLead({ stage: 'LOST' })} />);
    expect(await screen.findByText(/closed, so no reminders are sent/)).toBeInTheDocument();
  });

  it('shows a safe error when the records cannot be loaded', async () => {
    mockApi({
      'GET /leads/l-1/reminders': () => apiError(500, 'INTERNAL_ERROR', 'stack trace here'),
    });
    renderAs(BD, <LeadReminders lead={makeLead()} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('We could not complete the request');
    expect(alert).not.toHaveTextContent('stack trace');
  });
});
