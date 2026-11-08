import { describe, expect, it } from 'vitest';
import { auditDiff, changedFields, type ActivityFacts } from './activity-changes.js';

const base: ActivityFacts = {
  type: 'MEETING',
  occurredAt: '2026-11-05T07:00:00.000Z',
  location: 'Westlands',
  discussion: 'Walked through the proposal.',
  painPoints: null,
  currentTools: 'Excel',
  nextSteps: 'Send a quote',
  hasGps: false,
  attendees: ['contact:a', 'ext:sam|acme'],
};

describe('changedFields', () => {
  it('reports nothing when nothing changed, whatever order the attendees come in', () => {
    expect(changedFields(base, { ...base, attendees: ['ext:sam|acme', 'contact:a'] })).toEqual([]);
  });

  it('records short fields with their values', () => {
    expect(changedFields(base, { ...base, type: 'CALL', location: null })).toEqual([
      { field: 'type', before: 'MEETING', after: 'CALL' },
      { field: 'location', before: 'Westlands', after: null },
    ]);
  });

  it('records long free text as a length, never as the text itself', () => {
    const changes = changedFields(base, {
      ...base,
      discussion: 'A much longer private discussion.',
      painPoints: 'Slow',
    });
    expect(changes).toEqual([
      { field: 'discussionLength', before: 28, after: 33 },
      { field: 'painPointsLength', before: 0, after: 4 },
    ]);
    expect(JSON.stringify(changes)).not.toContain('private');
  });

  it('records a check-in as set or removed, never as coordinates', () => {
    expect(changedFields(base, { ...base, hasGps: true })).toEqual([
      { field: 'checkIn', before: false, after: true },
    ]);
    expect(changedFields({ ...base, hasGps: true }, base)).toEqual([
      { field: 'checkIn', before: true, after: false },
    ]);
  });

  it('records an attendee change as a count', () => {
    expect(changedFields(base, { ...base, attendees: ['contact:a'] })).toEqual([
      { field: 'attendeeCount', before: 2, after: 1 },
    ]);
  });
});

describe('auditDiff', () => {
  it('keeps only what changed, before and after, plus the list of fields', () => {
    const diff = auditDiff(
      changedFields(base, { ...base, type: 'DEMO', nextSteps: 'Call Friday' }),
    );
    expect(diff.oldValues).toEqual({ type: 'MEETING', nextStepsLength: 12 });
    expect(diff.newValues).toEqual({ type: 'DEMO', nextStepsLength: 11 });
    expect(diff.changedFields).toBe('type,nextStepsLength');
  });
});
