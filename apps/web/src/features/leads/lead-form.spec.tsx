// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetNavigation, router } from '@/test/navigation';
import { apiError, mockApi, renderAs } from '@/test/render';
import { BD, READ_ONLY, makeLead } from './lead-test-fixtures';
import { EditLead, LeadForm } from './lead-form';

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

describe('EditLead', () => {
  it('loads the lead into the form', async () => {
    mockApi({ 'GET /leads/l-1': () => ({ body: makeLead() }) });
    renderAs(BD, <EditLead id="l-1" />);
    expect(await screen.findByRole('heading', { name: 'Update lead' })).toBeInTheDocument();
    expect(screen.getByLabelText('Person name')).toHaveValue('Achieng Otieno');
  });

  it('shows the error instead of an empty form when the lead cannot be loaded', async () => {
    mockApi({ 'GET /leads/l-9': () => apiError(401, 'UNAUTHENTICATED') });
    renderAs(BD, <EditLead id="l-9" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your session ended. Sign in again.',
    );
    expect(screen.queryByLabelText('Person name')).not.toBeInTheDocument();
  });
});

describe('LeadForm', () => {
  it('creates a lead with trimmed values, then moves to the new lead', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({ 'POST /leads': () => ({ body: makeLead({ id: 'l-new' }) }) });
    renderAs(BD, <LeadForm />);

    await user.type(screen.getByLabelText('Person name'), '  Wanjiru Kamau  ');
    await user.type(screen.getByLabelText('Email'), '  Wanjiru@Example.TEST ');
    await user.type(screen.getByLabelText('Next action'), 'Send the proposal');
    await user.click(screen.getByRole('button', { name: 'Create lead' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/leads/l-new'));
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.body).toMatchObject({
      name: 'Wanjiru Kamau',
      email: 'wanjiru@example.test',
      nextAction: 'Send the proposal',
      source: 'WEBSITE',
      currency: 'KES',
    });
  });

  it('keeps what the user typed and says why when saving fails', async () => {
    const user = userEvent.setup();
    mockApi({ 'POST /leads': () => apiError(500, 'INTERNAL_ERROR') });
    renderAs(BD, <LeadForm />);
    await user.type(screen.getByLabelText('Person name'), 'Wanjiru Kamau');
    await user.type(screen.getByLabelText('Next action'), 'Call');
    await user.click(screen.getByRole('button', { name: 'Create lead' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('We could not complete the request');
    expect(screen.getByLabelText('Person name')).toHaveValue('Wanjiru Kamau');
    expect(screen.getByRole('button', { name: 'Create lead' })).toBeEnabled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('shows the referrer field only for referral leads', async () => {
    const user = userEvent.setup();
    renderAs(BD, <LeadForm />);
    expect(screen.queryByLabelText('Referrer name')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Lead source'), 'REFERRAL');
    expect(screen.getByLabelText('Referrer name')).toBeInTheDocument();
  });

  it('updates an existing lead with PATCH and confirms', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      'PATCH /leads/l-1': () => ({ body: makeLead({ nextAction: 'Visit' }) }),
    });
    renderAs(BD, <LeadForm lead={makeLead()} />);
    const next = screen.getByLabelText('Next action');
    await user.clear(next);
    await user.type(next, 'Visit');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Lead saved.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({ nextAction: 'Visit' });
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('cancel goes back to the list (new) or the lead (edit)', async () => {
    const user = userEvent.setup();
    const { unmount } = renderAs(BD, <LeadForm />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(router.push).toHaveBeenCalledWith('/leads');
    unmount();
    renderAs(BD, <LeadForm lead={makeLead()} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(router.push).toHaveBeenLastCalledWith('/leads/l-1');
  });

  it('refuses a user without permission and renders no form', () => {
    renderAs(READ_ONLY, <LeadForm />);
    expect(screen.getByText('You do not have permission to create leads.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Person name')).not.toBeInTheDocument();
  });
});

describe('LeadForm validation', () => {
  beforeEach(() => resetNavigation('/leads/new'));

  it('shows each problem next to its field and sends nothing', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({});
    renderAs(BD, <LeadForm />);
    await user.click(screen.getByRole('button', { name: 'Create lead' }));

    expect(await screen.findByText("Enter the lead's name.")).toBeInTheDocument();
    expect(screen.getByText('Enter the next action.')).toBeInTheDocument();
    expect(screen.getByLabelText('Person name')).toBeInvalid();
    expect(screen.getByLabelText('Next action')).toBeInvalid();
    expect(calls).toHaveLength(0);
  });

  it('catches a bad email, deal value and probability before the network', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({});
    renderAs(BD, <LeadForm />);
    await user.type(screen.getByLabelText('Person name'), 'Wanjiru');
    await user.type(screen.getByLabelText('Next action'), 'Call');
    await user.type(screen.getByLabelText('Email'), 'nope');
    await user.type(screen.getByLabelText('Estimated deal value'), '12.345');
    await user.type(screen.getByLabelText(/Probability/), '150');
    await user.click(screen.getByRole('button', { name: 'Create lead' }));

    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(
      screen.getByText('Use a non-negative amount with up to two decimals.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Enter a whole number from 0 to 100.')).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('asks for the referrer once the source is Referral, and nothing is sent until it is given', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({ 'POST /leads': () => ({ body: makeLead({ id: 'l-ref' }) }) });
    renderAs(BD, <LeadForm />);
    await user.type(screen.getByLabelText('Person name'), 'Wanjiru');
    await user.type(screen.getByLabelText('Next action'), 'Call');
    await user.selectOptions(screen.getByLabelText('Lead source'), 'REFERRAL');
    await user.click(screen.getByRole('button', { name: 'Create lead' }));
    expect(await screen.findByText('Enter the referrer for a referral lead.')).toBeInTheDocument();
    expect(calls).toHaveLength(0);

    await user.type(screen.getByLabelText('Referrer name'), 'Brian');
    await user.click(screen.getByRole('button', { name: 'Create lead' }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/leads/l-ref'));
    expect(calls[0]?.body).toMatchObject({ source: 'REFERRAL', referrerName: 'Brian' });
  });

  it('sends the probability as a number and omits it when left empty', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({ 'POST /leads': () => ({ body: makeLead({ id: 'l-p' }) }) });
    renderAs(BD, <LeadForm />);
    await user.type(screen.getByLabelText('Person name'), 'Wanjiru');
    await user.type(screen.getByLabelText('Next action'), 'Call');
    await user.type(screen.getByLabelText(/Probability/), '40');
    await user.click(screen.getByRole('button', { name: 'Create lead' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toMatchObject({ probability: 40 });
  });

  it('turns the follow-up date the user picks into the request time', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({ 'POST /leads': () => ({ body: makeLead({ id: 'l-d' }) }) });
    renderAs(BD, <LeadForm />);
    await user.type(screen.getByLabelText('Person name'), 'Wanjiru');
    await user.type(screen.getByLabelText('Next action'), 'Call');
    fireEvent.change(screen.getByLabelText('Follow-up date'), { target: { value: '2026-12-24' } });
    await user.click(screen.getByRole('button', { name: 'Create lead' }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]?.body).toMatchObject({
      nextActionAt: new Date('2026-12-24T09:00:00').toISOString(),
    });
  });

  it('shows a server field error on its field and keeps everything typed', async () => {
    const user = userEvent.setup();
    mockApi({
      'POST /leads': () => ({
        status: 400,
        body: {
          statusCode: 400,
          code: 'VALIDATION_FAILED',
          message: 'Request validation failed',
          details: [
            { path: 'email', message: 'Server says no' },
            { path: '__proto__', message: 'ignored' },
          ],
          requestId: 'r',
          timestamp: 't',
          path: '/',
        },
      }),
    });
    renderAs(BD, <LeadForm />);
    await user.type(screen.getByLabelText('Person name'), 'Wanjiru');
    await user.type(screen.getByLabelText('Next action'), 'Call');
    await user.click(screen.getByRole('button', { name: 'Create lead' }));

    expect(await screen.findByText('Server says no')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInvalid();
    expect(screen.getByLabelText('Person name')).toHaveValue('Wanjiru');
    expect(screen.queryByText('ignored')).not.toBeInTheDocument();
  });

  it('prevents a double submit while saving', async () => {
    const user = userEvent.setup();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const fetchMock = vi.fn(async () => {
      await gate;
      return new Response(JSON.stringify(makeLead({ id: 'l-once' })), { status: 201 });
    });
    vi.stubGlobal('fetch', fetchMock);
    renderAs(BD, <LeadForm />);
    await user.type(screen.getByLabelText('Person name'), 'Wanjiru');
    await user.type(screen.getByLabelText('Next action'), 'Call');
    await user.click(screen.getByRole('button', { name: 'Create lead' }));
    const busy = await screen.findByRole('button', { name: 'Saving…' });
    expect(busy).toBeDisabled();
    await user.click(busy);
    release();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/leads/l-once'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
