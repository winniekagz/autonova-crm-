'use client';

import type { ActivityDto } from '@autonova/contracts';
import { ActivityType, PermissionKey, enumValues } from '@autonova/enums';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { can } from '@/features/auth/permissions';
import { useCompanyContacts } from '@/features/companies/companies.queries';
import { ApiError } from '@/lib/api-client';
import { applyServerFieldErrors } from '@/lib/form-errors';
import { useSaveActivity } from './activities.queries';
import {
  ACTIVITY_FORM_FIELDS,
  API_FIELD_TO_FORM,
  activityFormSchema,
  type ActivityFormValues,
} from './activity-form-schema';
import { ACTIVITY_TYPE_LABELS, activityErrorText } from './activity-format';
import {
  activityToForm,
  blankActivity,
  toActivityRequestBody,
  type GpsFix,
} from './activity-input';
import { AttendeesField } from './attendees-field';
import { GpsCheckIn } from './gps-check-in';

interface ActivityFormProps {
  leadId: string;
  /** The lead's company, so its contacts can be offered as attendees. */
  companyId: string | null;
  activity?: ActivityDto;
  onDone: () => void;
}

const textArea = 'min-h-24 w-full rounded-md border border-line bg-surface p-3 text-sm';

export function ActivityForm({ leadId, companyId, activity, onDone }: ActivityFormProps) {
  const { me } = useAuth();
  const save = useSaveActivity(leadId, activity);
  const [formError, setFormError] = useState<string | null>(null);
  const [gps, setGps] = useState<GpsFix | null>(activity?.gps ?? null);
  const canSeeContacts = can(me, PermissionKey.CompaniesRead) && companyId !== null;
  const contacts = useCompanyContacts(companyId ?? '', false, canSeeContacts);
  const {
    register,
    handleSubmit,
    control,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ActivityFormValues>({
    resolver: zodResolver(activityFormSchema),
    defaultValues: activity ? activityToForm(activity) : blankActivity(),
  });
  const type = watch('type');

  const onSubmit = handleSubmit(async (values) => {
    if (save.isPending) return;
    setFormError(null);
    try {
      await save.mutateAsync(toActivityRequestBody(values, gps));
      onDone();
    } catch (cause) {
      // Everything typed stays in the form; the message says what to fix.
      if (cause instanceof ApiError && cause.details.length > 0) {
        const mapped = cause.details.map((d) => ({
          ...d,
          path: API_FIELD_TO_FORM[d.path] ?? d.path,
        }));
        const shown = applyServerFieldErrors(
          new ApiError(cause.status, cause.code, cause.message, mapped),
          setError,
          ACTIVITY_FORM_FIELDS,
        );
        if (shown) return;
      }
      setFormError(activityErrorText(cause));
    }
  });

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label={activity ? 'Edit report' : 'Record a visit or call'}
      className="grid gap-4 rounded-lg border border-line bg-canvas p-4 sm:grid-cols-2"
    >
      {formError ? (
        <div className="sm:col-span-2">
          <Alert tone="error">{formError}</Alert>
        </div>
      ) : null}
      <SelectField label="Type" {...register('type')}>
        {enumValues(ActivityType).map((value) => (
          <option key={value} value={value}>
            {ACTIVITY_TYPE_LABELS[value]}
          </option>
        ))}
      </SelectField>
      <TextField label="Location" error={errors.location?.message} {...register('location')} />
      <TextField
        label="Date it happened"
        type="date"
        required
        error={errors.occurredDate?.message}
        {...register('occurredDate')}
      />
      <TextField
        label="Time (Nairobi)"
        type="time"
        required
        error={errors.occurredTime?.message}
        {...register('occurredTime')}
      />
      <label className="sm:col-span-2">
        <span className="mb-1 block text-[13px] font-medium">Discussion</span>
        <textarea
          className={textArea}
          aria-invalid={errors.discussion ? true : undefined}
          {...register('discussion')}
        />
        {errors.discussion ? (
          <p className="mt-1 text-xs text-danger">{errors.discussion.message}</p>
        ) : null}
      </label>
      <label>
        <span className="mb-1 block text-[13px] font-medium">Client pain points</span>
        <textarea className={textArea} {...register('painPoints')} />
        {errors.painPoints ? (
          <p className="mt-1 text-xs text-danger">{errors.painPoints.message}</p>
        ) : null}
      </label>
      <label>
        <span className="mb-1 block text-[13px] font-medium">Current tools</span>
        <textarea className={textArea} {...register('currentTools')} />
        {errors.currentTools ? (
          <p className="mt-1 text-xs text-danger">{errors.currentTools.message}</p>
        ) : null}
      </label>
      <label className="sm:col-span-2">
        <span className="mb-1 block text-[13px] font-medium">Next steps</span>
        <textarea className={textArea} {...register('nextSteps')} />
        {errors.nextSteps ? (
          <p className="mt-1 text-xs text-danger">{errors.nextSteps.message}</p>
        ) : null}
      </label>
      <Controller
        control={control}
        name="attendees"
        render={({ field }) => (
          <AttendeesField
            value={field.value}
            onChange={field.onChange}
            contacts={contacts.data?.items ?? []}
            error={errors.attendees?.message}
          />
        )}
      />
      {type === ActivityType.Visit ? <GpsCheckIn value={gps} onChange={setGps} /> : null}
      {activity ? null : (
        <p className="text-xs text-ink-soft sm:col-span-2">
          Save the report first, then add photos, voice notes and documents to it.
        </p>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : activity ? 'Save report' : 'Record report'}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
