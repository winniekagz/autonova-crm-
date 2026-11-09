'use client';

import type { LeadDto, LeadStageHistoryDto } from '@autonova/contracts';
import { LeadDisqualificationReason, LeadStage, enumValues } from '@autonova/enums';
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
import { PermissionKey } from '@autonova/enums';
import { labelFor, leadErrorText } from './lead-format';
import {
  useDisqualifyLead,
  useLeadHistory,
  useMarkLeadLost,
  useTransitionLead,
} from './leads.queries';

const transitionSchema = z.object({
  toStage: z.enum(enumValues(LeadStage)),
  reason: z.string().max(1000),
});
type TransitionValues = z.infer<typeof transitionSchema>;

const disqualificationSchema = z
  .object({
    reason: z.enum(enumValues(LeadDisqualificationReason)),
    revisitOn: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (value.reason === LeadDisqualificationReason.TimingRevisitLater && !value.revisitOn) {
      context.addIssue({
        code: 'custom',
        path: ['revisitOn'],
        message: 'Choose a follow-up date.',
      });
    }
  });
type DisqualificationValues = z.infer<typeof disqualificationSchema>;

const lostSchema = z.object({ reason: z.string().trim().min(1, 'Enter a reason.').max(1000) });
type LostValues = z.infer<typeof lostSchema>;

function HistoryEntry({ entry }: { entry: LeadStageHistoryDto }) {
  return (
    <li className="border-l-2 border-line pl-4 pb-5 last:pb-0">
      <p className="font-medium text-ink">
        {entry.fromStage ? labelFor(entry.fromStage) : 'Lead created'}
        {entry.fromStage ? ` → ${labelFor(entry.toStage)}` : ''}
      </p>
      <p className="mt-1 text-xs text-ink-soft">
        {new Date(entry.occurredAt).toLocaleString('en-KE')} ·{' '}
        {entry.actorName || 'Autonova system'}
        {entry.source === 'SCHEDULED_REVISIT' ? ' · Automatic revisit' : ''}
      </p>
      {entry.disqualificationReason ? (
        <p className="mt-1 text-sm">Reason: {labelFor(entry.disqualificationReason)}</p>
      ) : null}
      {entry.reason ? <p className="mt-1 text-sm">{entry.reason}</p> : null}
      {entry.revisitOn ? <p className="mt-1 text-sm">Follow-up date: {entry.revisitOn}</p> : null}
    </li>
  );
}

