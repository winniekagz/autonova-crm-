'use client';

import { useId, useState } from 'react';
import { TextField } from '@/components/ui/text-field';

/** The follow-ups the sales process names (visit, call, demo, meeting) plus the usual document sends. */
export const NEXT_ACTION_OPTIONS = [
  'Phone call',
  'Site visit',
  'Product demo',
  'Meeting',
  'Send proposal',
  'Send quotation',
  'Follow up by email',
  'Follow up on WhatsApp',
] as const;

const OTHER = '__other__';

interface NextActionFieldProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string | undefined;
}

/**
 * A dropdown of standard actions. "Other" reveals a text box, so a lead can still carry a custom
 * action (and an older lead with free text keeps it). The saved value is always plain text.
 */
export function NextActionField({ value, onChange, onBlur, error }: NextActionFieldProps) {
  const id = useId();
  const isPreset = (NEXT_ACTION_OPTIONS as readonly string[]).includes(value);
  const [other, setOther] = useState(value !== '' && !isPreset);
  const selected = other ? OTHER : isPreset ? value : '';
  const errorId = `${id}-error`;

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={id} className="mb-1 block text-[13px] font-medium text-ink">
          Next action
          <span aria-hidden="true"> *</span>
        </label>
        <select
          id={id}
          required
          value={selected}
          onBlur={onBlur}
          aria-invalid={error && !other ? true : undefined}
          aria-describedby={error && !other ? errorId : undefined}
          onChange={(event) => {
            const next = event.target.value;
            if (next === OTHER) {
              setOther(true);
              onChange('');
            } else {
              setOther(false);
              onChange(next);
            }
          }}
          className={`h-10 w-full rounded-md border bg-surface px-3 text-sm text-ink ${
            error && !other ? 'border-danger' : 'border-line'
          }`}
        >
          <option value="">Choose an action…</option>
          {NEXT_ACTION_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          <option value={OTHER}>Other…</option>
        </select>
        {error && !other ? (
          <p id={errorId} className="mt-1 text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>
      {other ? (
        <TextField
          label="Describe the next action"
          required
          maxLength={500}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          error={error}
        />
      ) : null}
    </div>
  );
}
