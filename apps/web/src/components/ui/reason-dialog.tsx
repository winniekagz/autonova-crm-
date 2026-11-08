'use client';

import { useState, type ReactNode } from 'react';
import { ConfirmDialog } from './confirm-dialog';
import { TextField } from './text-field';

interface ReasonDialogProps {
  title: string;
  confirmLabel: string;
  /** Mount it only while it is needed: closing unmounts it, so each use starts with empty fields. */
  busy?: boolean;
  /** When set, a second required field (for example a matter or approval number) is asked for. */
  referenceLabel?: string;
  reasonLabel?: string;
  onConfirm: (input: { reason: string; reference: string }) => void;
  onCancel: () => void;
  children: ReactNode;
}

const REASON_MAX = 500;
const REFERENCE_MAX = 120;

/** A confirmation that also records why. Both fields are required and trimmed before they are sent. */
export function ReasonDialog({
  title,
  confirmLabel,
  busy = false,
  referenceLabel,
  reasonLabel = 'Reason',
  onConfirm,
  onCancel,
  children,
}: ReasonDialogProps) {
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [errors, setErrors] = useState<{ reason?: string; reference?: string }>({});

  const submit = () => {
    const next: { reason?: string; reference?: string } = {};
    if (reason.trim() === '') next.reason = 'Give a reason.';
    else if (reason.trim().length > REASON_MAX)
      next.reason = `Keep it under ${REASON_MAX} characters.`;
    if (referenceLabel) {
      if (reference.trim() === '') next.reference = `Enter the ${referenceLabel.toLowerCase()}.`;
      else if (reference.trim().length > REFERENCE_MAX) {
        next.reference = `Keep it under ${REFERENCE_MAX} characters.`;
      }
    }
    setErrors(next);
    if (Object.keys(next).length === 0) {
      onConfirm({ reason: reason.trim(), reference: reference.trim() });
    }
  };

  return (
    <ConfirmDialog
      open
      title={title}
      confirmLabel={confirmLabel}
      busy={busy}
      onCancel={onCancel}
      onConfirm={submit}
    >
      <div className="space-y-3">
        {children}
        {referenceLabel ? (
          <TextField
            label={referenceLabel}
            value={reference}
            maxLength={REFERENCE_MAX}
            error={errors.reference}
            disabled={busy}
            onChange={(event) => setReference(event.target.value)}
          />
        ) : null}
        <TextField
          label={reasonLabel}
          value={reason}
          maxLength={REASON_MAX}
          error={errors.reason}
          disabled={busy}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
    </ConfirmDialog>
  );
}
