'use client';

import type { LeadDto, LeadInput } from '@autonova/contracts';
import { LeadSource, PermissionKey, enumValues } from '@autonova/enums';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { can } from '@/features/auth/permissions';
import { applyServerFieldErrors } from '@/lib/form-errors';
import { labelFor, leadErrorText } from './lead-format';
import { LEAD_FORM_FIELDS, leadFormSchema } from './lead-form-schema';
import { blankInput, toInput, toLeadRequestBody } from './lead-input';
import { useSaveLead } from './leads.queries';
import { useLead } from './use-lead';

export function LeadForm({ lead }: { lead?: LeadDto }) {
  const { me } = useAuth();
  const router = useRouter();
  const save = useSaveLead(lead);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LeadInput>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: lead ? toInput(lead) : blankInput(),
  });
  const allowed = can(me, lead ? PermissionKey.LeadsUpdate : PermissionKey.LeadsCreate);
  if (!allowed)
    return (
      <Alert tone="warning">You do not have permission to {lead ? 'edit' : 'create'} leads.</Alert>
    );

  const onSubmit = handleSubmit(async (values) => {
    if (save.isPending) return;
    setFormError(null);
    save.reset();
    try {
      const result = await save.mutateAsync(toLeadRequestBody(values));
      if (!lead) router.replace(`/leads/${result.id}`);
    } catch (cause) {
      // Everything typed stays in the form; the message says what to fix.
      if (!applyServerFieldErrors(cause, setError, LEAD_FORM_FIELDS)) {
        setFormError(leadErrorText(cause));
      }
    }
  });

  const problem = formError ?? (save.isError ? leadErrorText(save.error) : null);
  return (
    <section className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-navy">{lead ? 'Update lead' : 'New lead'}</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Owner: {lead?.ownerName || me?.fullName}; new leads start in New Lead.
      </p>
      {problem ? (
        <div className="mt-4">
          <Alert tone="error">{problem}</Alert>
        </div>
      ) : null}
      {save.isSuccess ? (
        <div className="mt-4">
          <Alert tone="success">Lead saved.</Alert>
        </div>
      ) : null}
      <form
        onSubmit={onSubmit}
        noValidate
        className="mt-5 grid gap-4 rounded-lg border border-line bg-surface p-4 sm:grid-cols-2 sm:p-6"
      >
        <TextField
          label="Person name"
          required
          maxLength={200}
          error={errors.name?.message}
          {...register('name')}
        />
        <TextField
          label="Company (optional)"
          error={errors.companyName?.message}
          {...register('companyName')}
        />
        <TextField label="Phone" type="tel" error={errors.phone?.message} {...register('phone')} />
        <TextField
          label="Email"
          type="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <SelectField label="Lead source" required {...register('source')}>
          {enumValues(LeadSource).map((source) => (
            <option key={source} value={source}>
              {labelFor(source)}
            </option>
          ))}
        </SelectField>
        {watch('source') === LeadSource.Referral ? (
          <TextField
            label="Referrer name"
            required
            error={errors.referrerName?.message}
            {...register('referrerName')}
          />
        ) : null}
        <TextField
          label="Product or service interest"
          error={errors.productInterest?.message}
          {...register('productInterest')}
        />
        <TextField
          label="Next action"
          required
          error={errors.nextAction?.message}
          {...register('nextAction')}
        />
        <Controller
          control={control}
          name="nextActionAt"
          render={({ field }) => (
            <TextField
              label="Follow-up date"
              type="date"
              required
              value={field.value.slice(0, 10)}
              onBlur={field.onBlur}
              ref={field.ref}
              error={errors.nextActionAt?.message}
              onChange={(event) => {
                if (event.target.value) {
                  field.onChange(new Date(`${event.target.value}T09:00:00`).toISOString());
                }
              }}
            />
          )}
        />
        <TextField
          label="Estimated deal value"
          inputMode="decimal"
          error={errors.estimatedValue?.message}
          {...register('estimatedValue')}
        />
        <SelectField label="Currency" {...register('currency')}>
          <option value="KES">KES</option>
          <option value="USD">USD</option>
        </SelectField>
        <TextField
          label="Probability (%) — optional"
          type="number"
          min={0}
          max={100}
          error={errors.probability?.message}
          {...register('probability', {
            setValueAs: (value: string) => (value === '' ? undefined : Number(value)),
          })}
        />
        <label className="sm:col-span-2">
          <span className="mb-1 block text-[13px] font-medium">Notes</span>
          <textarea
            className="min-h-24 w-full rounded-md border border-line bg-surface p-3 text-sm"
            maxLength={5000}
            aria-invalid={errors.notes ? true : undefined}
            {...register('notes')}
          />
          {errors.notes ? <p className="mt-1 text-xs text-danger">{errors.notes.message}</p> : null}
        </label>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : lead ? 'Save changes' : 'Create lead'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push(lead ? `/leads/${lead.id}` : '/leads')}
          >
            Cancel
          </Button>
        </div>
      </form>
    </section>
  );
}

export function EditLead({ id }: { id: string }) {
  const state = useLead(id, { requireFresh: true });
  if (state.kind === 'error') return <Alert tone="error">{state.message}</Alert>;
  if (state.kind === 'loading') return <p role="status">Loading lead…</p>;
  return <LeadForm lead={state.lead} />;
}
