// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentUrl, resetNavigation, router } from '@/test/navigation';
import { DIRECTOR, ROLES, makeUser, mockApi, renderAs } from '@/test/render';
import { UserList } from './user-list';

vi.mock('next/navigation', async () => (await import('@/test/navigation')).navigationMock);
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
afterEach(() => vi.unstubAllGlobals());

const usersPage = (items = [makeUser()], page = 1, total = items.length) => ({
  body: { items, page, pageSize: 20, total },
});

function serve(handler?: (params: URLSearchParams) => ReturnType<typeof usersPage>) {
  const seen: URLSearchParams[] = [];
  mockApi({
    'GET /users': ({ url }) => {
      seen.push(url.searchParams);
      return handler ? handler(url.searchParams) : usersPage();
    },
    'GET /roles': () => ({ body: ROLES }),
  });
  return seen;
}

describe('UserList keeps its view in the URL', () => {
  beforeEach(() => resetNavigation('/users'));

  it('restores search, filters and page from a link and sends exactly those to the API', async () => {
    resetNavigation('/users?q=wanj&status=ACTIVE&role=finance&page=2');
    const seen = serve(() => usersPage([makeUser()], 2, 45));
    renderAs(DIRECTOR, <UserList />);

    await screen.findByRole('list', { name: 'Users' });
    const first = seen[0];
    expect(first?.get('q')).toBe('wanj');
    expect(first?.get('status')).toBe('ACTIVE');
    expect(first?.get('role')).toBe('finance');
    expect(first?.get('page')).toBe('2');

    expect(screen.getByLabelText('Search')).toHaveValue('wanj');
    expect(screen.getByLabelText('Status')).toHaveValue('ACTIVE');
    await waitFor(() => expect(screen.getByLabelText('Role')).toHaveValue('finance'));
    expect(screen.getByText(/Page 2 of 3/)).toBeInTheDocument();
  });

  it('writes a search to the URL as a new history entry and resets to page 1', async () => {
    const user = userEvent.setup();
    resetNavigation('/users?page=3');
    serve();
    renderAs(DIRECTOR, <UserList />);
    await screen.findByRole('list', { name: 'Users' });

    await user.type(screen.getByLabelText('Search'), '  wanj ');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/users?q=wanj', { scroll: false });
    expect(currentUrl()).toBe('/users?q=wanj');
  });

  it('writes filters to the URL, keeping the search, and drops the page', async () => {
    const user = userEvent.setup();
    resetNavigation('/users?q=wanj&page=2');
    serve();
    renderAs(DIRECTOR, <UserList />);
    await screen.findByRole('list', { name: 'Users' });
    await screen.findByRole('option', { name: 'Finance' });

    await user.selectOptions(screen.getByLabelText('Status'), 'DISABLED');
    expect(currentUrl()).toBe('/users?q=wanj&status=DISABLED');
    await user.selectOptions(screen.getByLabelText('Role'), 'finance');
    expect(currentUrl()).toBe('/users?q=wanj&status=DISABLED&role=finance');
    await user.selectOptions(screen.getByLabelText('Status'), '');
    expect(currentUrl()).toBe('/users?q=wanj&role=finance');
  });

  it('keeps the default page out of the URL and writes later pages into it', async () => {
    const user = userEvent.setup();
    serve((params) => usersPage([makeUser()], Number(params.get('page')), 45));
    renderAs(DIRECTOR, <UserList />);
    await screen.findByText(/Page 1 of 3/);

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(currentUrl()).toBe('/users?page=2');
    await screen.findByText(/Page 2 of 3/);
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(currentUrl()).toBe('/users');
  });

  it('follows Back and Forward: a URL change alone re-runs the query and refills the form', async () => {
    const user = userEvent.setup();
    const seen = serve();
    renderAs(DIRECTOR, <UserList />);
    await screen.findByRole('list', { name: 'Users' });
    await user.type(screen.getByLabelText('Search'), 'abc');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(seen.at(-1)?.get('q')).toBe('abc'));

    // What the browser's Back button does: the URL changes without any click in the page.
    resetNavigation('/users');
    await waitFor(() => expect(seen.at(-1)?.has('q')).toBe(false));
    expect(screen.getByLabelText('Search')).toHaveValue('');
  });

  describe('hostile or stale URLs are ignored, never forwarded', () => {
    it.each([
      ['page=0'],
      ['page=-1'],
      ['page=abc'],
      ['page=1e9'],
      ['page=99999999999'],
      ['status=HACKED'],
      ['status=active'],
      ['role=Director'],
      ['role=%3Cscript%3E'],
      ['role=../../etc'],
    ])('%s', async (query) => {
      resetNavigation(`/users?${query}`);
      const seen = serve();
      renderAs(DIRECTOR, <UserList />);
      await screen.findByRole('list', { name: 'Users' });
      const first = seen[0];
      expect(first?.get('page')).toBe('1');
      expect(first?.has('status')).toBe(false);
      expect(first?.has('role')).toBe(false);
    });

    it('caps an overlong search at what the API accepts', async () => {
      resetNavigation(`/users?q=${'x'.repeat(400)}`);
      const seen = serve();
      renderAs(DIRECTOR, <UserList />);
      await screen.findByRole('list', { name: 'Users' });
      expect(seen[0]?.get('q')).toHaveLength(100);
    });

    it('renders a markup-looking search as text, not HTML', async () => {
      resetNavigation('/users?q=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E');
      serve();
      const { container } = renderAs(DIRECTOR, <UserList />);
      await screen.findByRole('list', { name: 'Users' });
      expect(container.querySelector('img')).toBeNull();
      expect(screen.getByLabelText('Search')).toHaveValue('<img src=x onerror=alert(1)>');
    });

    it('ignores unrelated parameters instead of passing them on', async () => {
      resetNavigation('/users?utm_source=mail&debug=1');
      const seen = serve();
      renderAs(DIRECTOR, <UserList />);
      await screen.findByRole('list', { name: 'Users' });
      expect([...(seen[0]?.keys() ?? [])].sort()).toEqual(['page', 'pageSize']);
    });
  });

  it('explains an out-of-range page and offers the way back, instead of the "No users yet" screen', async () => {
    const user = userEvent.setup();
    resetNavigation('/users?page=9');
    serve((params) => (params.get('page') === '1' ? usersPage() : usersPage([], 9, 1)));
    renderAs(DIRECTOR, <UserList />);

    expect(await screen.findByText(/no users on page 9/i)).toBeInTheDocument();
    expect(screen.queryByText('No users yet')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Go to the first page' }));
    expect(currentUrl()).toBe('/users');
    expect(await screen.findByRole('list', { name: 'Users' })).toBeInTheDocument();
  });

  it('says "match your filters" for a filtered search that finds nothing', async () => {
    resetNavigation('/users?q=zzz');
    serve(() => usersPage([], 1, 0));
    renderAs(DIRECTOR, <UserList />);
    expect(await screen.findByText('No users match your filters')).toBeInTheDocument();
  });
});
