'use client';

import { PermissionKey } from '@autonova/enums';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { can } from '@/features/auth/permissions';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useCompaniesList } from './companies.queries';
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
  const query = useCompaniesList({ q, industry: '', page: 1, includeArchived: false }, allowed, 10);
  if (!allowed) return null;

  const found = query.data?.items ?? [];
  // The chosen company stays selectable even when the current search no longer lists it.
  const options =
    value && !found.some((company) => company.id === value.id) ? [value, ...found] : found;

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
          {q ? 'No company matches that search.' : 'No companies yet.'} Add one from the Companies
          page.
        </p>
      ) : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
