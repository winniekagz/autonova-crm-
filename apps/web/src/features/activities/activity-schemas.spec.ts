import { describe, expect, it } from 'vitest';
import { makeActivity } from './activity-test-fixtures';
import { activityFormSchema } from './activity-form-schema';
import {
  ACTIVITY_TYPE_LABELS,
  activityErrorText,
  formatBytes,
  isRetryable,
} from './activity-format';
import {
  activityToForm,
  blankActivity,
  nairobiTimeOf,
  toActivityRequestBody,
} from './activity-input';
import { ApiError } from '@/lib/api-client';

const messages = (over: object) => {
  const result = activityFormSchema.safeParse({
    ...blankActivity(),
    discussion: 'Talked',
    ...over,
  });
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((i) => [i.path.join('.'), i.message]));
};

describe('report form schema', () => {
  it('needs only a type, a date, a time and a discussion', () => {
    expect(activityFormSchema.safeParse({ ...blankActivity(), discussion: 'Talked' }).success).toBe(
      true,
    );
    expect(messages({ discussion: '   ' }).discussion).toMatch(/Describe what was discussed/);
    expect(messages({ occurredDate: '' }).occurredDate).toMatch(/Choose the date/);
    expect(messages({ occurredTime: '' }).occurredTime).toMatch(/Choose the time/);
  });

  it('bounds the free-text fields and attendee count like the API', () => {
    expect(messages({ discussion: 'x'.repeat(10_001) }).discussion).toMatch(/at most 10,000/);
    expect(messages({ painPoints: 'x'.repeat(5_001) }).painPoints).toMatch(/at most 5000/);
    const many = Array.from({ length: 21 }, (_, i) => ({
      contactId: null,
      name: `P${i}`,
      organisation: '',
    }));
    expect(messages({ attendees: many }).attendees).toMatch(/at most 20/);
  });

  it('offers the four report types with plain names', () => {
    expect(ACTIVITY_TYPE_LABELS).toEqual({
      VISIT: 'Site visit',
      CALL: 'Call',
      DEMO: 'Demo',
      MEETING: 'Meeting',
    });
  });
});

describe('report request mapping', () => {
  it('defaults the report to a meeting that has just happened, in Nairobi time', () => {
    const blank = blankActivity(new Date('2026-11-08T08:30:00.000Z'));
    expect(blank).toMatchObject({
      type: 'MEETING',
      occurredDate: '2026-11-08',
      occurredTime: '11:30',
    });
    expect(nairobiTimeOf('2026-11-08T21:30:00.000Z')).toBe('00:30');
  });

  it('turns the chosen Nairobi date and time into the instant it happened, not the time of saving', () => {
    const body = toActivityRequestBody(
      {
        ...blankActivity(),
        discussion: ' Talked ',
        occurredDate: '2026-10-30',
        occurredTime: '09:15',
        location: ' Karen ',
      },
      null,
    );
    expect(body.occurredAt).toBe('2026-10-30T06:15:00.000Z');
    expect(body).toMatchObject({ discussion: 'Talked', location: 'Karen' });
  });

  it('sends the check-in only for site visits, and sends attendees as contact ids or outside people', () => {
    const fix = { latitude: -1.2921, longitude: 36.8219 };
    const attendees = [
      { contactId: 'ct-1', name: '', organisation: '' },
      { contactId: null, name: ' Sam ', organisation: ' Acme ' },
      { contactId: null, name: '   ', organisation: '' },
    ];
    expect(
      toActivityRequestBody({ ...blankActivity(), discussion: 'x', type: 'VISIT', attendees }, fix),
    ).toMatchObject({
      gps: fix,
      attendees: [{ contactId: 'ct-1' }, { name: 'Sam', organisation: 'Acme' }],
    });
    expect(
      toActivityRequestBody({ ...blankActivity(), discussion: 'x', type: 'CALL' }, fix).gps,
    ).toBeNull();
  });

  it('round-trips a saved report through the form', () => {
    const form = activityToForm(makeActivity());
    expect(form).toMatchObject({
      type: 'MEETING',
      occurredDate: '2026-11-05',
      occurredTime: '10:00',
    });
    expect(form.attendees).toEqual([
      { contactId: 'ct-1', name: '', organisation: '' },
      { contactId: null, name: 'Sam Consultant', organisation: 'Acme IT' },
    ]);
  });
});

describe('report messages', () => {
  it('explains known codes and never echoes the server text', () => {
    const err = (status: number, code: string) =>
      new ApiError(status, code, 'select * from activities');
    expect(activityErrorText(err(403, 'ACTIVITY_NOT_YOURS'))).toMatch(
      /Only the person who recorded/,
    );
    expect(activityErrorText(err(415, 'ATTACHMENT_TYPE_NOT_ALLOWED'))).toMatch(/not accepted/);
    expect(activityErrorText(err(0, 'NETWORK_ERROR'))).toMatch(/could not reach the server/);
    expect(activityErrorText(err(500, 'INTERNAL_ERROR'))).not.toMatch(/select/);
    expect(activityErrorText(new Error('boom'))).toMatch(/could not complete/);
  });

  it('retries only what could pass on its own', () => {
    expect(isRetryable(new ApiError(0, 'NETWORK_ERROR', 'x'))).toBe(true);
    expect(isRetryable(new ApiError(503, 'X', 'x'))).toBe(true);
    expect(isRetryable(new ApiError(0, 'UPLOAD_CANCELLED', 'x'))).toBe(false);
    expect(isRetryable(new ApiError(415, 'ATTACHMENT_TYPE_NOT_ALLOWED', 'x'))).toBe(false);
  });

  it('formats sizes for people', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(204_800)).toBe('200 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
