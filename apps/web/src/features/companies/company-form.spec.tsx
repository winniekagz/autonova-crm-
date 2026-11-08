// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetNavigation, router } from '@/test/navigation';
import { apiError, mockApi, renderAs } from '@/test/render';
import { CompanyForm, EditCompany } from './company-form';
import {
  BD_COMPANIES,
  NO_COMPANY_ACCESS,
  NO_DUPLICATES,
  makeCompany,
} from './company-test-fixtures';

vi.mock('next/navigation', async () => (await import('@/test/navigation')).navigationMock);
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

beforeEach(() => resetNavigation('/companies'));
afterEach(() => vi.unstubAllGlobals());

const exactMatch = {
  body: {
    exact: [
      {
        id: 'co-9',
        name: 'Existing Co',
        kraPin: 'A123456789B',
        location: null,
        archived: false,
        matchedOn: ['KRA_PIN'],
      },
    ],
    potential: [],
    hiddenMatchCount: 0,
  },
};
const nameMatch = {
  body: {
    exact: [],
    potential: [
      {
        id: 'co-8',
        name: 'Acme Ltd',
        kraPin: null,
        location: 'Nairobi',
        archived: true,
        matchedOn: ['NAME'],
      },
    ],
    hiddenMatchCount: 1,
  },
};

