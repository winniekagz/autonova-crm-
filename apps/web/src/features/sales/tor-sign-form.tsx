'use client';

import type { SignTorRequest, TorVersionDto } from '@autonova/contracts';
import { SignatureParty } from '@autonova/enums';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { formatNairobiDateTime } from '@/lib/nairobi-time';

const schema = z.object({
  party: z.enum(['CLIENT', 'AUTONOVA']),
  signerName: z.string().trim().min(1, 'Enter the signer’s full name').max(200),
  signerTitle: z.string().max(200),
  evidenceNote: z.string().max(500),
});
type Values = z.infer<typeof schema>;

const PARTY_LABELS = { CLIENT: 'The client', AUTONOVA: 'Autonova' } as const;

/**
 * Records a signature as a typed name, the only method agreed so far. The person recording it states what
 * they saw (for example a scan received by email); the server binds the signature to the version's content.
 */
export function TorSignForm({
  version,
  busy,
  onSign,
}: {
  version: TorVersionDto;
  busy: boolean;
  onSign: (body: SignTorRequest) => Promise<void>;
}) {
  const signed = new Set(version.signatures.map((s) => s.party));
  const remaining = [SignatureParty.Client, SignatureParty.Autonova].filter((p) => !signed.has(p));
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      party: remaining[0] ?? 'CLIENT',
      signerName: '',
      signerTitle: '',
      evidenceNote: '',
    },
  });
  const submit = form.handleSubmit(async (values) => {
    await onSign({
      party: values.party,
      signerName: values.signerName.trim(),
      ...(values.signerTitle.trim() ? { signerTitle: values.signerTitle.trim() } : {}),
      ...(values.evidenceNote.trim() ? { evidenceNote: values.evidenceNote.trim() } : {}),
    });
    form.reset({ ...form.getValues(), signerName: '', signerTitle: '', evidenceNote: '' });
  });
  return (
    <div className="mt-4">
      <h4 className="text-sm font-medium">Signatures</h4>
      <ul className="mt-1 grid gap-1 text-sm" aria-label="Recorded signatures">
        {version.signatures.length === 0 ? (
          <li className="text-ink-soft">Nobody has signed yet.</li>
        ) : (
          version.signatures.map((s) => (
            <li key={s.id}>
              {PARTY_LABELS[s.party]}: {s.signerName}
              {s.signerTitle ? `, ${s.signerTitle}` : ''} · {formatNairobiDateTime(s.signedAt)}
              {s.evidenceNote ? <span className="text-ink-soft"> · {s.evidenceNote}</span> : null}
            </li>
          ))
        )}
      </ul>
      {remaining.length > 0 ? (
        <form
          onSubmit={submit}
          noValidate
          aria-label="Record a signature"
          className="mt-3 grid max-w-xl gap-3 rounded-md border border-line p-4"
        >
          <p className="text-xs text-ink-soft">
            When both parties have signed, the version is locked and the client account is created.
          </p>
          <SelectField label="Signing for" {...form.register('party')}>
            {remaining.map((party) => (
              <option key={party} value={party}>
                {PARTY_LABELS[party]}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Signer’s full name"
            error={form.formState.errors.signerName?.message}
            {...form.register('signerName')}
          />
          <TextField label="Title (optional)" {...form.register('signerTitle')} />
          <TextField
            label="Evidence (optional)"
            placeholder="Signed scan received by email on 5 Nov"
            {...form.register('evidenceNote')}
          />
          <Button type="submit" disabled={busy}>
            {busy ? 'Recording…' : 'Record signature'}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
