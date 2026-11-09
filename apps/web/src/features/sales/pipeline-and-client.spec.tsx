// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeLead } from '@/features/leads/lead-test-fixtures';
import { apiError, mockApi, renderAs } from '@/test/render';
import { ClientAccountCard } from './client-account-card';
import { PipelineCard } from './pipeline-card';
import { makeClient, SALES_BD, SALES_READER } from './sales-test-fixtures';

afterEach(() => vi.unstubAllGlobals());

const summary = {
  asOf: '2026-11-09T00:00:00.000Z',
  stages: [
    { stage: 'NEW_LEAD', count: 4 },
    { stage: 'QUALIFIED', count: 2 },
  ],
  qualifiedOpportunities: 2,
  torsAwaitingSignature: 1,
  signedDeals: 3,
  won: 3,
  lost: 1,
  overdueFollowUps: 5,
  revisitsDue: 0,
  currency: 'KES',
  openValue: [{ currency: 'KES', amount: '250000.00' }],
};

describe('PipelineCard', () => {
  it('shows the server counts and open value', async () => {
    mockApi({ 'GET /pipeline/summary': () => ({ body: summary }) });
    renderAs(SALES_BD, <PipelineCard />);
    const stages = await screen.findByLabelText('By stage');
    expect(stages).toHaveTextContent('New Lead');
    expect(stages).toHaveTextContent('4');
    expect(screen.getByText('Overdue follow-ups').nextSibling).toHaveTextContent('5');
    expect(screen.getByText(/KES 250,000.00/)).toBeInTheDocument();
  });

  it('shows a plain error when the summary cannot load', async () => {
    mockApi({ 'GET /pipeline/summary': () => apiError(500, 'INTERNAL', 'stack trace') });
    renderAs(SALES_BD, <PipelineCard />);
    const alert = await screen.findByRole('alert');
    expect(alert).not.toHaveTextContent('stack trace');
  });

  it('is hidden for a user who cannot list leads', () => {
    const { container } = renderAs({ ...SALES_READER, permissions: [] }, <PipelineCard />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ClientAccountCard', () => {
  it('shows the account created by conversion on a won lead', async () => {
    mockApi({ 'GET /clients/by-lead/l-1': () => ({ body: makeClient() }) });
    renderAs(SALES_BD, <ClientAccountCard lead={makeLead({ stage: 'WON' })} />);
    expect(await screen.findByText('Client account CL-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('Terms of Reference v1')).toBeInTheDocument();
    expect(screen.getByText(/KES 5,000.00 per month/)).toBeInTheDocument();
  });

  it('renders nothing for a lead that is not won, without asking the server', () => {
    const { container } = renderAs(
      SALES_BD,
      <ClientAccountCard lead={makeLead({ stage: 'QUALIFIED' })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
