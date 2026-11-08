'use client';

import { PermissionKey } from '@autonova/enums';
import { Alert } from '@/components/ui/alert';
import { SelectField } from '@/components/ui/select-field';
import { useAuth } from '@/features/auth/auth-context';
import { can } from '@/features/auth/permissions';
import { useCompanyContacts } from './companies.queries';
import { companyErrorText } from './company-format';

export interface ContactSelection {
  primaryContactId: string | null;
  additionalContactIds: string[];
}

interface LeadContactPickerProps {
  companyId: string;
  value: ContactSelection;
  onChange: (value: ContactSelection) => void;
}

/** Picks the primary contact and any other contacts involved, from one company's active contacts. */
export function LeadContactPicker({ companyId, value, onChange }: LeadContactPickerProps) {
  const { me } = useAuth();
  const allowed = can(me, PermissionKey.CompaniesRead);
  const contacts = useCompanyContacts(companyId, false, allowed);
  if (!allowed) return null;
  if (contacts.isLoading) {
    return (
      <p role="status" className="text-sm text-ink-soft">
        Loading contacts…
      </p>
    );
  }
  if (contacts.isError) return <Alert tone="error">{companyErrorText(contacts.error)}</Alert>;
  const items = contacts.data?.items ?? [];
  if (items.length === 0) {
    return (
      <p className="text-sm text-ink-soft">
        This company has no contacts yet. Add them on the company page, then choose them here.
      </p>
    );
  }
  const others = items.filter((contact) => contact.id !== value.primaryContactId);
  const toggle = (id: string, checked: boolean) =>
    onChange({
      ...value,
      additionalContactIds: checked
        ? [...value.additionalContactIds, id]
        : value.additionalContactIds.filter((existing) => existing !== id),
    });

  return (
    <div className="space-y-3">
      <SelectField
        label="Primary contact"
        value={value.primaryContactId ?? ''}
        onChange={(event) => {
          const id = event.target.value || null;
          onChange({
            primaryContactId: id,
            additionalContactIds: value.additionalContactIds.filter((existing) => existing !== id),
          });
        }}
      >
        <option value="">No primary contact</option>
        {items.map((contact) => (
          <option key={contact.id} value={contact.id}>
            {contact.name}
            {contact.jobTitle ? ` (${contact.jobTitle})` : ''}
          </option>
        ))}
      </SelectField>
      {others.length > 0 ? (
        <fieldset>
          <legend className="mb-1 text-[13px] font-medium text-ink">Other contacts involved</legend>
          <div className="space-y-1">
            {others.map((contact) => (
              <label key={contact.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={value.additionalContactIds.includes(contact.id)}
                  onChange={(event) => toggle(contact.id, event.target.checked)}
                />
                <span>
                  {contact.name}
                  {contact.jobTitle ? ` (${contact.jobTitle})` : ''}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