describe('CompanyForm', () => {
  it('creates a company with normalised values and opens it', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'POST /companies/duplicate-check': () => NO_DUPLICATES,
      'POST /companies': () => ({ body: makeCompany({ id: 'co-new' }) }),
    });
    renderAs(BD_COMPANIES, <CompanyForm />);
    await user.type(screen.getByLabelText('Company name'), '  Northstar Clinic ');
    await user.type(screen.getByLabelText('KRA PIN'), ' a123456789b ');
    await user.selectOptions(screen.getByLabelText('Industry'), 'HEALTHCARE');
    await user.type(screen.getByLabelText('Staff count'), '25');
    await user.type(screen.getByLabelText('Website'), 'https://north.test');
    await user.type(
      screen.getByLabelText('Social links (one per line)'),
      'https://a.test\nhttps://a.test',
    );
    await user.click(screen.getByRole('button', { name: 'Create company' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/companies/co-new'));
    expect(calls.find((c) => c.method === 'POST' && c.path === '/companies')?.body).toMatchObject({
      name: 'Northstar Clinic',
      kraPin: 'A123456789B',
      industry: 'HEALTHCARE',
      staffCount: 25,
      website: 'https://north.test',
      socialLinks: ['https://a.test'],
    });
  });

  it('shows field errors without sending anything', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({});
    renderAs(BD_COMPANIES, <CompanyForm />);
    await user.type(screen.getByLabelText('KRA PIN'), '123');
    await user.type(screen.getByLabelText('Website'), 'ftp://x');
    await user.click(screen.getByRole('button', { name: 'Create company' }));
    expect(await screen.findByText("Enter the company's name.")).toBeInTheDocument();
    expect(screen.getByText('Enter a KRA PIN such as A123456789B.')).toBeInTheDocument();
    expect(calls.filter((c) => c.path === '/companies')).toHaveLength(0);
  });

  it('shows a matching KRA PIN as a hard stop with no way to confirm', async () => {
    const user = userEvent.setup();
    mockApi({ 'POST /companies/duplicate-check': () => exactMatch });
    renderAs(BD_COMPANIES, <CompanyForm />);
    await user.type(screen.getByLabelText('KRA PIN'), 'A123456789B');
    await user.tab();
    expect(
      await screen.findByText('This KRA PIN already belongs to a company'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Existing Co' })).toHaveAttribute(
      'href',
      '/companies/co-9',
    );
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('warns about a similar name, flags an archived match, counts hidden ones, and needs confirmation', async () => {
    const user = userEvent.setup();
    let attempt = 0;
    const { calls } = mockApi({
      'POST /companies/duplicate-check': () => nameMatch,
      'POST /companies': () => {
        attempt += 1;
        return attempt === 1
          ? apiError(409, 'COMPANY_DUPLICATE_SUSPECTED')
          : { body: makeCompany({ id: 'co-new' }) };
      },
    });
    renderAs(BD_COMPANIES, <CompanyForm />);
    await user.type(screen.getByLabelText('Company name'), 'ACME');
    await user.tab();
    expect(
      await screen.findByText(/Archived \(restore it instead of creating another\)/),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 more matching company is outside your list/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create company' }));
    const confirm = await screen.findByRole('checkbox', {
      name: /reviewed this and want to save the company anyway/,
    });
    expect(router.replace).not.toHaveBeenCalled();
    await user.click(confirm);
    await user.click(screen.getByRole('button', { name: 'Create company' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/companies/co-new'));
    const posts = calls.filter((c) => c.method === 'POST' && c.path === '/companies');
    expect(posts[0]?.body).not.toHaveProperty('acknowledgeDuplicates');
    expect(posts[1]?.body).toMatchObject({ acknowledgeDuplicates: true });
  });

  it('withdraws the confirmation when the name changes', async () => {
    const user = userEvent.setup();
    mockApi({ 'POST /companies/duplicate-check': () => nameMatch });
    renderAs(BD_COMPANIES, <CompanyForm />);
    await user.type(screen.getByLabelText('Company name'), 'ACME');
    await user.tab();
    const confirm = await screen.findByRole('checkbox');
    await user.click(confirm);
    expect(confirm).toBeChecked();
    await user.type(screen.getByLabelText('Company name'), 'X');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });

  it('explains a KRA PIN conflict the server found, keeping what was typed', async () => {
    const user = userEvent.setup();
    mockApi({
      'POST /companies/duplicate-check': () => NO_DUPLICATES,
      'POST /companies': () => apiError(409, 'COMPANY_KRA_PIN_EXISTS', 'internal detail'),
    });
    renderAs(BD_COMPANIES, <CompanyForm />);
    await user.type(screen.getByLabelText('Company name'), 'Acme');
    await user.type(screen.getByLabelText('KRA PIN'), 'A123456789B');
    await user.click(screen.getByRole('button', { name: 'Create company' }));
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((a) => /KRA PIN already exists/.test(a.textContent ?? ''))).toBe(true);
    expect(alerts.every((a) => !/internal detail/.test(a.textContent ?? ''))).toBe(true);
    expect(screen.getByLabelText('Company name')).toHaveValue('Acme');
  });

  it('puts the API’s field errors on the matching fields', async () => {
    const user = userEvent.setup();
    mockApi({
      'POST /companies/duplicate-check': () => NO_DUPLICATES,
      'POST /companies': () => ({
        status: 400,
        body: {
          statusCode: 400,
          code: 'VALIDATION_FAILED',
          message: 'x',
          requestId: 'r',
          timestamp: 't',
          path: '/',
          details: [{ path: 'location', message: 'Too long for the server' }],
        },
      }),
    });
    renderAs(BD_COMPANIES, <CompanyForm />);
    await user.type(screen.getByLabelText('Company name'), 'Acme');
    await user.click(screen.getByRole('button', { name: 'Create company' }));
    expect(await screen.findByText('Too long for the server')).toBeInTheDocument();
  });

  it('does not submit twice while a save is pending, and recovers from a failure', async () => {
    const user = userEvent.setup();
    let count = 0;
    mockApi({
      'POST /companies/duplicate-check': () => NO_DUPLICATES,
      'POST /companies': () => {
        count += 1;
        return count === 1
          ? apiError(500, 'INTERNAL_ERROR')
          : { body: makeCompany({ id: 'co-new' }) };
      },
    });
    renderAs(BD_COMPANIES, <CompanyForm />);
    await user.type(screen.getByLabelText('Company name'), 'Acme');
    const button = screen.getByRole('button', { name: 'Create company' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not complete the request');
    expect(count).toBe(1);
    expect(screen.getByRole('button', { name: 'Create company' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Create company' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/companies/co-new'));
  });

  it('lets the user save when the duplicate check itself fails', async () => {
    const user = userEvent.setup();
    mockApi({ 'POST /companies/duplicate-check': () => apiError(500, 'INTERNAL_ERROR') });
    renderAs(BD_COMPANIES, <CompanyForm />);
    await user.type(screen.getByLabelText('Company name'), 'Acme');
    await user.tab();
    expect(await screen.findByText(/could not check for duplicates/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create company' })).toBeEnabled();
  });

  it('does not re-check an edit that keeps the saved name and PIN', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({});
    renderAs(BD_COMPANIES, <CompanyForm company={makeCompany()} />);
    await user.click(screen.getByLabelText('Company name'));
    await user.tab();
    expect(calls).toHaveLength(0);
  });

  it('updates a company with PATCH, confirms, and stays on the page', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'PATCH /companies/co-1': () => ({ body: makeCompany({ location: 'Karen' }) }),
    });
    renderAs(BD_COMPANIES, <CompanyForm company={makeCompany()} />);
    const location = screen.getByLabelText('Physical location');
    await user.clear(location);
    await user.type(location, 'Karen');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Company saved.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({ location: 'Karen' });
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('cancel goes back to the list (new) or the company (edit)', async () => {
    const user = userEvent.setup();
    const { unmount } = renderAs(BD_COMPANIES, <CompanyForm />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(router.push).toHaveBeenCalledWith('/companies');
    unmount();
    renderAs(BD_COMPANIES, <CompanyForm company={makeCompany()} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(router.push).toHaveBeenLastCalledWith('/companies/co-1');
  });

  it('refuses a user without permission and renders no form', () => {
    renderAs(NO_COMPANY_ACCESS, <CompanyForm />);
    expect(screen.getByText('You do not have permission to create companies.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Company name')).not.toBeInTheDocument();
  });
});

describe('EditCompany', () => {
  it('loads the company into the form', async () => {
    mockApi({ 'GET /companies/co-1': () => ({ body: makeCompany() }) });
    renderAs(BD_COMPANIES, <EditCompany id="co-1" />);
    expect(await screen.findByRole('heading', { name: 'Update company' })).toBeInTheDocument();
    expect(screen.getByLabelText('Company name')).toHaveValue('Otieno Logistics');
    expect(screen.getByLabelText('Social links (one per line)')).toHaveValue(
      'https://linkedin.test/otieno',
    );
  });

  it('shows the error instead of an empty form when the company cannot be loaded', async () => {
    mockApi({ 'GET /companies/co-9': () => apiError(404, 'COMPANY_NOT_FOUND') });
    renderAs(BD_COMPANIES, <EditCompany id="co-9" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This company is unavailable in your list.',
    );
    expect(screen.queryByLabelText('Company name')).not.toBeInTheDocument();
  });
});
