'use client';

import type { CompanyDto } from '@autonova/contracts';
import { CompanyIndustry, PermissionKey, enumValues } from '@autonova/enums';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { can } from '@/features/auth/permissions';
import { ApiError } from '@/lib/api-client';
import { applyServerFieldErrors } from '@/lib/form-errors';
import { useCheckCompanyDuplicates, useCompanyQuery, useSaveCompany } from './companies.queries';
import { CompanyDuplicateWarning } from './company-duplicate-warning';
import { INDUSTRY_LABELS, companyErrorText } from './company-format';
import {
  COMPANY_FORM_FIELDS,
  companyFormSchema,
  type CompanyFormValues,
} from './company-form-schema';
import { blankCompany, toCompanyRequestBody, toFormValues } from './company-input';

const numberOrNull = (value: string) => (value === '' ? null : Number(value));

export function CompanyForm({ company }: { company?: CompanyDto }) {
  const { me } = useAuth();
  const router = useRouter();
  const save = useSaveCompany(company);
  const duplicates = useCheckCompanyDuplicates();
  const [formError, setFormError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmationRequired, setConfirmationRequired] = useState(false);
  const {
    register,
    handleSubmit,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CompanyFormValues>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: company ? toFormValues(company) : blankCompany(),
  });
  const allowed = can(me, company ? PermissionKey.CompaniesUpdate : PermissionKey.CompaniesCreate);
  if (!allowed) {
    return (
      <Alert tone="warning">
        You do not have permission to {company ? 'edit' : 'create'} companies.
      </Alert>
    );
  }

  // Runs when the user leaves the name or KRA PIN field. An edit that keeps both has nothing new to check.
  const checkDuplicates = () => {
    const name = (getValues('name') ?? '').trim();
    const kraPin = (getValues('kraPin') ?? '').replace(/\s+/g, '').toUpperCase();
    if (!name && !kraPin) return;
    if (company && name === company.name && kraPin === (company.kraPin ?? '')) return;
    duplicates.mutate({
      ...(name ? { name } : {}),
      ...(kraPin ? { kraPin } : {}),
      ...(company ? { excludeCompanyId: company.id } : {}),
    });
  };
  const keyChanged = () => {
    setAcknowledged(false);
    setConfirmationRequired(false);
  };

  const onSubmit = handleSubmit(async (values) => {
    if (save.isPending) return;
    setFormError(null);
    save.reset();
    try {
      const saved = await save.mutateAsync({
        ...toCompanyRequestBody(values),
        ...(acknowledged ? { acknowledgeDuplicates: true } : {}),
      });
      if (!company) router.replace(`/companies/${saved.id}`);
    } catch (cause) {
      // Everything typed stays in the form; the message says what to fix.
      if (cause instanceof ApiError && cause.code === 'COMPANY_DUPLICATE_SUSPECTED') {
        setConfirmationRequired(true);
        checkDuplicates();
      } else if (cause instanceof ApiError && cause.code === 'COMPANY_KRA_PIN_EXISTS') {
        checkDuplicates();
        setFormError(companyErrorText(cause));
      } else if (!applyServerFieldErrors(cause, setError, COMPANY_FORM_FIELDS)) {
        setFormError(companyErrorText(cause));
      }
    }
  });

  const problem = formError ?? (save.isError && !formError ? companyErrorText(save.error) : null);
  const showSuccess = save.isSuccess && Boolean(company);
  return (
    <section className="max-w-3xl">
      <h1 className="text-2xl font-semibold text-navy">
        {company ? 'Update company' : 'New company'}
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        Contacts and leads are added from the company page once it is saved.
      </p>
      {problem && !confirmationRequired ? (
        <div className="mt-4">
          <Alert tone="error">{problem}</Alert>
        </div>
      ) : null}
      {showSuccess ? (
        <div className="mt-4">
          <Alert tone="success">Company saved.</Alert>
        </div>
      ) : null}
      <form
        onSubmit={onSubmit}
        noValidate
        className="mt-5 grid gap-4 rounded-lg border border-line bg-surface p-4 sm:grid-cols-2 sm:p-6"
      >
        <TextField
          label="Company name"
          required
          maxLength={200}
          error={errors.name?.message}
          {...register('name', { onBlur: checkDuplicates, onChange: keyChanged })}
        />
        <TextField
          label="KRA PIN"
          placeholder="A123456789B"
          error={errors.kraPin?.message}
          {...register('kraPin', { onBlur: checkDuplicates, onChange: keyChanged })}
        />
        <CompanyDuplicateWarning
          checking={duplicates.isPending}
          failed={duplicates.isError}
          result={duplicates.data}
          confirmationRequired={confirmationRequired}
          acknowledged={acknowledged}
          onAcknowledgedChange={setAcknowledged}
        />
        <TextField
          label="Physical location"
          error={errors.location?.message}
          {...register('location')}
        />
        <SelectField
          label="Industry"
          {...register('industry', {
            setValueAs: (value: string) => (value === '' ? null : value),
          })}
        >
          <option value="">Not specified</option>
          {enumValues(CompanyIndustry).map((industry) => (
            <option key={industry} value={industry}>
              {INDUSTRY_LABELS[industry]}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Staff count"
          type="number"
          min={0}
          inputMode="numeric"
          error={errors.staffCount?.message}
          {...register('staffCount', { setValueAs: numberOrNull })}
        />
        <TextField
          label="Branches"
          type="number"
          min={0}
          inputMode="numeric"
          error={errors.branchCount?.message}
          {...register('branchCount', { setValueAs: numberOrNull })}
        />
        <TextField
          label="Website"
          type="url"
          placeholder="https://"
          error={errors.website?.message}
          {...register('website')}
        />
        <label className="sm:col-span-2">
          <span className="mb-1 block text-[13px] font-medium">Social links (one per line)</span>
          <textarea
            className="min-h-20 w-full rounded-md border border-line bg-surface p-3 text-sm"
            aria-invalid={errors.socialLinks ? true : undefined}
            {...register('socialLinks')}
          />
          {errors.socialLinks ? (
            <p className="mt-1 text-xs text-danger">{errors.socialLinks.message}</p>
          ) : null}
        </label>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : company ? 'Save changes' : 'Create company'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push(company ? `/companies/${company.id}` : '/companies')}
          >
            Cancel
          </Button>
        </div>
      </form>
    </section>
  );
}

export function EditCompany({ id }: { id: string }) {
  const query = useCompanyQuery(id);
  if (query.isError) return <Alert tone="error">{companyErrorText(query.error)}</Alert>;
  // The form copies the company into its own state once, so wait for the server's answer.
  if (!query.data || !query.isFetchedAfterMount) return <p role="status">Loading company…</p>;
  return <CompanyForm company={query.data} />;
}
