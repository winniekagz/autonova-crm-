// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, mockApi, renderAs } from '@/test/render';
import { AttachmentsPanel } from './attachments-panel';
import { BD_REPORTS, makeAttachment } from './activity-test-fixtures';
import { installFakeXhr, lastUpload } from './fake-xhr';

beforeEach(() => {
  installFakeXhr();
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
  };
});
afterEach(() => vi.unstubAllGlobals());

const file = (name: string, size = 2048, type = 'image/jpeg') =>
  new File([new Uint8Array(size)], name, { type });
const panel = (over: { canChange?: boolean; canRemove?: boolean; usedBytes?: number } = {}) => (
  <AttachmentsPanel leadId="l-1" activityId="a-1" canChange canRemove usedBytes={0} {...over} />
);
const listed = (items: object[]) => ({
  'GET /leads/l-1/activities/a-1/attachments': () => ({ body: items }),
});
const chooseFile = async (user: ReturnType<typeof userEvent.setup>, f: File) =>
  user.upload(screen.getByLabelText('Choose a file'), f);

describe('AttachmentsPanel', () => {
  it('lists files with kind and size, and says so when there are none', async () => {
    mockApi(
      listed([
        makeAttachment(),
        makeAttachment({
          id: 'f-2',
          fileName: 'prices.pdf',
          category: 'DOCUMENT',
          sizeBytes: 3 * 1024 * 1024,
        }),
      ]),
    );
    const { unmount } = renderAs(BD_REPORTS, panel());
    expect(await screen.findByText('site.jpg')).toBeInTheDocument();
    expect(screen.getByText(/Photo · 200 KB/)).toBeInTheDocument();
    expect(screen.getByText(/Document · 3\.0 MB/)).toBeInTheDocument();
    unmount();
    mockApi(listed([]));
    renderAs(BD_REPORTS, panel());
    expect(await screen.findByText('No attachments yet.')).toBeInTheDocument();
  });

  it('states the limits and that files are not virus-scanned', async () => {
    mockApi(listed([]));
    renderAs(BD_REPORTS, panel());
    expect(await screen.findByText(/not scanned for viruses/)).toBeInTheDocument();
    const limits = screen.getByText(/Photos up to 10 MB/);
    expect(limits).toHaveTextContent('documents up to 25 MB');
    expect(limits).toHaveTextContent('voice notes up to 20 MB (MP3, M4A, WAV, WebM)');
    expect(limits).not.toHaveTextContent(/HEIC|OGG/);
  });

  it('shows how much of the 50 MB allowance the report has used', async () => {
    mockApi(listed([makeAttachment()]));
    renderAs(BD_REPORTS, panel({ usedBytes: 12.5 * 1024 * 1024 }));
    expect(await screen.findByText('12.5 MB of 50 MB used.')).toBeInTheDocument();
  });

  it('asks for the participants’ notice before a voice note and sends it with the file', async () => {
    const user = userEvent.setup();
    mockApi(listed([]));
    renderAs(BD_REPORTS, panel());
    await screen.findByText('No attachments yet.');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Kind of file'), 'VOICE_NOTE');
    const told = screen.getByRole('checkbox', { name: /told this conversation is being recorded/ });
    await chooseFile(user, file('note.mp3', 2048, 'audio/mpeg'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/participants were told/);
    expect(FakeXhrCount()).toBe(0);
    await user.click(told);
    await chooseFile(user, file('note.mp3', 2048, 'audio/mpeg'));
    expect(lastUpload().sent?.get('category')).toBe('VOICE_NOTE');
    expect(lastUpload().sent?.get('recordingNoticeGiven')).toBe('true');
  });

  it('does not send a notice field for photos', async () => {
    const user = userEvent.setup();
    mockApi(listed([]));
    renderAs(BD_REPORTS, panel());
    await screen.findByText('No attachments yet.');
    await chooseFile(user, file('site.jpg'));
    expect(lastUpload().sent?.has('recordingNoticeGiven')).toBe(false);
  });

  it('refuses a 21 MB voice note and a 26 MB document early, per the new limits', async () => {
    const user = userEvent.setup();
    mockApi(listed([]));
    renderAs(BD_REPORTS, panel());
    await screen.findByText('No attachments yet.');
    await user.selectOptions(screen.getByLabelText('Kind of file'), 'VOICE_NOTE');
    await user.click(screen.getByRole('checkbox'));
    await chooseFile(user, file('long.mp3', 21 * 1024 * 1024, 'audio/mpeg'));
    expect(await screen.findByRole('alert')).toHaveTextContent('the limit is 20 MB');
    await chooseFile(user, file('big.pdf', 26 * 1024 * 1024, 'application/pdf'));
    expect(await screen.findByRole('alert')).toHaveTextContent('the limit is 25 MB');
    expect(FakeXhrCount()).toBe(0);
  });

  it('shows the total-size refusal in plain words', async () => {
    const user = userEvent.setup();
    mockApi(listed([]));
    renderAs(BD_REPORTS, panel());
    await screen.findByText('No attachments yet.');
    await chooseFile(user, file('site.jpg'));
    act(() => lastUpload().respond(413, apiError(413, 'ATTACHMENT_TOTAL_EXCEEDED').body));
    expect(await screen.findByRole('alert')).toHaveTextContent(/over the total size allowed/);
  });

  it('uploads a file with live progress, then lists it and confirms', async () => {
    const user = userEvent.setup();
    let items = [] as object[];
    const { calls } = mockApi({
      'GET /leads/l-1/activities/a-1/attachments': () => ({ body: items }),
    });
    renderAs(BD_REPORTS, panel());
    await screen.findByText('No attachments yet.');
    await chooseFile(user, file('site.jpg'));
    const upload = lastUpload();
    expect(upload.method).toBe('POST');
    expect(upload.url).toContain('/leads/l-1/activities/a-1/attachments');
    expect(upload.headers.authorization).toBe('Bearer test-token');
    expect(upload.sent?.get('category')).toBe('PHOTO');
    const sentFile = upload.sent?.get('file');
    expect(sentFile instanceof File ? sentFile.name : null).toBe('site.jpg');
    act(() => upload.progress(50, 100));
    expect(await screen.findByText('Uploading… 50%')).toBeInTheDocument();
    expect(screen.getByLabelText('Choose a file')).toBeDisabled();
    items = [makeAttachment()];
    act(() => upload.respond(201, makeAttachment()));
    expect(await screen.findByText('site.jpg was added.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Download site.jpg' })).toBeInTheDocument();
    expect(screen.queryByText(/Uploading/)).not.toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'GET').length).toBeGreaterThanOrEqual(2);
  });

  it('follows the file name to the right category', async () => {
    const user = userEvent.setup();
    mockApi(listed([]));
    renderAs(BD_REPORTS, panel());
    await screen.findByText('No attachments yet.');
    await chooseFile(user, file('quote.pdf', 2048, 'application/pdf'));
    expect(lastUpload().sent?.get('category')).toBe('DOCUMENT');
    expect(screen.getByLabelText('Kind of file')).toHaveValue('DOCUMENT');
  });

  it('refuses a wrong type or an oversized file before sending anything', async () => {
    const user = userEvent.setup();
    mockApi(listed([]));
    renderAs(BD_REPORTS, panel());
    await screen.findByText('No attachments yet.');
    // The picker's accept filter can be bypassed (drag and drop, a renamed file), so the check is repeated.
    const picker = screen.getByLabelText('Choose a file');
    const bad = file('run.exe', 100, 'application/x-msdownload');
    Object.defineProperty(picker, 'files', {
      configurable: true,
      value: { 0: bad, length: 1, item: () => bad },
    });
    fireEvent.change(picker);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'That file type is not accepted for this category.',
    );
    await chooseFile(user, file('big.jpg', 11 * 1024 * 1024));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /too large for this category \(the limit is 10 MB\)/,
    );
    await chooseFile(user, file('empty.jpg', 0));
    expect(await screen.findByRole('alert')).toHaveTextContent('That file is empty.');
    expect(FakeXhrCount()).toBe(0);
  });

  it('names the file that failed, leaves no entry, and offers a retry for a dropped connection', async () => {
    const user = userEvent.setup();
    mockApi(listed([]));
    renderAs(BD_REPORTS, panel());
    await screen.findByText('No attachments yet.');
    await chooseFile(user, file('site.jpg'));
    act(() => lastUpload().dropConnection());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('site.jpg was not added.');
    expect(alert).toHaveTextContent('could not reach the server');
    expect(screen.getByText('No attachments yet.')).toBeInTheDocument();
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(FakeXhrCount()).toBe(2);
    act(() => lastUpload().respond(201, makeAttachment()));
    expect(await screen.findByText('site.jpg was added.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('shows the server’s refusal without a retry, and never its raw text', async () => {
    const user = userEvent.setup();
    mockApi(listed([]));
    renderAs(BD_REPORTS, panel());
    await screen.findByText('No attachments yet.');
    await chooseFile(user, file('site.jpg'));
    act(() =>
      lastUpload().respond(
        415,
        apiError(415, 'ATTACHMENT_CONTENT_MISMATCH', '/var/lib/files/x.bin').body,
      ),
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('contents do not match its type');
    expect(alert).not.toHaveTextContent('/var/lib');
    expect(within(alert).queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('stops offering uploads when the report already holds the maximum', async () => {
    mockApi(
      listed(
        Array.from({ length: 20 }, (_, i) =>
          makeAttachment({ id: `f-${i}`, fileName: `p${i}.jpg` }),
        ),
      ),
    );
    renderAs(BD_REPORTS, panel());
    expect(await screen.findByText(/has 20 attachments, the most it can hold/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Choose a file')).not.toBeInTheDocument();
  });

  it('downloads through an authorised request and reports a failure plainly', async () => {
    const user = userEvent.setup();
    let ok = true;
    const create = vi.fn(() => 'blob:x');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() }));
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const { calls } = mockApi({
      ...listed([makeAttachment()]),
      'GET /leads/l-1/activities/a-1/attachments/f-1': () =>
        ok ? { body: 'bytes' } : apiError(404, 'ATTACHMENT_NOT_FOUND'),
    });
    renderAs(BD_REPORTS, panel());
    await user.click(await screen.findByRole('button', { name: 'Download site.jpg' }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(calls.find((c) => c.path.endsWith('/f-1'))?.auth).toBe('Bearer test-token');
    ok = false;
    await user.click(screen.getByRole('button', { name: 'Download site.jpg' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('no longer available');
    click.mockRestore();
  });

  it('removes a file only after confirming with a reason, and explains what removal means', async () => {
    const user = userEvent.setup();
    let items = [makeAttachment()];
    const { calls } = mockApi({
      'GET /leads/l-1/activities/a-1/attachments': () => ({ body: items }),
      'DELETE /leads/l-1/activities/a-1/attachments/f-1': () => {
        items = [];
        return { status: 204 };
      },
    });
    renderAs(BD_REPORTS, panel());
    await user.click(await screen.findByRole('button', { name: 'Remove site.jpg' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove this attachment?' });
    expect(dialog).toHaveTextContent(/Who removed it and why is kept/);
    expect(dialog).toHaveTextContent(/purge under the retention process/);
    await user.click(within(dialog).getByRole('button', { name: 'Remove attachment' }));
    expect(within(dialog).getByText('Give a reason.')).toBeInTheDocument();
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(0);
    await user.type(within(dialog).getByLabelText('Reason'), '  Wrong client  ');
    await user.click(within(dialog).getByRole('button', { name: 'Remove attachment' }));
    expect(await screen.findByText('site.jpg was removed.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'DELETE')?.body).toEqual({ reason: 'Wrong client' });
    expect(await screen.findByText('No attachments yet.')).toBeInTheDocument();
  });

  it('says a Director is needed when the server refuses a removal', async () => {
    const user = userEvent.setup();
    mockApi({
      ...listed([makeAttachment()]),
      'DELETE /leads/l-1/activities/a-1/attachments/f-1': () => apiError(403, 'FORBIDDEN'),
    });
    renderAs(BD_REPORTS, panel());
    await user.click(await screen.findByRole('button', { name: 'Remove site.jpg' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove this attachment?' });
    await user.type(within(dialog).getByLabelText('Reason'), 'Mine');
    await user.click(within(dialog).getByRole('button', { name: 'Remove attachment' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('You do not have access to this.');
  });

  it('marks a voice note whose participants were told', async () => {
    mockApi(
      listed([
        makeAttachment({
          id: 'f-3',
          fileName: 'note.mp3',
          category: 'VOICE_NOTE',
          recordingNoticeGiven: true,
        }),
      ]),
    );
    renderAs(BD_REPORTS, panel());
    expect(await screen.findByText(/participants told/)).toBeInTheDocument();
  });

  it('hides upload and remove from someone who may only look', async () => {
    mockApi(listed([makeAttachment()]));
    renderAs(BD_REPORTS, panel({ canChange: false, canRemove: false }));
    expect(await screen.findByRole('button', { name: 'Download site.jpg' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Choose a file')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove site.jpg' })).not.toBeInTheDocument();
  });

  it('shows a safe error when the list cannot be loaded', async () => {
    mockApi({
      'GET /leads/l-1/activities/a-1/attachments': () =>
        apiError(500, 'INTERNAL_ERROR', 'stack trace'),
    });
    renderAs(BD_REPORTS, panel());
    const alert = await screen.findByRole('alert');
    expect(alert).not.toHaveTextContent('stack trace');
  });
});

function FakeXhrCount() {
  return (globalThis as unknown as { XMLHttpRequest: { instances: unknown[] } }).XMLHttpRequest
    .instances.length;
}
