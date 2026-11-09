'use client';

import { PermissionKey } from '@autonova/enums';
import { useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { can } from '@/features/auth/permissions';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useCompaniesList, useSaveCompany } from './companies.queries';
import { companyErrorText } from './company-format';

export interface PickedCompany {
  id: string;
  name: string;
}

interface CompanyPickerProps {
  value: PickedCompany | null;
  onChange: (company: PickedCompany | null) => void;
  label?: string;
  error?: string | undefined;
}

const NONE = '';

/**
 * Chooses one of the companies the user may see, or none (an individual prospect). The list is searched
 * on the server, so a Director with hundreds of companies never downloads them all.
 */
export function CompanyPicker({ value, onChange, label = 'Company', error }: CompanyPickerProps) {
  const { me } = useAuth();
  const [search, setSearch] = useState('');
  const q = useDebouncedValue(search.trim(), 300);
  const allowed = can(me, PermissionKey.CompaniesList);
  const canCreate = can(me, PermissionKey.CompaniesCreate);
  const create = useSaveCompany(undefined);
  const [duplicateName, setDuplicateName] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const query = useCompaniesList({ q, industry: '', page: 1, includeArchived: false }, allowed, 10);
  if (!allowed) return null;

  const found = query.data?.items ?? [];
  // The chosen company stays selectable even when the current search no longer lists it.
  const options =
    value && !found.some((company) => company.id === value.id) ? [value, ...found] : found;

  const typed = search.trim();
  const exact = found.some((company) => company.name.trim().toLowerCase() === typed.toLowerCase());
  const offerCreate =
    canCreate && typed.length > 0 && !query.isFetching && !query.isError && !exact;

  // Name only: KRA PIN, location and industry are completed later from the lead or company page.
  const createCompany = async (acknowledge: boolean) => {
    setCreateError(null);
    try {
      const saved = await create.mutateAsync({
        name: typed,
        ...(acknowledge ? { acknowledgeDuplicates: true } : {}),
      });
      setDuplicateName(null);
      setSearch('');
      onChange({ id: saved.id, name: saved.name });
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'COMPANY_DUPLICATE_SUSPECTED') {
        setDuplicateName(typed);
      } else {
        setCreateError(companyErrorText(cause));
      }
    }
  };

  return (
    <div className="space-y-2">
      <TextField
        label={`Find a company`}
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Type part of a name or a KRA PIN"
      />
      <SelectField
        label={label}
        value={value?.id ?? NONE}
        aria-invalid={error ? true : undefined}
        onChange={(event) => {
          const chosen = options.find((company) => company.id === event.target.value);
          onChange(chosen ? { id: chosen.id, name: chosen.name } : null);
        }}
      >
        <option value={NONE}>No company (individual prospect)</option>
        {options.map((company) => (
          <option key={company.id} value={company.id}>
            {company.name}
          </option>
        ))}
      </SelectField>
      {query.isFetching ? (
        <p role="status" className="text-xs text-ink-soft">
          Searching companies…
        </p>
      ) : null}
      {query.isError ? <Alert tone="error">{companyErrorText(query.error)}</Alert> : null}
      {!query.isFetching && !query.isError && found.length === 0 ? (
        <p className="text-xs text-ink-soft">
          {q ? 'No company matches that search.' : 'No companies yet.'}
          {canCreate ? '' : ' Ask someone with access to add it on the Companies page.'}
        </p>
      ) : null}
      {offerCreate ? (
        <div className="rounded-md border border-line bg-canvas p-3">
          {duplicateName === typed ? (
            <p className="mb-2 text-sm text-ink">
              A company with a very similar name already exists. Check the list above and pick it if
              it is the same company.
            </p>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            disabled={create.isPending}
            onClick={() => void createCompany(duplicateName === typed)}
          >
            {create.isPending
              ? 'Creating…'
              : duplicateName === typed
                ? `Create “${typed}” anyway`
                : `Create “${typed}” as a new company`}
          </Button>
          <p className="mt-1 text-xs text-ink-soft">
            Only the name is saved now. Add KRA PIN, location and contacts afterwards.
          </p>
        </div>
      ) : null}
      {createError ? <Alert tone="error">{createError}</Alert> : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
