// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentUrl, resetNavigation } from '@/test/navigation';
import { DIRECTOR, apiError, mockApi, renderAs } from '@/test/render';
import { BD, READ_ONLY, makeLead, page } from './lead-test-fixtures';
import { LeadsList } from './leads-list';

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

describe('LeadsList', () => {
  it('shows a loading state, then leads with readable stage names and links', async () => {
    mockApi({ 'GET /leads': () => page([makeLead({ stage: 'NEW_LEAD' })]) });
    renderAs(BD, <LeadsList />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading leads');
    const link = await screen.findByRole('link', { name: 'Achieng Otieno' });
    expect(link).toHaveAttribute('href', '/leads/l-1');
    expect(screen.getByText('New Lead')).toBeInTheDocument();
    expect(screen.getByText('1 lead')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New lead' })).toHaveAttribute('href', '/leads/new');
  });

  it('shows an empty state when there are no leads', async () => {
    mockApi({ 'GET /leads': () => page([]) });
    renderAs(BD, <LeadsList />);
    expect(await screen.findByText('No leads yet')).toBeInTheDocument();
  });

  it('shows a safe message for a server refusal, never the raw error', async () => {
    mockApi({ 'GET /leads': () => apiError(403, 'FORBIDDEN', 'raw backend detail') });
    renderAs(BD, <LeadsList />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('You do not have access to this lead.');
    expect(alert).not.toHaveTextContent('raw backend detail');
  });

  it('makes no request and explains when the user may not list leads', () => {
    const { calls } = mockApi({});
    renderAs({ ...DIRECTOR, permissions: [] }, <LeadsList />);
    expect(screen.getByText('You do not have permission to view leads.')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('hides "New lead" from someone who cannot create', async () => {
    mockApi({ 'GET /leads': () => page([makeLead()]) });
    renderAs(READ_ONLY, <LeadsList />);
    await screen.findByRole('link', { name: 'Achieng Otieno' });
    expect(screen.queryByRole('link', { name: 'New lead' })).not.toBeInTheDocument();
  });

  it('searches on the server and pages through results', async () => {
    const user = userEvent.setup();
    const seen: string[] = [];
    mockApi({
      'GET /leads': ({ url }) => {
        seen.push(url.search);
        return page([makeLead()], 45);
      },
    });
    renderAs(BD, <LeadsList />);
    await screen.findByRole('link', { name: 'Achieng Otieno' });

    await user.type(screen.getByRole('searchbox', { name: 'Search leads' }), 'otieno');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(seen.at(-1)).toContain('q=otieno'));
    expect(seen.at(-1)).toContain('page=1');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(seen.at(-1)).toContain('page=2'));
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
  });
});

describe('LeadsList keeps its view in the URL', () => {
  beforeEach(() => resetNavigation('/leads'));

  it('restores search and page from a link and sends exactly those to the API', async () => {
    resetNavigation('/leads?q=otieno&page=2');
    const seen: URLSearchParams[] = [];
    mockApi({
      'GET /leads': ({ url }) => {
        seen.push(url.searchParams);
        return page([makeLead()], 45);
      },
    });
    renderAs(BD, <LeadsList />);
    await screen.findByRole('link', { name: 'Achieng Otieno' });
    expect(seen[0]?.get('q')).toBe('otieno');
    expect(seen[0]?.get('page')).toBe('2');
    expect(screen.getByRole('searchbox', { name: 'Search leads' })).toHaveValue('otieno');
  });

  it('writes search and paging to the URL; the default page stays out of it', async () => {
    const user = userEvent.setup();
    resetNavigation('/leads?page=3');
    mockApi({ 'GET /leads': () => page([makeLead()], 90) });
    renderAs(BD, <LeadsList />);
    await screen.findByRole('link', { name: 'Achieng Otieno' });

    await user.type(screen.getByRole('searchbox', { name: 'Search leads' }), ' otieno ');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(currentUrl()).toBe('/leads?q=otieno');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(currentUrl()).toBe('/leads?q=otieno&page=2');
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(currentUrl()).toBe('/leads?q=otieno');
  });

  it.each([['page=0'], ['page=abc'], ['page=-4'], ['page=1e9']])(
    'ignores a bad page (%s)',
    async (query) => {
      resetNavigation(`/leads?${query}`);
      const seen: URLSearchParams[] = [];
      mockApi({
        'GET /leads': ({ url }) => {
          seen.push(url.searchParams);
          return page([makeLead()]);
        },
      });
      renderAs(BD, <LeadsList />);
      await screen.findByRole('link', { name: 'Achieng Otieno' });
      expect(seen[0]?.get('page')).toBe('1');
    },
  );

  it('caps an overlong search and follows Back', async () => {
    resetNavigation(`/leads?q=${'y'.repeat(300)}`);
    const seen: URLSearchParams[] = [];
    mockApi({
      'GET /leads': ({ url }) => {
        seen.push(url.searchParams);
        return page([makeLead()]);
      },
    });
    renderAs(BD, <LeadsList />);
    await screen.findByRole('link', { name: 'Achieng Otieno' });
    expect(seen[0]?.get('q')).toHaveLength(100);

    resetNavigation('/leads');
    await waitFor(() => expect(seen.at(-1)?.has('q')).toBe(false));
    expect(screen.getByRole('searchbox', { name: 'Search leads' })).toHaveValue('');
  });
});
