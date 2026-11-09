// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetNavigation } from '@/test/navigation';
import { apiError, mockApi, renderAs } from '@/test/render';
import { CompanyDetail } from './company-detail';
import {
  BD_COMPANIES,
  DIRECTOR_COMPANIES,
  NO_COMPANY_ACCESS,
  makeCompany,
  makeContact,
  pageOf,
} from './company-test-fixtures';

vi.mock('next/navigation', async () => (await import('@/test/navigation')).navigationMock);
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  resetNavigation('/companies/co-1');
  // jsdom has no <dialog> modal support
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});
afterEach(() => vi.unstubAllGlobals());

const lead = {
  id: 'l-1',
  name: 'Fleet tracking deal',
  stage: 'QUALIFIED',
  ownerName: 'Sam',
  estimatedValue: '120000.00',
  currency: 'KES',
  nextActionAt: '2026-11-10T06:00:00.000Z',
};

const routes = (over: Record<string, () => { status?: number; body?: unknown }> = {}) => ({
  'GET /companies/co-1': () => ({ body: makeCompany() }),
  'GET /companies/co-1/contacts': () =>
    pageOf([
      makeContact(),
      makeContact({
        id: 'ct-2',
        name: 'Brian Mwangi',
        jobTitle: 'Finance',
        isDecisionMaker: false,
      }),
    ]),
  'GET /companies/co-1/leads': () => pageOf([lead]),
  ...over,
});

