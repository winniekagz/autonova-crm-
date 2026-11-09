// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiError, mockApi, renderAs } from '@/test/render';
import { CompanyPicker, type PickedCompany } from './company-picker';
import { BD_COMPANIES, NO_COMPANY_ACCESS, makeCompany, pageOf } from './company-test-fixtures';

afterEach(() => vi.unstubAllGlobals());

function Harness({ initial = null }: { initial?: PickedCompany | null }) {
  const [value, setValue] = useState<PickedCompany | null>(initial);
  return (
    <>
      <CompanyPicker value={value} onChange={setValue} />
      <output aria-label="chosen">{value?.name ?? 'none'}</output>
    </>
  );
}

describe('CompanyPicker', () => {
  it('lists companies, lets one be chosen, and lets the choice be cleared', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /companies': () => pageOf([makeCompany(), makeCompany({ id: 'co-2', name: 'Zeta' })]),
    });
    renderAs(BD_COMPANIES, <Harness />);
    await screen.findByRole('option', { name: 'Zeta' });
    await user.selectOptions(screen.getByLabelText('Company'), 'co-2');
    expect(screen.getByLabelText('chosen')).toHaveTextContent('Zeta');
    await user.selectOptions(screen.getByLabelText('Company'), '');
    expect(screen.getByLabelText('chosen')).toHaveTextContent('none');
  });

  it('searches on the server after the typing pauses, not on every key', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({ 'GET /companies': () => pageOf([makeCompany()]) });
    renderAs(BD_COMPANIES, <Harness />);
    await screen.findByRole('option', { name: 'Otieno Logistics' });
    const before = calls.length;
    await user.type(screen.getByLabelText('Find a company'), 'zeta');
    expect(calls.length).toBe(before);
    await waitFor(() => expect(calls.length).toBeGreaterThan(before), { timeout: 2000 });
    expect(calls.length).toBe(before + 1);
  });

  it('keeps the chosen company selectable when a search no longer lists it', async () => {
    mockApi({ 'GET /companies': () => pageOf([]) });
    renderAs(BD_COMPANIES, <Harness initial={{ id: 'co-7', name: 'Chosen Earlier' }} />);
    expect(await screen.findByRole('option', { name: 'Chosen Earlier' })).toBeInTheDocument();
    expect(screen.getByLabelText('Company')).toHaveValue('co-7');
  });

  it('says so when nothing matches, and shows a safe error when the search fails', async () => {
    mockApi({ 'GET /companies': () => pageOf([]) });
    const { unmount } = renderAs(BD_COMPANIES, <Harness />);
    expect(await screen.findByText(/No companies yet\./)).toBeInTheDocument();
    unmount();
    mockApi({ 'GET /companies': () => apiError(500, 'INTERNAL_ERROR', 'sql exploded') });
    renderAs(BD_COMPANIES, <Harness />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('We could not complete the request');
    expect(alert).not.toHaveTextContent('sql exploded');
  });

  it('renders nothing and requests nothing for a user who may not list companies', () => {
    const { calls } = mockApi({});
    renderAs(NO_COMPANY_ACCESS, <Harness />);
    expect(screen.queryByLabelText('Company')).not.toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('creates a company from the typed name, selects it, and sends only the name', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /companies': () => pageOf([]),
      'POST /companies': () => ({
        status: 201,
        body: makeCompany({ id: 'co-new', name: 'Brand New Ltd' }),
      }),
    });
    renderAs(BD_COMPANIES, <Harness />);
    await user.type(screen.getByLabelText('Find a company'), 'Brand New Ltd');
    await user.click(
      await screen.findByRole(
        'button',
        { name: 'Create “Brand New Ltd” as a new company' },
        { timeout: 3000 },
      ),
    );
    await waitFor(
      () => expect(screen.getByLabelText('chosen')).toHaveTextContent('Brand New Ltd'),
      { timeout: 3000 },
    );
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ name: 'Brand New Ltd' });
  });

  it('does not offer to create a company that already matches exactly, or without permission', async () => {
    const user = userEvent.setup();
    mockApi({ 'GET /companies': () => pageOf([makeCompany()]) });
    const { unmount } = renderAs(BD_COMPANIES, <Harness />);
    await user.type(screen.getByLabelText('Find a company'), 'otieno logistics');
    await screen.findByRole('option', { name: 'Otieno Logistics' });
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(screen.queryByRole('button', { name: /as a new company/ })).not.toBeInTheDocument();
    unmount();
    mockApi({ 'GET /companies': () => pageOf([]) });
    renderAs({ ...BD_COMPANIES, permissions: ['companies:list', 'companies:read'] }, <Harness />);
    await user.type(screen.getByLabelText('Find a company'), 'Zeta Co');
    await screen.findByText(/No company matches that search/, undefined, { timeout: 3000 });
    expect(screen.queryByRole('button', { name: /as a new company/ })).not.toBeInTheDocument();
  });

  it('asks before creating a company whose name looks like an existing one', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    const { calls } = mockApi({
      'GET /companies': () => pageOf([]),
      'POST /companies': () => {
        attempts += 1;
        return attempts === 1
          ? apiError(409, 'COMPANY_DUPLICATE_SUSPECTED')
          : { status: 201, body: makeCompany({ id: 'co-new', name: 'Acme' }) };
      },
    });
    renderAs(BD_COMPANIES, <Harness />);
    await user.type(screen.getByLabelText('Find a company'), 'Acme');
    await user.click(
      await screen.findByRole(
        'button',
        { name: 'Create “Acme” as a new company' },
        { timeout: 3000 },
      ),
    );
    expect(
      await screen.findByText(/very similar name already exists/, undefined, { timeout: 3000 }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create “Acme” anyway' }));
    await waitFor(() => expect(screen.getByLabelText('chosen')).toHaveTextContent('Acme'), {
      timeout: 3000,
    });
    expect(calls.filter((c) => c.method === 'POST').map((c) => c.body)).toEqual([
      { name: 'Acme' },
      { name: 'Acme', acknowledgeDuplicates: true },
    ]);
  });
});
