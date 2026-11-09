'use client';

import type { LeadDto, QuotationDto } from '@autonova/contracts';
import { PermissionKey } from '@autonova/enums';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { useAuth } from '@/features/auth/auth-context';
import { can } from '@/features/auth/permissions';
import { saveBlob } from './save-blob';
import { formatMoney, kindLabel, salesErrorText } from './sales-format';
import { useQuotationActions, useQuotations } from './sales.queries';
import { TotalsTable } from './tor-summary';

const schema = z.object({
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the last day the quote is valid'),
  notes: z.string().max(2000),
});
type Values = z.infer<typeof schema>;

const NEXT: Record<string, string[]> = { DRAFT: ['SENT'], SENT: ['ACCEPTED', 'REJECTED'] };

function QuotationCard({
  quote,
  canWrite,
  busy,
  onStatus,
  onPdf,
}: {
  quote: QuotationDto;
  canWrite: boolean;
  busy: boolean;
  onStatus: (id: string, status: string) => void;
  onPdf: (quote: QuotationDto) => void;
}) {
  const status = quote.expired ? 'EXPIRED' : quote.status;
  return (
    <li className="rounded-md border border-line p-3" aria-label={`Quotation ${quote.number}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          {quote.number}
          {quote.torVersionNo ? ` · from ToR v${quote.torVersionNo}` : ' · quick quote'}
        </p>
        <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-medium">
          {kindLabel(status)}
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Valid until {quote.validUntil} · one-off total{' '}
        {formatMoney(quote.currency, quote.totals.totalOneOff)}
      </p>
      <details className="mt-2">
        <summary className="cursor-pointer text-sm text-primary">Lines and totals</summary>
        <ul className="mt-2 grid gap-1 text-sm">
          {quote.lines.map((line) => (
            <li key={line.id} className="flex justify-between gap-4">
              <span>
                {line.description} <span className="text-ink-soft">× {line.quantity}</span>
              </span>
              <span>{formatMoney(quote.currency, line.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2">
          <TotalsTable
            currency={quote.currency}
            totals={quote.totals}
            vatRate={quote.vatRate}
            exempt={quote.vatTreatment === 'EXEMPT'}
          />
        </div>
      </details>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => onPdf(quote)}>
          Download PDF
        </Button>
        {canWrite && !quote.expired
          ? (NEXT[quote.status] ?? []).map((next) => (
              <Button
                key={next}
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => onStatus(quote.id, next)}
              >
                {next === 'SENT' ? 'Mark as sent' : `Mark ${kindLabel(next).toLowerCase()}`}
              </Button>
            ))
          : null}
      </div>
    </li>
  );
}

/**
 * Quotations on the lead page. Accepting a quote only records the client's answer: it does not win the
 * lead. A deal is won when both parties sign the Terms of Reference.
 */
export function QuotationsPanel({ lead }: { lead: LeadDto }) {
  const { me } = useAuth();
  const canRead = can(me, PermissionKey.QuotationsRead);
  const canWrite = can(me, PermissionKey.QuotationsWrite);
  const list = useQuotations(lead.id, canRead);
  const actions = useQuotationActions(lead.id);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { validUntil: '', notes: '' },
  });
  if (!canRead) return null;
  const quotes = list.data?.items ?? [];

  const fail = (failure: unknown) => setError(salesErrorText(failure));
  const submit = form.handleSubmit(async (values) => {
    setError(null);
    setNotice(null);
    try {
      const saved = await actions.fromTor.mutateAsync({
        validUntil: values.validUntil,
        ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
      });
      setNotice(`Quotation ${saved.number} created.`);
      form.reset();
    } catch (failure) {
      fail(failure);
    }
  });
  const status = async (id: string, next: string) => {
    setError(null);
    setNotice(null);
    try {
      await actions.setStatus.mutateAsync({ id, status: next });
      setNotice(
        next === 'ACCEPTED'
          ? 'Marked accepted. The lead is not won until both parties sign the Terms of Reference.'
          : 'Status updated.',
      );
    } catch (failure) {
      fail(failure);
    }
  };
  const pdf = async (quote: QuotationDto) => {
    setError(null);
    try {
      const { blob, fileName } = await actions.downloadPdf.mutateAsync(quote.id);
      saveBlob(blob, fileName ?? `${quote.number}.pdf`);
    } catch (failure) {
      fail(failure);
    }
  };

  return (
    <section
      className="mt-6 rounded-lg border border-line bg-surface p-5"
      aria-labelledby="quotes-heading"
    >
      <h2 id="quotes-heading" className="text-lg font-semibold text-navy">
        Quotations
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Accepting a quotation does not convert the lead. Signing the Terms of Reference does.
      </p>
      {notice ? (
        <div className="mt-3">
          <Alert tone="success">{notice}</Alert>
        </div>
      ) : null}
      {error ? (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}
      {list.isLoading ? (
        <p role="status" className="mt-3 text-sm text-ink-soft">
          Loading quotations…
        </p>
      ) : list.isError ? (
        <div className="mt-3">
          <Alert tone="error">{salesErrorText(list.error)}</Alert>
        </div>
      ) : quotes.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">No quotations yet.</p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {quotes.map((quote) => (
            <QuotationCard
              key={quote.id}
              quote={quote}
              canWrite={canWrite}
              busy={actions.setStatus.isPending}
              onStatus={status}
              onPdf={pdf}
            />
          ))}
        </ul>
      )}
      {canWrite ? (
        <form
          onSubmit={submit}
          noValidate
          aria-label="Quote from the Terms of Reference"
          className="mt-4 grid max-w-xl gap-3 rounded-md border border-line p-4"
        >
          <h3 className="font-medium">Create a quotation from the Terms of Reference</h3>
          <TextField
            label="Valid until"
            type="date"
            error={form.formState.errors.validUntil?.message}
            {...form.register('validUntil')}
          />
          <TextField label="Notes (optional)" {...form.register('notes')} />
          <Button type="submit" disabled={actions.fromTor.isPending}>
            {actions.fromTor.isPending ? 'Creating…' : 'Create quotation'}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
