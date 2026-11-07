import type { RoleDto } from '@autonova/contracts';
import { roleLabel } from '@/features/auth/roles';

interface RolePickerProps {
  roles: RoleDto[];
  selected: string[];
  onChange: (next: string[]) => void;
  error?: string | undefined;
  disabled?: boolean;
}

/** Checkbox group in a fieldset/legend so assistive tech announces it as one labelled control. */
export function RolePicker({
  roles,
  selected,
  onChange,
  error,
  disabled = false,
}: RolePickerProps) {
  function toggle(key: string) {
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  }
  return (
    <fieldset disabled={disabled} aria-describedby={error ? 'roles-error' : undefined}>
      <legend className="mb-1 text-[13px] font-medium text-ink">Roles</legend>
      <div className="space-y-2">
        {roles.map((role) => (
          <label
            key={role.key}
            className="flex cursor-pointer items-start gap-3 rounded-md border border-line bg-surface p-3 has-[:checked]:border-primary"
          >
            <input
              type="checkbox"
              className="mt-0.5 size-4"
              checked={selected.includes(role.key)}
              onChange={() => toggle(role.key)}
            />
            <span>
              <span className="block text-sm font-medium">{roleLabel(role.key)}</span>
              {role.description ? (
                <span className="block text-xs text-ink-soft">{role.description}</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
      {error ? (
        <p id="roles-error" className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
