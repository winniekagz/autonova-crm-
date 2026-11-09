// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetNavigation, router } from '@/test/navigation';
import { apiError, mockApi, renderAs } from '@/test/render';
import { CompaniesList } from './companies-list';
import {
  BD_COMPANIES,
  DIRECTOR_COMPANIES,
  NO_COMPANY_ACCESS,
  makeCompany,
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

beforeEach(() => resetNavigation('/companies'));
afterEach(() => vi.unstubAllGlobals());

describe('CompaniesList', () => {
  it('shows companies with their counts and links to each', async () => {
    mockApi({
      'GET /companies': () =>
        pageOf([
          makeCompany(),
          makeCompany({ id: 'co-2', name: 'Zeta', kraPin: null, industry: null }),
        ]),
    });
    renderAs(BD_COMPANIES, <CompaniesList />);
    expect(await screen.findByRole('link', { name: 'Otieno Logistics' })).toHaveAttribute(
      'href',
      '/companies/co-1',
    );
    expect(screen.getByText('A123456789B')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('Logistics')).toBeInTheDocument();
    expect(screen.getByText(/of\s*2 companies/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New company' })).toHaveAttribute(
      'href',
      '/companies/new',
    );
  });

  it('shows a loading state, then an empty state with guidance', async () => {
    mockApi({ 'GET /companies': () => pageOf([]) });
    renderAs(BD_COMPANIES, <CompaniesList />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading companies');
    expect(await screen.findByText('No companies yet')).toBeInTheDocument();
  });

  it('tells a filtered search with no results apart from an empty list', async () => {
    resetNavigation('/companies?q=nothing');
    mockApi({ 'GET /companies': () => pageOf([]) });
    renderAs(BD_COMPANIES, <CompaniesList />);
    expect(await screen.findByText('No companies match')).toBeInTheDocument();
  });

  it('puts the search and industry in the URL and sends them to the API', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({ 'GET /companies': () => pageOf([makeCompany()]) });
    renderAs(BD_COMPANIES, <CompaniesList />);
    await screen.findByText('Otieno Logistics');
    await user.type(screen.getByLabelText('Search companies'), 'otieno');
    await user.selectOptions(screen.getByLabelText('Industry'), 'LOGISTICS');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(router.push).toHaveBeenCalledWith(
      expect.stringContaining('q=otieno'),
      expect.anything(),
    );
    expect(router.push).toHaveBeenCalledWith(
      expect.stringContaining('industry=LOGISTICS'),
      expect.anything(),
    );
    expect(calls[0]?.path).toBe('/companies');
  });

  it('reads search, filter and page from the URL', async () => {
    resetNavigation('/companies?q=acme&industry=RETAIL&page=2');
    const { calls } = mockApi({ 'GET /companies': () => pageOf([makeCompany()], 45) });
    renderAs(BD_COMPANIES, <CompaniesList />);
    await screen.findByText('Otieno Logistics');
    expect(screen.getByLabelText('Search companies')).toHaveValue('acme');
    expect(calls).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('shows archived companies only to users who may archive', async () => {
    mockApi({ 'GET /companies': () => pageOf([]) });
    const { unmount } = renderAs(BD_COMPANIES, <CompaniesList />);
    await screen.findByText('No companies yet');
    expect(screen.queryByLabelText('Include archived')).not.toBeInTheDocument();
    unmount();
    renderAs(DIRECTOR_COMPANIES, <CompaniesList />);
    expect(await screen.findByLabelText('Include archived')).toBeInTheDocument();
  });

  it('refuses a user without permission and makes no request', () => {
    const { calls } = mockApi({});
    renderAs(NO_COMPANY_ACCESS, <CompaniesList />);
    expect(screen.getByText('You do not have permission to view companies.')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('shows a safe error with a way to retry, never the server text', async () => {
    mockApi({
      'GET /companies': () => apiError(500, 'INTERNAL_ERROR', 'select * from companies failed'),
    });
    renderAs(BD_COMPANIES, <CompaniesList />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('We could not complete the request');
    expect(alert).not.toHaveTextContent('select *');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
