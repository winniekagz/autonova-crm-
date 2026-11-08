// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetNavigation } from '@/test/navigation';
import { apiError, mockApi, renderAs } from '@/test/render';
import { BD, makeLead, page } from './lead-test-fixtures';
import { LeadDetail } from './lead-detail';

vi.mock('next/navigation', async () => (await import('@/test/navigation')).navigationMock);
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

beforeEach(() => resetNavigation('/leads'));
afterEach(() => vi.unstubAllGlobals());

describe('LeadDetail', () => {
  it('shows a loading state, then the lead, with empty fields as a dash', async () => {
    mockApi({
      'GET /leads/l-1': () => ({ body: makeLead({ phone: null }) }),
      'GET /leads/l-1/reminders': () => page([]),
      'GET /leads/l-1/history': () => page([]),
    });
    renderAs(BD, <LeadDetail id="l-1" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading lead');
    expect(await screen.findByRole('heading', { name: 'Achieng Otieno' })).toBeInTheDocument();
    expect(screen.getByText('Owner Dee Director', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('KES 120000')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit lead' })).toHaveAttribute(
      'href',
      '/leads/l-1/edit',
    );
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('explains a missing or hidden lead', async () => {
    mockApi({ 'GET /leads/l-9': () => apiError(404, 'NOT_FOUND') });
    renderAs(BD, <LeadDetail id="l-9" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This lead is unavailable in your pipeline.',
    );
  });

  it('shows a conflict message without exposing the server response', async () => {
    mockApi({
      'GET /leads/l-1': () => ({ body: makeLead() }),
      'GET /leads/l-1/reminders': () => page([]),
      'GET /leads/l-1/history': () => page([]),
      'POST /leads/l-1/transitions': () =>
        apiError(409, 'LEAD_STAGE_CHANGED', 'internal state details'),
    });
    const user = userEvent.setup();
    renderAs(BD, <LeadDetail id="l-1" />);
    await screen.findByRole('heading', { name: 'Achieng Otieno' });
    await user.click(screen.getByRole('button', { name: 'Move to Visits And Calls' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This lead changed while you were working.');
    expect(alert).not.toHaveTextContent('internal state details');
  });

  it('moves the lead with an explicit transition and renders recorded history', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /leads/l-1': () => ({ body: makeLead() }),
      'GET /leads/l-1/reminders': () => page([]),
      'GET /leads/l-1/history': () =>
        page([
          {
            id: 'h-1',
            leadId: 'l-1',
            fromStage: 'NEW_LEAD',
            toStage: 'VISITS_AND_CALLS',
            actorUserId: 'u-1',
            actorName: 'Dee Director',
            occurredAt: '2026-11-08T08:00:00.000Z',
            reason: null,
            disqualificationReason: null,
            revisitOn: null,
            source: 'MANUAL',
          },
        ]),
      'POST /leads/l-1/transitions': () => ({ body: makeLead({ stage: 'VISITS_AND_CALLS' }) }),
    });
    renderAs(BD, <LeadDetail id="l-1" />);
    await screen.findByRole('heading', { name: 'Achieng Otieno' });
    await user.click(screen.getByRole('button', { name: 'Move to Visits And Calls' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Lead moved to Visits And Calls.');
    expect(await screen.findByText('Stage history')).toBeInTheDocument();
    expect(screen.getByText('New Lead → Visits And Calls')).toBeInTheDocument();
    expect(calls.find((call) => call.path === '/leads/l-1/transitions')?.body).toEqual({
      fromStage: 'NEW_LEAD',
      toStage: 'VISITS_AND_CALLS',
    });
  });

  it('requires a revisit date only when Timing / Revisit Later is selected', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /leads/l-1': () => ({ body: makeLead({ stage: 'VISITS_AND_CALLS' }) }),
      'GET /leads/l-1/reminders': () => page([]),
      'GET /leads/l-1/history': () => page([]),
      'POST /leads/l-1/disqualification': () => ({
        body: makeLead({
          stage: 'DISQUALIFIED',
          disqualificationReason: 'TIMING_REVISIT_LATER',
          revisitOn: '2026-11-20',
        }),
      }),
    });
    renderAs(BD, <LeadDetail id="l-1" />);
    await screen.findByRole('heading', { name: 'Achieng Otieno' });
    await user.selectOptions(screen.getByLabelText('Reason'), 'TIMING_REVISIT_LATER');
    expect(screen.getByLabelText('Follow-up date')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Disqualify lead' }));
    expect(await screen.findByText('Choose a follow-up date.')).toBeInTheDocument();
    expect(calls.some((call) => call.path === '/leads/l-1/disqualification')).toBe(false);

    await user.type(screen.getByLabelText('Follow-up date'), '2026-11-20');
    await user.click(screen.getByRole('button', { name: 'Disqualify lead' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Revisit scheduled for 2026-11-20.',
    );
    expect(calls.find((call) => call.path === '/leads/l-1/disqualification')?.body).toEqual({
      fromStage: 'VISITS_AND_CALLS',
      reason: 'TIMING_REVISIT_LATER',
      revisitOn: '2026-11-20',
    });
  });

  it('requires and retains a Lost reason in the detail view', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /leads/l-1': () => ({
        body: makeLead({
          stage: 'TOR_QUOTE_SENT',
          lifecycle: { transitions: [], canDisqualify: false, canMarkLost: true },
        }),
      }),
      'GET /leads/l-1/reminders': () => page([]),
      'GET /leads/l-1/history': () => page([]),
      'POST /leads/l-1/lost': () => ({
        body: makeLead({ stage: 'LOST', lostReason: 'Selected another provider' }),
      }),
    });
    renderAs(BD, <LeadDetail id="l-1" />);
    await screen.findByRole('heading', { name: 'Achieng Otieno' });
    await user.click(screen.getByRole('button', { name: 'Mark Lost' }));
    expect(await screen.findByText('Enter a reason.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Lost reason'), 'Selected another provider');
    await user.click(screen.getByRole('button', { name: 'Mark Lost' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Lead marked Lost.');
    expect(screen.getByText('Lost reason: Selected another provider')).toBeInTheDocument();
  });
});
