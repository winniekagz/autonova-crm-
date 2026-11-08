// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeLead } from '@/features/leads/lead-test-fixtures';
import { resetNavigation } from '@/test/navigation';
import { apiError, mockApi, renderAs } from '@/test/render';
import { BD_REPORTS, DIRECTOR_REPORTS, makeActivity, reportsPage } from './activity-test-fixtures';
import { ActivityTimeline } from './activity-timeline';

vi.mock('next/navigation', async () => (await import('@/test/navigation')).navigationMock);

beforeEach(() => {
  resetNavigation('/leads/l-1');
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});
afterEach(() => vi.unstubAllGlobals());

const lead = makeLead({ id: 'l-1' });
const LIST = 'GET /leads/l-1/activities';
const CONTACTS = 'GET /companies/co-1/contacts';
const contact = (id: string, name: string) => ({
  id,
  companyId: 'co-1',
  name,
  jobTitle: 'CEO',
  phone: null,
  email: null,
  whatsappNumber: null,
  isDecisionMaker: false,
  archived: false,
  createdAt: 't',
  updatedAt: 't',
});
const contactsPage = (...items: ReturnType<typeof contact>[]) => ({
  body: { items, page: 1, pageSize: 100, total: items.length },
});

describe('attendee linking', () => {
  const withOutsider = () => makeActivity();

  it('links an outside attendee to a contact of the company, never creating one', async () => {
    const user = userEvent.setup();
    let linked = false;
    const { calls } = mockApi({
      [LIST]: () => reportsPage([withOutsider()]),
      [CONTACTS]: () =>
        contactsPage(contact('ct-1', 'Achieng Otieno'), contact('ct-2', 'Sam Mwangi')),
      'POST /leads/l-1/activities/a-1/attendees/at-2/link': () => {
        linked = true;
        return { body: withOutsider() };
      },
    });
    renderAs(BD_REPORTS, <ActivityTimeline lead={lead} />);
    await user.click(
      await screen.findByRole('button', { name: 'Link Sam Consultant to a contact' }),
    );
    const choose = screen.getByLabelText('Contact at the company');
    expect(within(choose).queryByText(/Achieng/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Link' })).toBeDisabled();
    await user.selectOptions(choose, 'ct-2');
    await user.click(screen.getByRole('button', { name: 'Link' }));
    expect(linked).toBe(true);
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ contactId: 'ct-2' });
    expect(calls.some((c) => c.method === 'POST' && c.path === '/companies/co-1/contacts')).toBe(
      false,
    );
  });

  it('shows the refusal in plain words', async () => {
    const user = userEvent.setup();
    mockApi({
      [LIST]: () => reportsPage([withOutsider()]),
      [CONTACTS]: () => contactsPage(contact('ct-2', 'Sam Mwangi')),
      'POST /leads/l-1/activities/a-1/attendees/at-2/link': () =>
        apiError(409, 'ATTENDEE_NOT_EXTERNAL'),
    });
    renderAs(BD_REPORTS, <ActivityTimeline lead={lead} />);
    await user.click(
      await screen.findByRole('button', { name: 'Link Sam Consultant to a contact' }),
    );
    await user.selectOptions(screen.getByLabelText('Contact at the company'), 'ct-2');
    await user.click(screen.getByRole('button', { name: 'Link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already linked to a contact');
  });

  it('is not offered to someone who cannot edit the report, or when no contact is free', async () => {
    mockApi({
      [LIST]: () =>
        reportsPage([withOutsider(), makeActivity({ id: 'a-2', createdByUserId: 'x' })]),
      [CONTACTS]: () => contactsPage(contact('ct-1', 'Achieng Otieno')),
    });
    renderAs(BD_REPORTS, <ActivityTimeline lead={lead} />);
    await screen.findAllByText(/Meeting/);
    expect(screen.queryByRole('button', { name: /Link .* to a contact/ })).not.toBeInTheDocument();
  });

  it('shows the name an attendee was recorded under once linked', async () => {
    mockApi({
      [LIST]: () =>
        reportsPage([
          makeActivity({
            attendees: [
              {
                id: 'at-2',
                kind: 'CONTACT',
                contactId: 'ct-2',
                name: 'Samuel Mwangi',
                organisation: null,
                jobTitle: 'CEO',
                recordedAs: 'Sam Consultant',
                linkedAt: '2026-11-06T09:00:00.000Z',
              },
            ],
          }),
        ]),
      [CONTACTS]: () => contactsPage(),
    });
    renderAs(BD_REPORTS, <ActivityTimeline lead={lead} />);
    expect(
      await screen.findByText(/Samuel Mwangi, recorded as “Sam Consultant”/),
    ).toBeInTheDocument();
  });
});

describe('legal holds and retention notes', () => {
  const held = () =>
    makeActivity({
      hold: {
        reference: 'MATTER-14',
        reason: 'Client dispute',
        placedAt: '2026-11-06T09:00:00.000Z',
        placedByName: 'Wanjiru Kamau',
      },
    });

  it('shows a hold to everyone but lets only a Director change it', async () => {
    mockApi({ [LIST]: () => reportsPage([held()]) });
    const { unmount } = renderAs(BD_REPORTS, <ActivityTimeline lead={lead} />);
    expect(await screen.findByText(/MATTER-14/)).toHaveTextContent(/Client dispute.*Wanjiru Kamau/);
    expect(screen.queryByRole('button', { name: 'Lift hold' })).not.toBeInTheDocument();
    unmount();
    renderAs(DIRECTOR_REPORTS, <ActivityTimeline lead={lead} />);
    expect(await screen.findByRole('button', { name: 'Lift hold' })).toBeInTheDocument();
  });

  it('places a hold only with a reference and a reason', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      [LIST]: () => reportsPage([makeActivity()]),
      'POST /leads/l-1/activities/a-1/hold': () => ({ body: held() }),
    });
    renderAs(DIRECTOR_REPORTS, <ActivityTimeline lead={lead} />);
    await user.click(await screen.findByRole('button', { name: 'Place hold' }));
    const dialog = await screen.findByRole('dialog', { name: 'Place a hold on this report?' });
    await user.click(within(dialog).getByRole('button', { name: 'Place hold' }));
    expect(within(dialog).getByText('Enter the reference.')).toBeInTheDocument();
    expect(within(dialog).getByText('Give a reason.')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    await user.type(within(dialog).getByLabelText('Reference'), 'MATTER-14');
    await user.type(within(dialog).getByLabelText('Reason'), 'Client dispute');
    await user.click(within(dialog).getByRole('button', { name: 'Place hold' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
        reference: 'MATTER-14',
        reason: 'Client dispute',
      }),
    );
  });

  it('lifts a hold with a reason', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      [LIST]: () => reportsPage([held()]),
      'DELETE /leads/l-1/activities/a-1/hold': () => ({ body: makeActivity() }),
    });
    renderAs(DIRECTOR_REPORTS, <ActivityTimeline lead={lead} />);
    await user.click(await screen.findByRole('button', { name: 'Lift hold' }));
    const dialog = await screen.findByRole('dialog', { name: 'Lift this hold?' });
    await user.type(within(dialog).getByLabelText('Reason'), 'Matter closed');
    await user.click(within(dialog).getByRole('button', { name: 'Lift hold' }));
    await vi.waitFor(() =>
      expect(calls.find((c) => c.method === 'DELETE')?.body).toEqual({ reason: 'Matter closed' }),
    );
  });

  it('tells a Director when a hold already exists', async () => {
    const user = userEvent.setup();
    mockApi({
      [LIST]: () => reportsPage([makeActivity()]),
      'POST /leads/l-1/activities/a-1/hold': () => apiError(409, 'ACTIVITY_HOLD_EXISTS'),
    });
    renderAs(DIRECTOR_REPORTS, <ActivityTimeline lead={lead} />);
    await user.click(await screen.findByRole('button', { name: 'Place hold' }));
    const dialog = await screen.findByRole('dialog', { name: 'Place a hold on this report?' });
    await user.type(within(dialog).getByLabelText('Reference'), 'M-1');
    await user.type(within(dialog).getByLabelText('Reason'), 'Dispute');
    await user.click(within(dialog).getByRole('button', { name: 'Place hold' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already under a hold');
  });

  it('says so when retention has cleared a check-in', async () => {
    mockApi({ [LIST]: () => reportsPage([makeActivity({ gpsCleared: true })]) });
    renderAs(BD_REPORTS, <ActivityTimeline lead={lead} />);
    expect(await screen.findByText('Cleared under the retention policy.')).toBeInTheDocument();
  });
});
