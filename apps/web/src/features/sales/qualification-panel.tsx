'use client';

import type { LeadDto, QualificationInput } from '@autonova/contracts';
import { PermissionKey, QualificationRating, enumValues } from '@autonova/enums';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { can } from '@/features/auth/permissions';
import { formatNairobiDateTime } from '@/lib/nairobi-time';
import { RATING_LABELS, salesErrorText } from './sales-format';
import { useAssess, useQualification, useQualificationSettings, useQualify } from './sales.queries';

const rating = z.enum(enumValues(QualificationRating));
const schema = z.object({
  budget: rating,
  authority: rating,
  need: rating,
  timeline: rating,
  notes: z.string().max(2000),
});
type Values = z.infer<typeof schema>;

const CRITERIA = [
  ['budget', 'Budget', 'Is the budget confirmed?'],
  ['authority', 'Authority', 'Has the decision-maker been met?'],
  ['need', 'Need', 'Is the need clearly defined?'],
  ['timeline', 'Timeline', 'Is there a go-live timeline?'],
] as const;

/**
 * BANT qualification on the lead page. The score is shown, never calculated here: the server scores the
 * four ratings with the configured weights and pass mark, and decides whether the lead may be qualified.
 */
export function QualificationPanel({ lead }: { lead: LeadDto }) {
  const { me } = useAuth();
  // Nothing to assess or show until the lead has reached Visits and calls.
  const canRead = can(me, PermissionKey.LeadsRead) && lead.stage !== 'NEW_LEAD';
  const inStage = lead.stage === 'VISITS_AND_CALLS';
  const latest = useQualification(lead.id, canRead);
  const settings = useQualificationSettings(canRead);
  const assess = useAssess(lead.id);
  const qualify = useQualify(lead.id);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const isDirector = can(me, PermissionKey.QualificationOverride);

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      budget: 'NOT_MET',
      authority: 'NOT_MET',
      need: 'NOT_MET',
      timeline: 'NOT_MET',
      notes: '',
    },
  });

  if (!canRead) return null;
  const current = latest.data ?? null;

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    setNotice(null);
    const body: QualificationInput = {
      budget: values.budget,
      authority: values.authority,
      need: values.need,
      timeline: values.timeline,
      ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
    };
    try {
      const saved = await assess.mutateAsync(body);
      setNotice(
        saved.passed
          ? `Scored ${saved.score} of 100: this meets the pass mark of ${saved.passMark}.`
          : `Scored ${saved.score} of 100: below the pass mark of ${saved.passMark}.`,
      );
    } catch (failure) {
      setError(salesErrorText(failure));
    }
  });

  const doQualify = async () => {
    setError(null);
    setNotice(null);
    setOverrideError(null);
    const reason = overrideReason.trim();
    if (current && !current.passed && isDirector && !reason) {
      setOverrideError('A Director must give a reason to qualify a lead that did not pass.');
      return;
    }
    try {
      await qualify.mutateAsync(current?.passed || !reason ? {} : { overrideReason: reason });
      setNotice('The lead is now Qualified.');
      setOverrideReason('');
    } catch (failure) {
      setError(salesErrorText(failure));
    }
  };

  return (
    <section
      className="mt-6 rounded-lg border border-line bg-surface p-5"
      aria-labelledby="bant-heading"
    >
      <h2 id="bant-heading" className="text-lg font-semibold text-navy">
        BANT qualification
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Budget, Authority, Need and Timeline. The score out of 100 is worked out by the server.
        {settings.data
          ? ` Pass mark: ${settings.data.passMark}.${settings.data.isDefault ? ' (A temporary default: a Director has not set one yet.)' : ''}`
          : ''}
      </p>
      {notice ? (
        <div className="mt-3">
          <Alert tone="success">{notice}</Alert>
        </div>
      ) : null}
      {error ? (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}

      {latest.isLoading ? (
        <p role="status" className="mt-3 text-sm text-ink-soft">
          Loading assessment…
        </p>
      ) : latest.isError ? (
        <div className="mt-3">
          <Alert tone="error">{salesErrorText(latest.error)}</Alert>
        </div>
      ) : current ? (
        <div className="mt-3 rounded-md border border-line p-3" aria-label="Latest assessment">
          <p className="text-2xl font-semibold text-ink">
            {current.score}
            <span className="text-base font-normal text-ink-soft"> / 100</span>
            <span
              className={`ml-3 rounded-full px-2 py-0.5 text-xs font-medium ${current.passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
            >
              {current.passed ? 'Passed' : 'Did not pass'} (mark {current.passMark})
            </span>
          </p>
          <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {CRITERIA.map(([key, label]) => (
              <div key={key} className="flex justify-between gap-2">
                <dt className="text-ink-soft">{label}</dt>
                <dd>{RATING_LABELS[current.ratings[key]]}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-ink-soft">
            Assessed by {current.assessedByName ?? 'a former user'} on{' '}
            {formatNairobiDateTime(current.assessedAt)}
          </p>
          {current.notes ? (
            <p className="mt-1 whitespace-pre-wrap text-sm">{current.notes}</p>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-ink-soft">No assessment yet.</p>
      )}

      {inStage && can(me, PermissionKey.LeadsUpdate) ? (
        <>
          <form
            className="mt-4 grid gap-3 sm:grid-cols-2"
            onSubmit={submit}
            aria-label="Record an assessment"
            noValidate
          >
            {CRITERIA.map(([key, label, hint]) => (
              <SelectField key={key} label={`${label}: ${hint}`} {...form.register(key)}>
                {enumValues(QualificationRating).map((value) => (
                  <option key={value} value={value}>
                    {RATING_LABELS[value]}
                  </option>
                ))}
              </SelectField>
            ))}
            <div className="sm:col-span-2">
              <TextField label="Notes (optional)" {...form.register('notes')} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={assess.isPending}>
                {assess.isPending
                  ? 'Scoring…'
                  : current
                    ? 'Record a new assessment'
                    : 'Record assessment'}
              </Button>
            </div>
          </form>

          {current ? (
            <div className="mt-4 border-t border-line pt-4">
              {!current.passed ? (
                isDirector ? (
                  <TextField
                    label="Override reason (required to qualify a lead that did not pass)"
                    value={overrideReason}
                    error={overrideError ?? undefined}
                    onChange={(event) => setOverrideReason(event.target.value)}
                  />
                ) : (
                  <p className="text-sm text-ink-soft">
                    This did not reach the pass mark. A Director can qualify it with a written
                    reason, or you can record a new assessment.
                  </p>
                )
              ) : null}
              <Button
                className="mt-3"
                type="button"
                disabled={qualify.isPending || (!current.passed && !isDirector)}
                onClick={() => void doQualify()}
              >
                {qualify.isPending
                  ? 'Qualifying…'
                  : current.passed
                    ? 'Qualify lead'
                    : 'Qualify with override'}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
