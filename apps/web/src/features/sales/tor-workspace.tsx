'use client';

import type { LeadDto, TorVersionDto, TorVersionInput } from '@autonova/contracts';
import { LeadStage, PermissionKey } from '@autonova/enums';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';
import { can } from '@/features/auth/permissions';
import { formatNairobiDateTime } from '@/lib/nairobi-time';
import { saveBlob } from './save-blob';
import { salesErrorText } from './sales-format';
import { useCatalogue, useTor, useTorActions, useTorDiff, useTorVersion } from './sales.queries';
import { TorBuilder } from './tor-builder';
import { TorSignForm } from './tor-sign-form';
import { TotalsTable, VersionView } from './tor-summary';

const STATUS_LABELS = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  SIGNED: 'Signed',
  SUPERSEDED: 'Replaced',
} as const;
const STARTABLE = new Set<string>([
  LeadStage.Qualified,
  LeadStage.ScopeAlignment,
  LeadStage.TorQuoteSent,
]);

function VersionDiff({ leadId, from, to }: { leadId: string; from: number; to: number }) {
  const diff = useTorDiff(leadId, from, to, true);
  if (diff.isLoading)
    return (
      <p role="status" className="text-sm text-ink-soft">
        Comparing…
      </p>
    );
  if (diff.isError) return <Alert tone="error">{salesErrorText(diff.error)}</Alert>;
  if (!diff.data) return null;
  const lines = [
    ...diff.data.scope.map((c) => `${c.itemName}: ${c.detail}`),
    ...diff.data.commercial,
  ];
  return (
    <div
      aria-label={`Changes from version ${from} to ${to}`}
      className="rounded-md border border-line p-3"
    >
      <h4 className="text-sm font-medium">
        Changes from version {from} to {to}
      </h4>
      {lines.length === 0 ? (
        <p className="mt-1 text-sm text-ink-soft">No differences.</p>
      ) : (
        <ul className="mt-1 list-inside list-disc text-sm">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Terms of Reference on the lead page: build, version, send and sign. Rules and totals live on the server. */
export function TorWorkspace({ lead }: { lead: LeadDto }) {
  const { me } = useAuth();
  const canRead = can(me, PermissionKey.TorsRead);
  const canWrite = can(me, PermissionKey.TorsWrite);
  const canApprove = can(me, PermissionKey.TorsApprove);
  const tor = useTor(lead.id, canRead);
  const catalogue = useCatalogue(canWrite && can(me, PermissionKey.CatalogueRead));
  const actions = useTorActions(lead.id);
  const [viewNo, setViewNo] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const picked = useTorVersion(lead.id, viewNo);

  if (!canRead) return null;
  const data = tor.data ?? null;
  const current = data?.current ?? null;
  const shown: TorVersionDto | null = viewNo !== null && picked.data ? picked.data : current;

  const run = async (action: () => Promise<unknown>, done: string) => {
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(done);
    } catch (failure) {
      setError(salesErrorText(failure));
    }
  };

  const download = async (versionNo: number) => {
    setError(null);
    try {
      const { blob, fileName } = await actions.downloadPdf.mutateAsync(versionNo);
      saveBlob(blob, fileName ?? `${data?.number ?? 'TOR'}-v${versionNo}.pdf`);
    } catch (failure) {
      setError(salesErrorText(failure));
    }
  };

  const create = (body: TorVersionInput) =>
    run(() => actions.create.mutateAsync(body), 'Terms of Reference created as a draft.');
  const save = (body: TorVersionInput) =>
    run(
      () => actions.saveDraft.mutateAsync(body),
      'Draft saved. Totals below were worked out by the server.',
    );

  return (
    <section
      className="mt-6 rounded-lg border border-line bg-surface p-5"
      aria-labelledby="tor-heading"
    >
      <h2 id="tor-heading" className="text-lg font-semibold text-navy">
        Terms of Reference{data ? ` · ${data.number}` : ''}
      </h2>
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

      {tor.isLoading ? (
        <p role="status" className="mt-3 text-sm text-ink-soft">
          Loading Terms of Reference…
        </p>
      ) : tor.isError ? (
        <div className="mt-3">
          <Alert tone="error">{salesErrorText(tor.error)}</Alert>
        </div>
      ) : !data || !current ? (
        <>
          <p className="mt-2 text-sm text-ink-soft">No Terms of Reference yet.</p>
          {canWrite && STARTABLE.has(lead.stage) ? (
            <div className="mt-4">
              <TorBuilder
                initial={null}
                catalogue={catalogue.data?.items ?? []}
                busy={actions.create.isPending}
                submitLabel="Create Terms of Reference"
                onSubmit={create}
              />
            </div>
          ) : (
            <p className="mt-1 text-sm text-ink-soft">
              A Terms of Reference can be started once the lead is Qualified.
            </p>
          )}
        </>
      ) : (
        <>
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Versions">
            {data.versions.map((v) => (
              <li key={v.id}>
                <Button
                  type="button"
                  variant={(viewNo ?? current.versionNo) === v.versionNo ? 'primary' : 'secondary'}
                  onClick={() => setViewNo(v.versionNo === current.versionNo ? null : v.versionNo)}
                >
                  v{v.versionNo} · {STATUS_LABELS[v.status]}
                </Button>
              </li>
            ))}
          </ul>
          {data.signed ? (
            <div className="mt-3">
              <Alert tone="success">
                Signed and locked. Later changes need a change request, which is not built yet.
              </Alert>
            </div>
          ) : null}
          {shown && shown.versionNo > 1 && shown.status !== 'DRAFT' ? (
            <div className="mt-3">
              <VersionDiff leadId={lead.id} from={shown.versionNo - 1} to={shown.versionNo} />
            </div>
          ) : null}

          {current.status === 'DRAFT' && viewNo === null ? (
            <DraftEditor
              current={current}
              catalogue={catalogue.data?.items ?? []}
              canWrite={canWrite}
              canApprove={canApprove}
              pending={actions.saveDraft.isPending}
              onSave={save}
              onApprove={() =>
                run(() => actions.approveDiscount.mutateAsync(), 'Discount approved.')
              }
              onSend={() =>
                run(() => actions.send.mutateAsync(), 'Version sent. It is now frozen.')
              }
              sending={actions.send.isPending}
              approving={actions.approveDiscount.isPending}
            />
          ) : shown ? (
            <div className="mt-4">
              <VersionView version={shown} />
              <p className="mt-2 text-xs text-ink-soft">
                Version {shown.versionNo}
                {shown.sentAt ? ` · sent ${formatNairobiDateTime(shown.sentAt)}` : ''}
                {shown.signedAt ? ` · signed ${formatNairobiDateTime(shown.signedAt)}` : ''}
              </p>
              {shown.status === 'SENT' && canWrite ? (
                <TorSignForm
                  version={shown}
                  busy={actions.sign.isPending}
                  onSign={async (body) => {
                    await run(async () => {
                      const outcome = await actions.sign.mutateAsync({
                        versionNo: shown.versionNo,
                        body,
                      });
                      if (outcome.converted) {
                        setViewNo(null);
                      }
                    }, 'Signature recorded.');
                  }}
                />
              ) : shown.signatures.length > 0 ? (
                <p className="mt-2 text-sm">
                  Signed by {shown.signatures.map((s) => s.signerName).join(' and ')}.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {shown ? (
              <Button
                type="button"
                variant="secondary"
                disabled={actions.downloadPdf.isPending}
                onClick={() => download(shown.versionNo)}
              >
                Download PDF (v{shown.versionNo})
              </Button>
            ) : null}
            {canWrite && !data.signed && current.status === 'SENT' ? (
              <Button
                type="button"
                variant="secondary"
                disabled={actions.newVersion.isPending}
                onClick={() =>
                  run(async () => {
                    await actions.newVersion.mutateAsync();
                    setViewNo(null);
                  }, 'New draft version started from the one sent.')
                }
              >
                Start a new version
              </Button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

function DraftEditor({
  current,
  catalogue,
  canWrite,
  canApprove,
  pending,
  sending,
  approving,
  onSave,
  onApprove,
  onSend,
}: {
  current: TorVersionDto;
  catalogue: Parameters<typeof TorBuilder>[0]['catalogue'];
  canWrite: boolean;
  canApprove: boolean;
  pending: boolean;
  sending: boolean;
  approving: boolean;
  onSave: (body: TorVersionInput) => Promise<void>;
  onApprove: () => Promise<void>;
  onSend: () => Promise<void>;
}) {
  if (!canWrite) {
    return (
      <div className="mt-4">
        <VersionView version={current} />
      </div>
    );
  }
  return (
    <div className="mt-4 grid gap-5">
      <TorBuilder
        key={current.id}
        initial={current}
        catalogue={catalogue}
        busy={pending}
        submitLabel="Save draft"
        onSubmit={onSave}
      />
      <div className="rounded-md border border-line p-3">
        <h3 className="text-sm font-medium">Saved totals (version {current.versionNo})</h3>
        <div className="mt-2">
          <TotalsTable
            currency={current.currency}
            totals={current.totals}
            vatRate={current.vatRate}
            exempt={current.vatTreatment === 'EXEMPT'}
          />
        </div>
      </div>
      {current.discountNeedsApproval ? (
        <Alert tone="error">
          The discount is above the approval threshold. A Director must approve it before this can
          be sent.
          {canApprove ? (
            <span className="mt-2 block">
              <Button type="button" variant="secondary" disabled={approving} onClick={onApprove}>
                Approve discount
              </Button>
            </span>
          ) : null}
        </Alert>
      ) : current.discountApprovedByName ? (
        <p className="text-sm text-ink-soft">
          Discount approved by {current.discountApprovedByName}.
        </p>
      ) : null}
      <div>
        <Button type="button" disabled={sending} onClick={onSend}>
          {sending ? 'Sending…' : 'Send for signature'}
        </Button>
        <p className="mt-1 text-xs text-ink-soft">
          Sending freezes this version. Delivery by email or WhatsApp is not built; this records the
          send.
        </p>
      </div>
    </div>
  );
}
