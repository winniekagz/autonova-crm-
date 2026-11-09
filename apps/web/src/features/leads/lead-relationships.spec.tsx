// @vitest-environment jsdom
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BD_COMPANIES,
  NO_COMPANY_ACCESS,
  makeCompany,
  makeContact,
  pageOf,
} from '@/features/companies/company-test-fixtures';
import { resetNavigation } from '@/test/navigation';
import { apiError, mockApi, renderAs } from '@/test/render';
import { LeadRelationships } from './lead-relationships';
import { makeLead } from './lead-test-fixtures';

vi.mock('next/navigation', async () => (await import('@/test/navigation')).navigationMock);
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

beforeEach(() => resetNavigation('/leads/l-1'));
afterEach(() => vi.unstubAllGlobals());

const linked = makeLead({
  primaryContact: { id: 'ct-1', name: 'Achieng Otieno', jobTitle: 'CEO', archived: false },
  additionalContacts: [{ id: 'ct-2', name: 'Brian Mwangi', jobTitle: null, archived: false }],
});
const unlinked = makeLead({ company: null, companyName: null, primaryContact: null });

describe('LeadRelationships', () => {
  it('shows the linked company and contacts, marking the primary one', () => {
    renderAs(BD_COMPANIES, <LeadRelationships lead={linked} />);
    expect(screen.getByRole('link', { name: 'Otieno Logistics' })).toHaveAttribute(
      'href',
      '/companies/co-1',
    );
    expect(screen.getByText(/Achieng Otieno · CEO · Primary/)).toBeInTheDocument();
    expect(screen.getByText('Brian Mwangi')).toBeInTheDocument();
  });

  it('says so for an individual prospect, and for old free-text company names', () => {
    const { unmount } = renderAs(BD_COMPANIES, <LeadRelationships lead={unlinked} />);
    expect(screen.getByText(/individual prospect: not linked to a company/)).toBeInTheDocument();
    unmount();
    renderAs(
      BD_COMPANIES,
      <LeadRelationships lead={makeLead({ company: null, companyName: 'Old Text Ltd' })} />,
    );
    expect(
      screen.getByText(/Entered as “Old Text Ltd” before companies existed/),
    ).toBeInTheDocument();
  });

  it('warns when the linked company is archived', () => {
    renderAs(
      BD_COMPANIES,
      <LeadRelationships
        lead={makeLead({ company: { id: 'co-1', name: 'Gone Co', archived: true } })}
      />,
    );
    expect(screen.getByText(/This company is archived/)).toBeInTheDocument();
  });

  it('links a company and a primary contact, then confirms', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /companies': () => pageOf([makeCompany()]),
      'GET /companies/co-1/contacts': () =>
        pageOf([
          makeContact(),
          makeContact({ id: 'ct-2', name: 'Brian Mwangi', jobTitle: 'Finance' }),
        ]),
      'PATCH /leads/l-1/relationships': () => ({ body: linked }),
    });
    renderAs(BD_COMPANIES, <LeadRelationships lead={unlinked} />);
    await user.click(screen.getByRole('button', { name: 'Link or create a company' }));
    const company = await screen.findByRole('option', { name: 'Otieno Logistics' });
    await user.selectOptions(screen.getByLabelText('Company'), company);
    await user.selectOptions(await screen.findByLabelText('Primary contact'), 'ct-1');
    await user.click(await screen.findByLabelText(/Brian Mwangi/));
    await user.click(screen.getByRole('button', { name: 'Save company and contacts' }));
    expect(await screen.findByText('Company and contacts saved.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      companyId: 'co-1',
      primaryContactId: 'ct-1',
      additionalContactIds: ['ct-2'],
    });
  });

  it('does not offer the primary contact again among the other contacts', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /companies': () => pageOf([makeCompany()]),
      'GET /companies/co-1/contacts': () =>
        pageOf([makeContact(), makeContact({ id: 'ct-2', name: 'Brian Mwangi' })]),
    });
    renderAs(BD_COMPANIES, <LeadRelationships lead={linked} />);
    await user.click(screen.getByRole('button', { name: 'Change' }));
    const others = await screen.findByRole('group', { name: 'Other contacts involved' });
    expect(within(others).queryByLabelText(/Achieng Otieno/)).not.toBeInTheDocument();
    expect(within(others).getByLabelText(/Brian Mwangi/)).toBeChecked();
  });

  it('clears contacts when the company is changed to none, and sends an individual prospect', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'GET /companies': () => pageOf([makeCompany()]),
      'GET /companies/co-1/contacts': () => pageOf([makeContact()]),
      'PATCH /leads/l-1/relationships': () => ({ body: unlinked }),
    });
    renderAs(BD_COMPANIES, <LeadRelationships lead={linked} />);
    await user.click(screen.getByRole('button', { name: 'Change' }));
    await screen.findByRole('option', { name: 'Otieno Logistics' });
    await user.selectOptions(screen.getByLabelText('Company'), '');
    expect(screen.queryByLabelText('Primary contact')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save company and contacts' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({
      companyId: null,
      primaryContactId: null,
      additionalContactIds: [],
    });
  });

  it('shows a clear message and keeps the editor open when the server refuses', async () => {
    const user = userEvent.setup();
    mockApi({
      'GET /companies': () => pageOf([makeCompany()]),
      'GET /companies/co-1/contacts': () => pageOf([makeContact()]),
      'PATCH /leads/l-1/relationships': () =>
        apiError(409, 'LEAD_CONTACT_UNAVAILABLE', 'internal detail'),
    });
    renderAs(BD_COMPANIES, <LeadRelationships lead={linked} />);
    await user.click(screen.getByRole('button', { name: 'Change' }));
    await user.click(await screen.findByRole('button', { name: 'Save company and contacts' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Each contact must be an active contact of the chosen company.',
    );
    expect(alert).not.toHaveTextContent('internal detail');
    expect(screen.getByRole('button', { name: 'Save company and contacts' })).toBeEnabled();
  });

  it('shows no edit action, and no company link, to a user without company access', () => {
    renderAs(
      { ...NO_COMPANY_ACCESS, permissions: ['leads:read', 'leads:update'] },
      <LeadRelationships lead={linked} />,
    );
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Otieno Logistics' })).not.toBeInTheDocument();
    expect(screen.getByText('Otieno Logistics')).toBeInTheDocument();
  });
});
