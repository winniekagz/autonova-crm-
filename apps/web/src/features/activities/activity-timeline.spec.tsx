// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeLead } from '@/features/leads/lead-test-fixtures';
import { resetNavigation } from '@/test/navigation';
import { apiError, mockApi, renderAs } from '@/test/render';
import {
  BD_REPORTS,
  DIRECTOR_REPORTS,
  NO_REPORT_ACCESS,
  READ_ONLY_REPORTS,
  makeActivity,
  reportsPage,
} from './activity-test-fixtures';
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
const contacts = {
  body: {
    items: [
      {
        id: 'ct-1',
        companyId: 'co-1',
        name: 'Achieng Otieno',
        jobTitle: 'CEO',
        phone: null,
        email: null,
        whatsappNumber: null,
        isDecisionMaker: true,
        role: null,
        archived: false,
        createdAt: 't',
        updatedAt: 't',
      },
    ],
    page: 1,
    pageSize: 100,
    total: 1,
  },
};

describe('ActivityTimeline', () => {
  it('shows each report with what happened, who recorded it, and when, in Nairobi time', async () => {
    mockApi({ [LIST]: () => reportsPage([makeActivity()]) });
    renderAs(BD_REPORTS, <ActivityTimeline lead={lead} />);
    expect(await screen.findByText(/Meeting · Westlands office/)).toBeInTheDocument();
    expect(screen.getByText(/5 Nov 2026, 10:00 · recorded by Brian Mwangi/)).toBeInTheDocument();
    expect(screen.getByText('Achieng Otieno, Sam Consultant (Acme IT)')).toBeInTheDocument();
    expect(screen.getByText('Walked through the fleet tracking proposal.')).toBeInTheDocument();
    expect(screen.getByText('Drivers fill paper logbooks')).toBeInTheDocument();
    expect(screen.getByText('Excel and WhatsApp')).toBeInTheDocument();
    expect(screen.getByText('Send a quote by Friday')).toBeInTheDocument();
  });

  it('keeps the occurrence date apart from the recording date, and shows an edit', async () => {
    mockApi({
      [LIST]: () => reportsPage([makeActivity({ updatedAt: '2026-11-06T12:00:00.000Z' })]),
    });
    renderAs(BD_REPORTS, <ActivityTimeline lead={lead} />);
    expect(
      await screen.findByText(/5 Nov 2026, 10:00 · recorded by .* · edited 6 Nov 2026, 15:00/),
    ).toBeInTheDocument();
  });

  it('shows the check-in for a site visit and an attachment count', async () => {
    mockApi({
      [LIST]: () =>
        reportsPage([
          makeActivity({
            type: 'VISIT',
            gps: { latitude: -1.29207, longitude: 36.82195 },
            attachmentCount: 3,
          }),
        ]),
    });
    renderAs(BD_REPORTS, <ActivityTimeline lead={lead} />);
    expect(await screen.findByText('-1.29207, 36.82195')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Attachments (3)' })).toBeInTheDocument();
  });

  it('shows a saved check-in map only after Show map is pressed', async () => {
    const user = userEvent.setup();
    mockApi({
      [LIST]: () =>
        reportsPage([
          makeActivity({ type: 'VISIT', gps: { latitude: -1.29207, longitude: 36.82195 } }),
        ]),
    });
    renderAs(BD_REPORTS, <ActivityTimeline lead={lead} />);
    await screen.findByText('-1.29207, 36.82195');
    expect(screen.queryByRole('img', { name: /Map of the check-in/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show map' }));
    const map = screen.getByRole('img', { name: 'Map of the check-in at -1.29207, 36.82195' });
    expect(map).toHaveAttribute('data-lat', '-1.29207');
    await user.click(screen.getByRole('button', { name: 'Hide map' }));
    expect(screen.queryByRole('img', { name: /Map of the check-in/ })).not.toBeInTheDocument();
  });

  it('shows loading, then an empty state that explains what to record', async () => {
    mockApi({ [LIST]: () => reportsPage([]) });
    renderAs(BD_REPORTS, <ActivityTimeline lead={lead} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading visits and calls');
    expect(await screen.findByText(/No visits or calls recorded yet/)).toBeInTheDocument();
    expect(screen.getByText(/never moves the lead to another stage/)).toBeInTheDocument();
  });

  it('shows a safe error with a way to retry', async () => {
    mockApi({
      [LIST]: () => apiError(500, 'INTERNAL_ERROR', 'relation "activities" does not exist'),
    });
    renderAs(BD_REPORTS, <ActivityTimeline lead={lead} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('We could not complete the request');
    expect(alert).not.toHaveTextContent('relation');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('pages through a long history instead of loading it all', async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      [LIST]: ({ url }) => {
        const page = Number(url.searchParams.get('page'));
        return {
          body: {
            items: [makeActivity({ id: `a-${page}`, discussion: `Page ${page} discussion` })],
            page,
            pageSize: 10,
            total: 25,
          },
        };
      },
    });
    renderAs(BD_REPORTS, <ActivityTimeline lead={lead} />);
    expect(await screen.findByText('Page 1 discussion')).toBeInTheDocument();
    expect(screen.getByText('25 reports · page 1 of 3')).toBeInTheDocument();
    expect(calls[0]?.path).toBe('/leads/l-1/activities');
    await user.click(screen.getByRole('button', { name: 'Older' }));
    expect(await screen.findByText('Page 2 discussion')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Newer' })).toBeEnabled();
  });

  it('renders nothing and requests nothing for a user without access', () => {
    const { calls } = mockApi({});
    const { container } = renderAs(NO_REPORT_ACCESS, <ActivityTimeline lead={lead} />);
    expect(container).toBeEmptyDOMElement();
    expect(calls).toHaveLength(0);
  });

  it('lets a reader look but not record, edit or archive', async () => {
    mockApi({ [LIST]: () => reportsPage([makeActivity()]) });
    renderAs(READ_ONLY_REPORTS, <ActivityTimeline lead={lead} />);
    await screen.findByText(/Meeting/);
    expect(
      screen.queryByRole('button', { name: 'Record a visit or call' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Archive/ })).not.toBeInTheDocument();
  });

  it('offers edit only on the user’s own reports to a salesperson, never archive, and both to a Director', async () => {
    mockApi({
      [LIST]: () =>
        reportsPage([
          makeActivity(),
          makeActivity({ id: 'a-2', createdByUserId: 'someone-else', type: 'CALL' }),
        ]),
    });
    const { unmount } = renderAs(BD_REPORTS, <ActivityTimeline lead={lead} />);
    await screen.findByText(/Meeting/);
    expect(screen.getAllByRole('button', { name: /^Edit/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Edit Meeting report' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Archive/ })).not.toBeInTheDocument();
    unmount();
    renderAs(DIRECTOR_REPORTS, <ActivityTimeline lead={lead} />);
    await screen.findByText(/Meeting/);
    expect(screen.getAllByRole('button', { name: /^Edit/ })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /^Archive/ })).toHaveLength(2);
  });

  it('archives a report only after a Director confirms with a reason, then refreshes the timeline', async () => {
    const user = userEvent.setup();
    let archived = false;
    const { calls } = mockApi({
      [LIST]: () => reportsPage(archived ? [] : [makeActivity()]),
      'POST /leads/l-1/activities/a-1/archive': () => {
        archived = true;
        return { body: makeActivity({ archived: true }) };
      },
    });
    renderAs(DIRECTOR_REPORTS, <ActivityTimeline lead={lead} />);
    await user.click(await screen.findByRole('button', { name: 'Archive Meeting report' }));
    const dialog = await screen.findByRole('dialog', { name: /Archive/ });
    expect(dialog).toHaveTextContent(/the reason is kept in the history/);
    await user.click(within(dialog).getByRole('button', { name: /^Archive/ }));
    expect(within(dialog).getByText('Give a reason.')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    await user.type(within(dialog).getByLabelText('Reason'), ' Logged on the wrong lead ');
    await user.click(within(dialog).getByRole('button', { name: /^Archive/ }));
    expect(await screen.findByText('Report archived.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      reason: 'Logged on the wrong lead',
    });
    expect(await screen.findByText(/No visits or calls recorded yet/)).toBeInTheDocument();
  });

  it('says plainly when the server refuses the archive because the caller is not a Director', async () => {
    const user = userEvent.setup();
    mockApi({
      [LIST]: () => reportsPage([makeActivity()]),
      'POST /leads/l-1/activities/a-1/archive': () => apiError(403, 'ACTIVITY_DIRECTOR_ONLY'),
    });
    renderAs(DIRECTOR_REPORTS, <ActivityTimeline lead={lead} />);
    await user.click(await screen.findByRole('button', { name: 'Archive Meeting report' }));
    const dialog = await screen.findByRole('dialog', { name: /Archive/ });
    await user.type(within(dialog).getByLabelText('Reason'), 'Duplicate');
    await user.click(within(dialog).getByRole('button', { name: /^Archive/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only a Director can archive');
  });

  describe('recording a report', () => {
    it('records a report with the chosen date and time, and shows it afterwards', async () => {
      const user = userEvent.setup();
      let items: object[] = [];
      const { calls } = mockApi({
        [LIST]: () => reportsPage(items),
        'POST /leads/l-1/activities': ({ body }) => {
          items = [
            makeActivity({ discussion: String((body as { discussion: string }).discussion) }),
          ];
          return { status: 201, body: items[0] };
        },
      });
      renderAs(BD_REPORTS, <ActivityTimeline lead={{ ...lead, company: null }} />);
      await screen.findByText(/No visits or calls recorded yet/);
      await user.click(screen.getByRole('button', { name: 'Record a visit or call' }));
      const form = screen.getByRole('form', { name: 'Record a visit or call' });
      await user.selectOptions(within(form).getByLabelText('Type'), 'DEMO');
      fireEvent.change(within(form).getByLabelText('Date it happened'), {
        target: { value: '2026-10-30' },
      });
      fireEvent.change(within(form).getByLabelText('Time (Nairobi)'), {
        target: { value: '09:15' },
      });
      await user.type(within(form).getByLabelText('Discussion'), '  Showed the dashboard ');
      await user.type(within(form).getByLabelText('Client pain points'), 'Slow reports');
      await user.type(within(form).getByLabelText('Next steps'), 'Send a quote');
      await user.click(within(form).getByRole('button', { name: 'Record report' }));
      expect(await screen.findByText('Report recorded.')).toBeInTheDocument();
      expect(await screen.findByText('Showed the dashboard')).toBeInTheDocument();
      const post = calls.find((c) => c.method === 'POST');
      expect(post?.body).toMatchObject({
        type: 'DEMO',
        occurredAt: '2026-10-30T06:15:00.000Z',
        discussion: 'Showed the dashboard',
        painPoints: 'Slow reports',
        nextSteps: 'Send a quote',
      });
      expect(
        screen.queryByRole('form', { name: 'Record a visit or call' }),
      ).not.toBeInTheDocument();
    });

    it('checks the form before sending, and keeps what was typed', async () => {
      const user = userEvent.setup();
      const { calls } = mockApi({ [LIST]: () => reportsPage([]) });
      renderAs(BD_REPORTS, <ActivityTimeline lead={{ ...lead, company: null }} />);
      await user.click(await screen.findByRole('button', { name: 'Record a visit or call' }));
      const form = screen.getByRole('form', { name: 'Record a visit or call' });
      await user.type(within(form).getByLabelText('Location'), 'Karen');
      await user.click(within(form).getByRole('button', { name: 'Record report' }));
      expect(await within(form).findByText('Describe what was discussed.')).toBeInTheDocument();
      expect(within(form).getByLabelText('Location')).toHaveValue('Karen');
      expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    });

    it('puts the API’s field errors on the form and keeps the report for another try', async () => {
      const user = userEvent.setup();
      mockApi({
        [LIST]: () => reportsPage([]),
        'POST /leads/l-1/activities': () => ({
          status: 400,
          body: {
            statusCode: 400,
            code: 'VALIDATION_FAILED',
            message: 'x',
            requestId: 'r',
            timestamp: 't',
            path: '/',
            details: [{ path: 'occurredAt', message: 'That time is in the future.' }],
          },
        }),
      });
      renderAs(BD_REPORTS, <ActivityTimeline lead={{ ...lead, company: null }} />);
      await user.click(await screen.findByRole('button', { name: 'Record a visit or call' }));
      const form = screen.getByRole('form', { name: 'Record a visit or call' });
      await user.type(within(form).getByLabelText('Discussion'), 'Talked');
      await user.click(within(form).getByRole('button', { name: 'Record report' }));
      expect(await within(form).findByText('That time is in the future.')).toBeInTheDocument();
      expect(within(form).getByLabelText('Discussion')).toHaveValue('Talked');
    });

    it('does not send twice on a double click, and recovers from a server failure', async () => {
      const user = userEvent.setup();
      let count = 0;
      mockApi({
        [LIST]: () => reportsPage([]),
        'POST /leads/l-1/activities': () => {
          count += 1;
          return count === 1
            ? apiError(500, 'INTERNAL_ERROR', 'deadlock detected')
            : { status: 201, body: makeActivity() };
        },
      });
      renderAs(BD_REPORTS, <ActivityTimeline lead={{ ...lead, company: null }} />);
      await user.click(await screen.findByRole('button', { name: 'Record a visit or call' }));
      const form = screen.getByRole('form', { name: 'Record a visit or call' });
      await user.type(within(form).getByLabelText('Discussion'), 'Talked');
      const button = within(form).getByRole('button', { name: 'Record report' });
      await user.dblClick(button);
      expect(await within(form).findByRole('alert')).toHaveTextContent(
        'We could not complete the request',
      );
      expect(within(form).getByRole('alert')).not.toHaveTextContent('deadlock');
      expect(count).toBe(1);
      await user.click(within(form).getByRole('button', { name: 'Record report' }));
      expect(await screen.findByText('Report recorded.')).toBeInTheDocument();
    });

    it('offers the company’s contacts and outside people as attendees', async () => {
      const user = userEvent.setup();
      const { calls } = mockApi({
        [LIST]: () => reportsPage([]),
        [CONTACTS]: () => contacts,
        'POST /leads/l-1/activities': () => ({ status: 201, body: makeActivity() }),
      });
      renderAs(BD_REPORTS, <ActivityTimeline lead={lead} />);
      await user.click(await screen.findByRole('button', { name: 'Record a visit or call' }));
      const form = screen.getByRole('form', { name: 'Record a visit or call' });
      await user.click(await within(form).findByLabelText(/Achieng Otieno \(CEO\)/));
      await user.type(within(form).getByLabelText('Name'), 'Sam Consultant');
      await user.type(within(form).getByLabelText('Organisation'), 'Acme IT');
      await user.click(within(form).getByRole('button', { name: 'Add person' }));
      expect(within(form).getByText('Sam Consultant, Acme IT')).toBeInTheDocument();
      await user.type(within(form).getByLabelText('Discussion'), 'Talked');
      await user.click(within(form).getByRole('button', { name: 'Record report' }));
      await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
      expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({
        attendees: [{ contactId: 'ct-1' }, { name: 'Sam Consultant', organisation: 'Acme IT' }],
      });
    });

    it('edits a report with PATCH and confirms', async () => {
      const user = userEvent.setup();
      const { calls } = mockApi({
        [LIST]: () => reportsPage([makeActivity()]),
        [CONTACTS]: () => contacts,
        'PATCH /leads/l-1/activities/a-1': () => ({
          body: makeActivity({ nextSteps: 'Call Monday' }),
        }),
      });
      renderAs(BD_REPORTS, <ActivityTimeline lead={lead} />);
      await user.click(await screen.findByRole('button', { name: 'Edit Meeting report' }));
      const form = screen.getByRole('form', { name: 'Edit report' });
      expect(within(form).getByLabelText('Discussion')).toHaveValue(
        'Walked through the fleet tracking proposal.',
      );
      const next = within(form).getByLabelText('Next steps');
      await user.clear(next);
      await user.type(next, 'Call Monday');
      await user.click(within(form).getByRole('button', { name: 'Save report' }));
      expect(await screen.findByText('Report saved.')).toBeInTheDocument();
      expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({
        nextSteps: 'Call Monday',
      });
    });

    it('cancel closes the form without sending anything', async () => {
      const user = userEvent.setup();
      const { calls } = mockApi({ [LIST]: () => reportsPage([]) });
      renderAs(BD_REPORTS, <ActivityTimeline lead={{ ...lead, company: null }} />);
      await user.click(await screen.findByRole('button', { name: 'Record a visit or call' }));
      await user.click(within(screen.getByRole('form')).getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('form')).not.toBeInTheDocument();
      expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
    });
  });

  describe('site-visit check-in', () => {
    const open = async (user: ReturnType<typeof userEvent.setup>) => {
      mockApi({
        [LIST]: () => reportsPage([]),
        'POST /leads/l-1/activities': () => ({
          status: 201,
          body: makeActivity({ type: 'VISIT' }),
        }),
      });
      const view = renderAs(BD_REPORTS, <ActivityTimeline lead={{ ...lead, company: null }} />);
      await user.click(await screen.findByRole('button', { name: 'Record a visit or call' }));
      const form = screen.getByRole('form', { name: 'Record a visit or call' });
      return { form, view };
    };

    it('appears only for site visits, explains why, and asks for nothing until pressed', async () => {
      const user = userEvent.setup();
      const getCurrentPosition = vi.fn();
      vi.stubGlobal('navigator', { geolocation: { getCurrentPosition, watchPosition: vi.fn() } });
      const { form } = await open(user);
      expect(within(form).queryByText('Location check-in (optional)')).not.toBeInTheDocument();
      await user.selectOptions(within(form).getByLabelText('Type'), 'VISIT');
      expect(within(form).getByText('Location check-in (optional)')).toBeInTheDocument();
      expect(
        within(form).getByText(/only requested when you press the button/),
      ).toBeInTheDocument();
      expect(getCurrentPosition).not.toHaveBeenCalled();
    });

    it('sends the coordinates only after the user accepts the found location', async () => {
      const user = userEvent.setup();
      vi.stubGlobal('navigator', {
        geolocation: {
          getCurrentPosition: (ok: (p: { coords: object }) => void) =>
            ok({ coords: { latitude: -1.292066, longitude: 36.821946, accuracy: 18 } }),
        },
      });
      const { form } = await open(user);
      await user.selectOptions(within(form).getByLabelText('Type'), 'VISIT');
      await user.click(within(form).getByRole('button', { name: 'Check in here' }));
      expect(await within(form).findByText(/within about 18 m/)).toBeInTheDocument();
      expect(
        within(form).getByRole('img', { name: 'Map of the position found' }),
      ).toBeInTheDocument();
      await user.click(within(form).getByRole('button', { name: 'Use this location' }));
      expect(within(form).getByText('Checked in at -1.29207, 36.82195')).toBeInTheDocument();
      expect(
        within(form).getByRole('img', { name: 'Map of the saved check-in' }),
      ).toBeInTheDocument();
      await user.type(within(form).getByLabelText('Discussion'), 'On site');
      await user.click(within(form).getByRole('button', { name: 'Record report' }));
      expect(await screen.findByText('Report recorded.')).toBeInTheDocument();
    });

    it('explains a refusal and still lets the report be saved without a location', async () => {
      const user = userEvent.setup();
      vi.stubGlobal('navigator', {
        geolocation: {
          getCurrentPosition: (_ok: unknown, fail: (e: object) => void) =>
            fail({ code: 1, PERMISSION_DENIED: 1, TIMEOUT: 3 }),
        },
      });
      const { form } = await open(user);
      await user.selectOptions(within(form).getByLabelText('Type'), 'VISIT');
      await user.click(within(form).getByRole('button', { name: 'Check in here' }));
      expect(await within(form).findByText(/Location access was declined/)).toBeInTheDocument();
      await user.type(within(form).getByLabelText('Discussion'), 'No signal');
      await user.click(within(form).getByRole('button', { name: 'Record report' }));
      expect(await screen.findByText('Report recorded.')).toBeInTheDocument();
    });

    it('lets a saved check-in be removed', async () => {
      const user = userEvent.setup();
      mockApi({
        [LIST]: () =>
          reportsPage([
            makeActivity({ type: 'VISIT', gps: { latitude: -1.29, longitude: 36.82 } }),
          ]),
        [CONTACTS]: () => contacts,
      });
      renderAs(BD_REPORTS, <ActivityTimeline lead={lead} />);
      await user.click(await screen.findByRole('button', { name: 'Edit Site visit report' }));
      expect(screen.getByText(/Checked in at -1.29000, 36.82000/)).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Remove check-in' }));
      expect(screen.queryByText(/Checked in at/)).not.toBeInTheDocument();
    });
  });
});