describe('CompanyDetail', () => {
  it('shows the company, its contacts and its leads', async () => {
    mockApi(routes());
    renderAs(BD_COMPANIES, <CompanyDetail id="co-1" />);
    expect(await screen.findByRole('heading', { name: 'Otieno Logistics' })).toBeInTheDocument();
    expect(screen.getByText('A123456789B')).toBeInTheDocument();
    expect(screen.getByText('2 contacts · 1 lead')).toBeInTheDocument();
    expect(await screen.findByText('Achieng Otieno')).toBeInTheDocument();
    expect(screen.getByText('Decision-maker')).toBeInTheDocument();
    expect(screen.getByText('Brian Mwangi')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Fleet tracking deal' })).toHaveAttribute(
      'href',
      '/leads/l-1',
    );
    expect(screen.getByRole('link', { name: 'Edit company' })).toHaveAttribute(
      'href',
      '/companies/co-1/edit',
    );
    expect(screen.queryByRole('button', { name: 'Archive' })).not.toBeInTheDocument();
  });

  it('shows useful empty states for missing relationships', async () => {
    mockApi(
      routes({
        'GET /companies/co-1/contacts': () => pageOf([]),
        'GET /companies/co-1/leads': () => pageOf([]),
      }),
    );
    renderAs(BD_COMPANIES, <CompanyDetail id="co-1" />);
    expect(
      await screen.findByText(/No contacts yet\. Add the owner, manager or finance contact/),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/No leads yet\. Link a lead to this company/),
    ).toBeInTheDocument();
  });

  it('adds a contact, shows success, and sends normalised details', async () => {
    const user = userEvent.setup();
    let contacts = [makeContact()];
    const { calls } = mockApi(
      routes({
        'GET /companies/co-1/contacts': () => pageOf(contacts),
        'POST /companies/co-1/contacts': () => {
          contacts = [
            ...contacts,
            makeContact({ id: 'ct-3', name: 'Wanjiru Kamau', isDecisionMaker: false }),
          ];
          return { status: 201, body: contacts[1] };
        },
      }),
    );
    renderAs(BD_COMPANIES, <CompanyDetail id="co-1" />);
    await screen.findByText('Achieng Otieno');
    await user.click(screen.getByRole('button', { name: 'Add contact' }));
    const form = screen.getByRole('form', { name: 'Add contact' });
    await user.type(within(form).getByLabelText('Contact name'), '  Wanjiru Kamau ');
    await user.type(within(form).getByLabelText('Email'), ' W@Otieno.TEST ');
    await user.click(within(form).getByLabelText('Decision-maker'));
    await user.click(within(form).getByRole('button', { name: 'Add contact' }));
    expect(await screen.findByText('Contact added.')).toBeInTheDocument();
    expect(await screen.findByText('Wanjiru Kamau')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({
      name: 'Wanjiru Kamau',
      email: 'w@otieno.test',
      isDecisionMaker: true,
    });
    expect(screen.queryByRole('form', { name: 'Add contact' })).not.toBeInTheDocument();
  });

  it('shows each contact’s role and sends the chosen role, or null when cleared', async () => {
    const user = userEvent.setup();
    let contacts = [
      makeContact(),
      makeContact({ id: 'ct-2', name: 'Brian Mwangi', role: 'FINANCE', isDecisionMaker: false }),
    ];
    const { calls } = mockApi(
      routes({
        'GET /companies/co-1/contacts': () => pageOf(contacts),
        'PATCH /contacts/ct-2': () => {
          contacts = [
            contacts[0] ?? makeContact(),
            makeContact({ id: 'ct-2', name: 'Brian Mwangi', role: null }),
          ];
          return { body: contacts[1] };
        },
      }),
    );
    renderAs(BD_COMPANIES, <CompanyDetail id="co-1" />);
    await screen.findByText('Brian Mwangi');
    expect(screen.getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('Finance')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit Brian Mwangi' }));
    const form = screen.getByRole('form', { name: 'Edit contact' });
    const select = within(form).getByLabelText('Role at the company');
    expect(select).toHaveValue('FINANCE');
    await user.selectOptions(select, '');
    await user.click(within(form).getByRole('button', { name: 'Save contact' }));
    expect(await screen.findByText('Contact saved.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({ role: null });
  });

  it('validates a contact before sending and shows server errors on the form', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi(
      routes({ 'POST /companies/co-1/contacts': () => apiError(409, 'COMPANY_ARCHIVED') }),
    );
    renderAs(BD_COMPANIES, <CompanyDetail id="co-1" />);
    await screen.findByText('Achieng Otieno');
    await user.click(screen.getByRole('button', { name: 'Add contact' }));
    const form = screen.getByRole('form', { name: 'Add contact' });
    await user.click(within(form).getByRole('button', { name: 'Add contact' }));
    expect(await within(form).findByText("Enter the contact's name.")).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    await user.type(within(form).getByLabelText('Contact name'), 'Late Joiner');
    await user.click(within(form).getByRole('button', { name: 'Add contact' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('This company is archived');
    expect(within(form).getByLabelText('Contact name')).toHaveValue('Late Joiner');
  });

  it('edits a contact with PATCH', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi(
      routes({ 'PATCH /contacts/ct-1': () => ({ body: makeContact({ jobTitle: 'Chair' }) }) }),
    );
    renderAs(BD_COMPANIES, <CompanyDetail id="co-1" />);
    await user.click(await screen.findByRole('button', { name: 'Edit Achieng Otieno' }));
    const form = screen.getByRole('form', { name: 'Edit contact' });
    const title = within(form).getByLabelText('Job title');
    await user.clear(title);
    await user.type(title, 'Chair');
    await user.click(within(form).getByRole('button', { name: 'Save contact' }));
    expect(await screen.findByText('Contact saved.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({
      jobTitle: 'Chair',
      name: 'Achieng Otieno',
    });
  });

  it('lets a Director archive a company after confirming, and shows the result', async () => {
    const user = userEvent.setup();
    let archived = false;
    const { calls } = mockApi(
      routes({
        'GET /companies/co-1': () => ({ body: makeCompany({ archived }) }),
        'POST /companies/co-1/archive': () => {
          archived = true;
          return { body: makeCompany({ archived: true }) };
        },
      }),
    );
    renderAs(DIRECTOR_COMPANIES, <CompanyDetail id="co-1" />);
    await user.click(await screen.findByRole('button', { name: 'Archive' }));
    const dialog = await screen.findByRole('dialog', { name: 'Archive this company?' });
    expect(dialog).toHaveTextContent('A company with open leads cannot be archived');
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Archive company' }));
    expect(await screen.findByText('Company archived.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Restore' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit company' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add contact' })).not.toBeInTheDocument();
  });

  it('explains why a company cannot be archived while it has open leads', async () => {
    const user = userEvent.setup();
    mockApi(
      routes({ 'POST /companies/co-1/archive': () => apiError(409, 'COMPANY_HAS_OPEN_LEADS') }),
    );
    renderAs(DIRECTOR_COMPANIES, <CompanyDetail id="co-1" />);
    await user.click(await screen.findByRole('button', { name: 'Archive' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Archive this company?' })).getByRole(
        'button',
        { name: 'Archive company' },
      ),
    );
    expect(await screen.findByText(/still has open leads/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
  });

  it('archives a contact after confirming, and explains when it is still used by a lead', async () => {
    const user = userEvent.setup();
    mockApi(routes({ 'POST /contacts/ct-1/archive': () => apiError(409, 'CONTACT_IN_USE') }));
    renderAs(DIRECTOR_COMPANIES, <CompanyDetail id="co-1" />);
    await user.click(await screen.findByRole('button', { name: 'Archive Achieng Otieno' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Archive this contact?' })).getByRole(
        'button',
        { name: 'Archive contact' },
      ),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/linked to a lead/);
  });

  it('hides archive and restore from users without that permission', async () => {
    mockApi(routes());
    renderAs(BD_COMPANIES, <CompanyDetail id="co-1" />);
    await screen.findByText('Achieng Otieno');
    expect(screen.queryByRole('button', { name: /Archive/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Show archived')).not.toBeInTheDocument();
  });

  it('shows a clear message for a company that is missing or outside the list, without a retry', async () => {
    mockApi({ 'GET /companies/co-1': () => apiError(404, 'COMPANY_NOT_FOUND') });
    renderAs(BD_COMPANIES, <CompanyDetail id="co-1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'does not exist or is not in your list',
    );
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to companies' })).toBeInTheDocument();
  });

  it('offers a retry for a server error, and refuses without permission', async () => {
    mockApi({ 'GET /companies/co-1': () => apiError(500, 'INTERNAL_ERROR', 'stack trace') });
    const { unmount } = renderAs(BD_COMPANIES, <CompanyDetail id="co-1" />);
    const alert = await screen.findByRole('alert');
    expect(alert).not.toHaveTextContent('stack trace');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    unmount();
    const { calls } = mockApi({});
    renderAs(NO_COMPANY_ACCESS, <CompanyDetail id="co-1" />);
    expect(screen.getByText('You do not have permission to view companies.')).toBeInTheDocument();
    await waitFor(() => expect(calls).toHaveLength(0));
  });

  it('shows archived contacts only when asked, with a restore action', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi(
      routes({
        'GET /companies/co-1/contacts': () =>
          pageOf([makeContact(), makeContact({ id: 'ct-9', name: 'Gone Person', archived: true })]),
        'POST /contacts/ct-9/restore': () => ({
          body: makeContact({ id: 'ct-9', name: 'Gone Person' }),
        }),
      }),
    );
    renderAs(DIRECTOR_COMPANIES, <CompanyDetail id="co-1" />);
    await screen.findByText('Achieng Otieno');
    await user.click(screen.getByLabelText('Show archived'));
    expect(calls.some((c) => c.path === '/companies/co-1/contacts')).toBe(true);
    await user.click(await screen.findByRole('button', { name: 'Restore Gone Person' }));
    expect(await screen.findByText('Contact restored.')).toBeInTheDocument();
  });
});