export function LeadLifecycle({ lead }: { lead: LeadDto }) {
  const { me } = useAuth();
  const canUpdate = can(me, PermissionKey.LeadsUpdate);
  const history = useLeadHistory(lead.id, can(me, PermissionKey.LeadsRead));
  const transition = useTransitionLead(lead.id);
  const disqualify = useDisqualifyLead(lead.id);
  const markLost = useMarkLeadLost(lead.id);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const nextStage = lead.lifecycle.transitions[0];

  const transitionForm = useForm<TransitionValues>({
    resolver: zodResolver(transitionSchema),
    defaultValues: { toStage: nextStage ?? LeadStage.NewLead, reason: '' },
  });
  const disqualificationForm = useForm<DisqualificationValues>({
    resolver: zodResolver(disqualificationSchema),
    defaultValues: { reason: LeadDisqualificationReason.NoBudget, revisitOn: '' },
  });
  const lostForm = useForm<LostValues>({
    resolver: zodResolver(lostSchema),
    defaultValues: { reason: '' },
  });

  const run = async (action: () => Promise<unknown>, success: string) => {
    setActionError(null);
    setNotice(null);
    try {
      await action();
      setNotice(success);
    } catch (error) {
      setActionError(leadErrorText(error));
    }
  };

  const submitTransition = transitionForm.handleSubmit(async ({ toStage, reason }) => {
    if (!nextStage) return;
    await run(
      () =>
        transition.mutateAsync({
          fromStage: lead.stage,
          toStage,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }),
      `Lead moved to ${labelFor(toStage)}.`,
    );
  });

  const submitDisqualification = disqualificationForm.handleSubmit(async (values) => {
    await run(
      () =>
        disqualify.mutateAsync({
          fromStage: LeadStage.VisitsAndCalls,
          reason: values.reason,
          ...(values.reason === LeadDisqualificationReason.TimingRevisitLater && values.revisitOn
            ? { revisitOn: values.revisitOn }
            : {}),
        }),
      values.reason === LeadDisqualificationReason.TimingRevisitLater
        ? `Revisit scheduled for ${values.revisitOn}.`
        : 'Lead disqualified.',
    );
  });

  const submitLost = lostForm.handleSubmit(async ({ reason }) => {
    await run(
      () => markLost.mutateAsync({ fromStage: LeadStage.TorQuoteSent, reason }),
      'Lead marked Lost. The reason is saved in its history.',
    );
  });

  return (
    <section className="mt-6 border-t border-line pt-5" aria-labelledby="lifecycle-heading">
      <h2 id="lifecycle-heading" className="text-lg font-semibold text-navy">
        Pipeline lifecycle
      </h2>
      <p className="mt-1 text-sm text-ink-soft">Current stage: {labelFor(lead.stage)}</p>
      {lead.stage === LeadStage.Disqualified && lead.revisitOn ? (
        <p className="mt-2 text-sm">
          Revisit scheduled for {lead.revisitOn}. It returns to New Lead automatically when due.
        </p>
      ) : null}
      {lead.stage === LeadStage.Lost && lead.lostReason ? (
        <p className="mt-2 text-sm">Lost reason: {lead.lostReason}</p>
      ) : null}
      {actionError ? (
        <div className="mt-3">
          <Alert tone="error">{actionError}</Alert>
        </div>
      ) : null}
      {notice ? (
        <div className="mt-3">
          <Alert tone="success">{notice}</Alert>
        </div>
      ) : null}

      {canUpdate && nextStage === LeadStage.Qualified ? (
        <p className="mt-4 max-w-xl rounded-md border border-line p-4 text-sm">
          Qualification needs a BANT assessment. Record it in the Qualification section above; the
          lead moves to Qualified from there.
        </p>
      ) : null}

      {canUpdate && nextStage && nextStage !== LeadStage.Qualified ? (
        <form
          onSubmit={submitTransition}
          className="mt-4 grid max-w-xl gap-3 rounded-md border border-line p-4"
        >
          <h3 className="font-medium">Move to the next stage</h3>
          <SelectField label="Next stage" {...transitionForm.register('toStage')}>
            <option value={nextStage}>{labelFor(nextStage)}</option>
          </SelectField>
          <Button type="submit" disabled={transition.isPending}>
            {transition.isPending ? 'Saving…' : `Move to ${labelFor(nextStage)}`}
          </Button>
        </form>
      ) : null}

      {canUpdate && lead.lifecycle.canDisqualify ? (
        <form
          onSubmit={submitDisqualification}
          className="mt-4 grid max-w-xl gap-3 rounded-md border border-line p-4"
        >
          <h3 className="font-medium">Disqualify lead</h3>
          <SelectField label="Reason" {...disqualificationForm.register('reason')}>
            {enumValues(LeadDisqualificationReason).map((reason) => (
              <option key={reason} value={reason}>
                {labelFor(reason)}
              </option>
            ))}
          </SelectField>
          {disqualificationForm.watch('reason') ===
          LeadDisqualificationReason.TimingRevisitLater ? (
            <TextField
              label="Follow-up date"
              type="date"
              error={disqualificationForm.formState.errors.revisitOn?.message}
              {...disqualificationForm.register('revisitOn')}
            />
          ) : null}
          <Button type="submit" variant="secondary" disabled={disqualify.isPending}>
            {disqualify.isPending ? 'Saving…' : 'Disqualify lead'}
          </Button>
        </form>
      ) : null}

      {canUpdate && lead.lifecycle.canMarkLost ? (
        <form
          onSubmit={submitLost}
          className="mt-4 grid max-w-xl gap-3 rounded-md border border-line p-4"
        >
          <h3 className="font-medium">Mark Lost</h3>
          <label className="grid gap-1 text-sm">
            <span>Reason</span>
            <textarea
              className="min-h-20 rounded-md border border-line bg-surface p-3"
              aria-label="Lost reason"
              aria-invalid={lostForm.formState.errors.reason ? true : undefined}
              {...lostForm.register('reason')}
            />
            {lostForm.formState.errors.reason ? (
              <span className="text-xs text-danger">
                {lostForm.formState.errors.reason.message}
              </span>
            ) : null}
          </label>
          <Button type="submit" variant="danger" disabled={markLost.isPending}>
            {markLost.isPending ? 'Saving…' : 'Mark Lost'}
          </Button>
        </form>
      ) : null}

      <div className="mt-6">
        <h3 className="font-medium">Stage history</h3>
        {history.isPending ? (
          <p role="status" className="mt-3 text-sm text-ink-soft">
            Loading history…
          </p>
        ) : null}
        {history.isError ? (
          <div className="mt-3">
            <Alert tone="error">{leadErrorText(history.error)}</Alert>
          </div>
        ) : null}
        {history.data?.items.length === 0 ? (
          <p className="mt-3 text-sm text-ink-soft">No stage changes recorded yet.</p>
        ) : null}
        {history.data && history.data.items.length > 0 ? (
          <ol className="mt-4 ml-1 border-line">
            {history.data.items.map((entry) => (
              <HistoryEntry key={entry.id} entry={entry} />
            ))}
          </ol>
        ) : null}
      </div>
    </section>
  );
}
