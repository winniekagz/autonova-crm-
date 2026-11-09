// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeLead } from '@/features/leads/lead-test-fixtures';
import { apiError, mockApi, renderAs } from '@/test/render';
import {
  makeTor,
  makeVersion,
  SALES_BD,
  SALES_DIRECTOR,
  SALES_READER,
} from './sales-test-fixtures';
import { TorWorkspace } from './tor-workspace';

afterEach(() => vi.unstubAllGlobals());
const qualified = makeLead({ stage: 'QUALIFIED' });
const empty = () => apiError(404, 'TOR_NOT_FOUND');
const catalogue = () => ({ body: { items: [], page: 1, pageSize: 100, total: 0 } });

describe('TorWorkspace', () => {
  it('offers to start a Terms of Reference and creates it from the form, sending no totals', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /leads/l-1/tor': empty,
      'GET /catalogue': catalogue,
      'POST /leads/l-1/tor': () => ({ status: 201, body: makeTor() }),
    });
    renderAs(SALES_BD, <TorWorkspace lead={qualified} />);
    expect(await screen.findByText('No Terms of Reference yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add item' }));
    await user.type(screen.getByLabelText('Item'), 'POS setup');
    await user.clear(screen.getByLabelText('Price'));
    await user.type(screen.getByLabelText('Price'), '40000');
    await user.click(screen.getByRole('button', { name: 'Create Terms of Reference' }));
    expect(await screen.findByText(/created as a draft/)).toBeInTheDocument();
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.body).toMatchObject({
      scopeItems: [{ name: 'POS setup', price: '40000', inScope: true }],
    });
    expect(post?.body).not.toHaveProperty('totals');
  });

  it('shows field errors without calling the server', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({ 'GET /leads/l-1/tor': empty, 'GET /catalogue': catalogue });
    renderAs(SALES_BD, <TorWorkspace lead={qualified} />);
    await screen.findByText('No Terms of Reference yet.');
    await user.click(screen.getByRole('button', { name: 'Add item' }));
    await user.click(screen.getByRole('button', { name: 'Create Terms of Reference' }));
    expect(await screen.findByText('Name the item')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('will not offer to start one before the lead is qualified', async () => {
    mockApi({ 'GET /leads/l-1/tor': empty, 'GET /catalogue': catalogue });
    renderAs(SALES_BD, <TorWorkspace lead={makeLead({ stage: 'VISITS_AND_CALLS' })} />);
    expect(await screen.findByText(/once the lead is Qualified/)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Terms of Reference' })).not.toBeInTheDocument();
  });

  it('shows the server totals for a draft and sends it for signature', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /leads/l-1/tor': () => ({ body: makeTor() }),
      'GET /catalogue': catalogue,
      'POST /leads/l-1/tor/send': () => ({ body: makeVersion({ status: 'SENT' }) }),
    });
    renderAs(SALES_BD, <TorWorkspace lead={qualified} />);
    const totals = await screen.findByLabelText('Totals worked out by the server');
    expect(totals).toHaveTextContent('KES 162,400.00');
    await user.click(screen.getByRole('button', { name: 'Send for signature' }));
    expect(await screen.findByText(/Version sent/)).toBeInTheDocument();
  });

  it('blocks sending behind a Director approval and lets only a Director approve', async () => {
    const needs = makeTor(
      makeVersion({ discountNeedsApproval: true, discountType: 'PERCENT', discountValue: '15.00' }),
    );
    mockApi({ 'GET /leads/l-1/tor': () => ({ body: needs }), 'GET /catalogue': catalogue });
    const { unmount } = renderAs(SALES_BD, <TorWorkspace lead={qualified} />);
    expect(await screen.findByText(/A Director must approve it/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve discount' })).not.toBeInTheDocument();
    unmount();
    mockApi({ 'GET /leads/l-1/tor': () => ({ body: needs }), 'GET /catalogue': catalogue });
    renderAs(SALES_DIRECTOR, <TorWorkspace lead={qualified} />);
    expect(await screen.findByRole('button', { name: 'Approve discount' })).toBeInTheDocument();
  });

  it('turns a refused send into a plain message', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /leads/l-1/tor': () => ({ body: makeTor() }),
      'GET /catalogue': catalogue,
      'POST /leads/l-1/tor/send': () => apiError(409, 'TOR_NOTHING_IN_SCOPE', 'internal'),
    });
    renderAs(SALES_BD, <TorWorkspace lead={qualified} />);
    await screen.findByLabelText('Totals worked out by the server');
    await user.click(screen.getByRole('button', { name: 'Send for signature' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Add at least one in-scope item');
    expect(alert).not.toHaveTextContent('internal');
  });

  it('records a signature on a sent version, and the second one reports conversion', async () => {
    const user = userEvent.setup();
    const sent = makeVersion({ status: 'SENT', sentAt: '2026-11-07T08:00:00.000Z' });
    const { calls } = mockApi({
      'GET /leads/l-1/tor': () => ({ body: makeTor(sent) }),
      'GET /catalogue': catalogue,
      'POST /leads/l-1/tor/versions/1/sign': () => ({
        body: { version: sent, clientAccount: null, converted: false },
      }),
    });
    renderAs(SALES_BD, <TorWorkspace lead={makeLead({ stage: 'TOR_QUOTE_SENT' })} />);
    const form = await screen.findByRole('form', { name: 'Record a signature' });
    await user.type(within(form).getByLabelText('Signer’s full name'), 'Achieng Otieno');
    await user.click(within(form).getByRole('button', { name: 'Record signature' }));
    expect(await screen.findByText('Signature recorded.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({
      party: 'CLIENT',
      signerName: 'Achieng Otieno',
    });
  });

  it('requires a signer name', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /leads/l-1/tor': () => ({ body: makeTor(makeVersion({ status: 'SENT' })) }),
      'GET /catalogue': catalogue,
    });
    renderAs(SALES_BD, <TorWorkspace lead={makeLead({ stage: 'TOR_QUOTE_SENT' })} />);
    const form = await screen.findByRole('form', { name: 'Record a signature' });
    await user.click(within(form).getByRole('button', { name: 'Record signature' }));
    expect(await screen.findByText(/Enter the signer/)).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('shows a signed agreement as locked, with no editing or signing', async () => {
    const signed = makeVersion({
      status: 'SIGNED',
      signedAt: '2026-11-08T08:00:00.000Z',
      signatures: [
        {
          id: 's1',
          party: 'CLIENT',
          signerName: 'Achieng',
          signerTitle: null,
          method: 'TYPED_NAME',
          evidenceNote: null,
          signedAt: '2026-11-08T07:00:00.000Z',
          recordedByName: 'Dee',
        },
        {
          id: 's2',
          party: 'AUTONOVA',
          signerName: 'Dee Director',
          signerTitle: null,
          method: 'TYPED_NAME',
          evidenceNote: null,
          signedAt: '2026-11-08T08:00:00.000Z',
          recordedByName: 'Dee',
        },
      ],
    });
    mockApi({
      'GET /leads/l-1/tor': () => ({ body: makeTor(signed) }),
      'GET /catalogue': catalogue,
    });
    renderAs(SALES_BD, <TorWorkspace lead={makeLead({ stage: 'WON' })} />);
    expect(await screen.findByText(/Signed and locked/)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Record a signature' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start a new version' })).not.toBeInTheDocument();
  });

  it('is hidden without ToR access', () => {
    const { container } = renderAs(SALES_READER, <TorWorkspace lead={qualified} />);
    expect(container).toBeEmptyDOMElement();
  });
});
