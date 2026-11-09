// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeLead } from '@/features/leads/lead-test-fixtures';
import { apiError, mockApi, renderAs } from '@/test/render';
import { QuotationsPanel } from './quotations-panel';
import { makeQuotation, SALES_BD, SALES_READER } from './sales-test-fixtures';

afterEach(() => vi.unstubAllGlobals());
const lead = makeLead({ stage: 'TOR_QUOTE_SENT' });
const listOf = (items: object[]) => ({
  'GET /leads/l-1/quotations': () => ({
    body: { items, page: 1, pageSize: 50, total: items.length },
  }),
});

describe('QuotationsPanel', () => {
  it('states that acceptance does not convert, and shows the empty state', async () => {
    mockApi(listOf([]));
    renderAs(SALES_BD, <QuotationsPanel lead={lead} />);
    expect(await screen.findByText('No quotations yet.')).toBeInTheDocument();
    expect(screen.getByText(/does not convert the lead/)).toBeInTheDocument();
  });

  it('lists a quotation with its server totals and the right next action', async () => {
    mockApi(listOf([makeQuotation()]));
    renderAs(SALES_BD, <QuotationsPanel lead={lead} />);
    expect(await screen.findByLabelText('Quotation QT-2026-0001')).toHaveTextContent(
      'KES 162,400.00',
    );
    expect(screen.getByRole('button', { name: 'Mark as sent' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark accepted' })).not.toBeInTheDocument();
  });

  it('warns that an accepted quotation did not win the lead', async () => {
    const user = userEvent.setup();
    mockApi({
      ...listOf([makeQuotation({ status: 'SENT' })]),
      'POST /leads/l-1/quotations/qt-1/status': () => ({
        body: makeQuotation({ status: 'ACCEPTED' }),
      }),
    });
    renderAs(SALES_BD, <QuotationsPanel lead={lead} />);
    await user.click(await screen.findByRole('button', { name: 'Mark accepted' }));
    expect(await screen.findByText(/lead is not won until both parties sign/)).toBeInTheDocument();
  });

  it('offers no status buttons on an expired quote', async () => {
    mockApi(listOf([makeQuotation({ status: 'SENT', expired: true })]));
    renderAs(SALES_BD, <QuotationsPanel lead={lead} />);
    const card = await screen.findByLabelText('Quotation QT-2026-0001');
    expect(card).toHaveTextContent('Expired');
    expect(screen.queryByRole('button', { name: 'Mark accepted' })).not.toBeInTheDocument();
  });

  it('creates a quotation from the ToR and validates the date', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      ...listOf([]),
      'POST /leads/l-1/quotations/from-tor': () => ({ status: 201, body: makeQuotation() }),
    });
    renderAs(SALES_BD, <QuotationsPanel lead={lead} />);
    await screen.findByText('No quotations yet.');
    await user.click(screen.getByRole('button', { name: 'Create quotation' }));
    expect(await screen.findByText(/last day the quote is valid/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    await user.type(screen.getByLabelText('Valid until'), '2026-12-31');
    await user.click(screen.getByRole('button', { name: 'Create quotation' }));
    expect(await screen.findByText('Quotation QT-2026-0001 created.')).toBeInTheDocument();
  });

  it('explains a refusal in plain language', async () => {
    const user = userEvent.setup();
    mockApi({
      ...listOf([]),
      'POST /leads/l-1/quotations/from-tor': () => apiError(409, 'QUOTATION_TOR_NOT_SENT', 'x'),
    });
    renderAs(SALES_BD, <QuotationsPanel lead={lead} />);
    await screen.findByText('No quotations yet.');
    await user.type(screen.getByLabelText('Valid until'), '2026-12-31');
    await user.click(screen.getByRole('button', { name: 'Create quotation' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Send the current Terms of Reference',
    );
  });

  it('is hidden without quotation access', () => {
    const { container } = renderAs(SALES_READER, <QuotationsPanel lead={lead} />);
    expect(container).toBeEmptyDOMElement();
  });
});
