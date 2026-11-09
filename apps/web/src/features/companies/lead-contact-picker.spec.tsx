// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockApi, renderAs } from '@/test/render';
import { LeadContactPicker, type ContactSelection } from './lead-contact-picker';
import { BD_COMPANIES, makeContact, pageOf } from './company-test-fixtures';

afterEach(() => vi.unstubAllGlobals());

function Harness() {
  const [value, setValue] = useState<ContactSelection>({
    primaryContactId: null,
    additionalContactIds: [],
  });
  return (
    <>
      <LeadContactPicker companyId="co-1" value={value} onChange={setValue} />
      <output aria-label="selection">{JSON.stringify(value)}</output>
    </>
  );
}

describe('LeadContactPicker: adding a contact in place', () => {
  it('offers to add the first contact and selects it as the primary contact', async () => {
    const user = userEvent.setup();
    let contacts: object[] = [];
    const created = makeContact({ id: 'ct-9', name: 'Wanjiru Kamau', role: 'FINANCE' });
    const { calls } = mockApi({
      'GET /companies/co-1/contacts': () => pageOf(contacts),
      'POST /companies/co-1/contacts': () => {
        contacts = [created];
        return { status: 201, body: created };
      },
    });
    renderAs(BD_COMPANIES, <Harness />);
    await user.click(await screen.findByRole('button', { name: 'Add a contact' }));
    const form = screen.getByRole('form', { name: 'Add contact' });
    await user.type(within(form).getByLabelText('Contact name'), 'Wanjiru Kamau');
    await user.selectOptions(within(form).getByLabelText('Role at the company'), 'FINANCE');
    await user.click(within(form).getByRole('button', { name: 'Add contact' }));
    expect(await screen.findByLabelText('Primary contact')).toHaveValue('ct-9');
    expect(screen.getByLabelText('selection')).toHaveTextContent('"primaryContactId":"ct-9"');
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({
      name: 'Wanjiru Kamau',
      role: 'FINANCE',
    });
  });

  it('adds a further contact as an additional one when a primary is already chosen', async () => {
    const user = userEvent.setup();
    let contacts = [makeContact()];
    mockApi({
      'GET /companies/co-1/contacts': () => pageOf(contacts),
      'POST /companies/co-1/contacts': () => {
        const next = makeContact({ id: 'ct-2', name: 'Brian Mwangi' });
        contacts = [...contacts, next];
        return { status: 201, body: next };
      },
    });
    renderAs(BD_COMPANIES, <Harness />);
    await user.selectOptions(await screen.findByLabelText('Primary contact'), 'ct-1');
    await user.click(screen.getByRole('button', { name: 'Add a contact' }));
    const form = screen.getByRole('form', { name: 'Add contact' });
    await user.type(within(form).getByLabelText('Contact name'), 'Brian Mwangi');
    await user.click(within(form).getByRole('button', { name: 'Add contact' }));
    expect(await screen.findByLabelText(/Brian Mwangi/)).toBeChecked();
    expect(screen.getByLabelText('Primary contact')).toHaveValue('ct-1');
  });

  it('does not offer to add a contact without permission to create', async () => {
    mockApi({ 'GET /companies/co-1/contacts': () => pageOf([]) });
    renderAs({ ...BD_COMPANIES, permissions: ['companies:list', 'companies:read'] }, <Harness />);
    expect(await screen.findByText(/no contacts yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a contact' })).not.toBeInTheDocument();
  });
});
