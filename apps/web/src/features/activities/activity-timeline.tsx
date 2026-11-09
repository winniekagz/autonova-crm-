'use client';

import type { ActivityDto, ContactDto, LeadDto } from '@autonova/contracts';
import { PermissionKey } from '@autonova/enums';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ReasonDialog } from '@/components/ui/reason-dialog';
import { useAuth } from '@/features/auth/auth-context';
import { can } from '@/features/auth/permissions';
import { formatNairobiDateTime } from '@/lib/nairobi-time';
import { useCompanyContacts } from '@/features/companies/companies.queries';
import { TIMELINE_PAGE_SIZE, useActivities, useArchiveActivity } from './activities.queries';
import { ActivityForm } from './activity-form';
import { ActivityGpsMap } from './activity-gps-map';
import { ActivityHold } from './activity-hold';
import { AttendeeLink } from './attendee-link';
import { ACTIVITY_TYPE_LABELS, activityErrorText } from './activity-format';
import { AttachmentsPanel } from './attachments-panel';

type Editing = { kind: 'none' } | { kind: 'new' } | { kind: 'edit'; activity: ActivityDto };

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="mt-2">
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="whitespace-pre-wrap text-sm">{value}</dd>
    </div>
  );
}

function Entry({
  lead,
  activity,
  contacts,
  canChange,
  isDirector,
  canArchive,
  canHold,
  onEdit,
  onArchive,
}: {
  lead: LeadDto;
  activity: ActivityDto;
  contacts: readonly ContactDto[];
  canChange: boolean;
  isDirector: boolean;
  canArchive: boolean;
  canHold: boolean;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const [showFiles, setShowFiles] = useState(false);
  return (
    <li className="border-l-2 border-line pb-6 pl-4 last:pb-0">
      <p className="font-medium text-ink">
        {ACTIVITY_TYPE_LABELS[activity.type]}
        {activity.location ? ` · ${activity.location}` : ''}
      </p>
      <p className="mt-1 text-xs text-ink-soft">
        {formatNairobiDateTime(activity.occurredAt)} · recorded by{' '}
        {activity.createdByName ?? 'a former user'}
        {activity.createdAt !== activity.updatedAt &&
        Math.abs(Date.parse(activity.updatedAt) - Date.parse(activity.createdAt)) > 1000
          ? ` · edited ${formatNairobiDateTime(activity.updatedAt)}`
          : ''}
      </p>
      <dl>
        {activity.attendees.length > 0 ? (
          <Field
            label="Attendees"
            value={activity.attendees
              .map((a) => {
                const label = a.organisation ? `${a.name} (${a.organisation})` : a.name;
                return a.recordedAs ? `${label}, recorded as “${a.recordedAs}”` : label;
              })
              .join(', ')}
          />
        ) : null}
        <Field label="Discussion" value={activity.discussion} />
        <Field label="Pain points" value={activity.painPoints} />
        <Field label="Current tools" value={activity.currentTools} />
        <Field label="Next steps" value={activity.nextSteps} />
        {activity.gpsCleared ? (
          <Field label="Check-in" value="Cleared under the retention policy." />
        ) : null}
        {activity.gps ? (
          <ActivityGpsMap latitude={activity.gps.latitude} longitude={activity.gps.longitude} />
        ) : null}
      </dl>
      {canChange ? <AttendeeLink leadId={lead.id} activity={activity} contacts={contacts} /> : null}
      <ActivityHold leadId={lead.id} activity={activity} canManage={canHold} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          aria-expanded={showFiles}
          onClick={() => setShowFiles((open) => !open)}
        >
          {activity.attachmentCount > 0
            ? `Attachments (${activity.attachmentCount})`
            : canChange
              ? 'Add attachments'
              : 'Attachments'}
        </Button>
        {canChange ? (
          <Button
            type="button"
            variant="secondary"
            onClick={onEdit}
            aria-label={`Edit ${ACTIVITY_TYPE_LABELS[activity.type]} report`}
          >
            Edit
          </Button>
        ) : null}
        {canArchive ? (
          <Button
            type="button"
            variant="secondary"
            onClick={onArchive}
            aria-label={`Archive ${ACTIVITY_TYPE_LABELS[activity.type]} report`}
          >
            Archive
          </Button>
        ) : null}
      </div>
      {showFiles ? (
        <AttachmentsPanel
          leadId={lead.id}
          activityId={activity.id}
          canChange={canChange}
          canRemove={isDirector}
          usedBytes={activity.attachmentBytes}
        />
      ) : null}
    </li>
  );
}

/** A lead's chronological record of meetings, visits, demos and calls, newest first. */
export function ActivityTimeline({ lead }: { lead: LeadDto }) {
  const { me } = useAuth();
  const allowed = can(me, PermissionKey.ActivitiesList);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Editing>({ kind: 'none' });
  const [toArchive, setToArchive] = useState<ActivityDto | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const query = useActivities(lead.id, page, '', allowed);
  const archive = useArchiveActivity(lead.id);
  const companyId = lead.company?.id ?? null;
  const contacts = useCompanyContacts(
    companyId ?? '',
    false,
    allowed && companyId !== null && can(me, PermissionKey.CompaniesRead),
  );
  if (!allowed) return null;

  const isDirector = me?.roles.includes('director') ?? false;
  const mayChange = (activity: ActivityDto) =>
    can(me, PermissionKey.ActivitiesUpdate) && (isDirector || activity.createdByUserId === me?.id);
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / TIMELINE_PAGE_SIZE));

  const confirmArchive = async (reason: string) => {
    if (!toArchive) return;
    setNotice(null);
    setActionError(null);
    try {
      await archive.mutateAsync({ id: toArchive.id, archive: true, reason });
      setNotice('Report archived.');
    } catch (error) {
      setActionError(activityErrorText(error));
    } finally {
      setToArchive(null);
    }
  };

  return (
    <section
      className="mt-6 rounded-lg border border-line bg-surface p-5"
      aria-labelledby="timeline-heading"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="timeline-heading" className="text-lg font-semibold text-navy">
          Visits and calls
        </h2>
        {can(me, PermissionKey.ActivitiesCreate) && editing.kind === 'none' ? (
          <Button
            type="button"
            onClick={() => {
              setNotice(null);
              setEditing({ kind: 'new' });
            }}
          >
            Record a visit or call
          </Button>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        What was discussed, the problems found and what was agreed. Recording one never moves the
        lead to another stage.
      </p>
      {notice ? (
        <div className="mt-3">
          <Alert tone="success">{notice}</Alert>
        </div>
      ) : null}
      {actionError ? (
        <div className="mt-3">
          <Alert tone="error">{actionError}</Alert>
        </div>
      ) : null}
      {editing.kind !== 'none' ? (
        <div className="mt-4">
          <ActivityForm
            key={editing.kind === 'edit' ? editing.activity.id : 'new'}
            leadId={lead.id}
            companyId={lead.company?.id ?? null}
            {...(editing.kind === 'edit' ? { activity: editing.activity } : {})}
            onDone={() => {
              setNotice(editing.kind === 'edit' ? 'Report saved.' : 'Report recorded.');
              setEditing({ kind: 'none' });
              setPage(1);
            }}
          />
        </div>
      ) : null}
      {query.isLoading ? (
        <p role="status" className="mt-4 text-sm text-ink-soft">
          Loading visits and calls…
        </p>
      ) : query.isError ? (
        <div className="mt-4 space-y-3">
          <Alert tone="error">{activityErrorText(query.error)}</Alert>
          <Button type="button" variant="secondary" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">
          No visits or calls recorded yet. Record each meeting, site visit, demo or call so the
          whole team can see the history.
        </p>
      ) : (
        <ol className="mt-4">
          {items.map((activity) => (
            <Entry
              key={activity.id}
              lead={lead}
              activity={activity}
              contacts={contacts.data?.items ?? []}
              canChange={mayChange(activity)}
              isDirector={isDirector}
              canArchive={can(me, PermissionKey.ActivitiesArchive) && isDirector}
              canHold={can(me, PermissionKey.ActivitiesRetention) && isDirector}
              onEdit={() => {
                setNotice(null);
                setEditing({ kind: 'edit', activity });
              }}
              onArchive={() => setToArchive(activity)}
            />
          ))}
        </ol>
      )}
      {total > TIMELINE_PAGE_SIZE ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span>
            {total} reports · page {page} of {lastPage}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Newer
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={page >= lastPage}
              onClick={() => setPage(page + 1)}
            >
              Older
            </Button>
          </div>
        </div>
      ) : null}
      {toArchive ? (
        <ReasonDialog
          title="Archive this report?"
          confirmLabel="Archive report"
          busy={archive.isPending}
          onCancel={() => setToArchive(null)}
          onConfirm={({ reason }) => void confirmArchive(reason)}
        >
          <p>
            It will be hidden from the timeline. Nothing is deleted: the reason is kept in the
            history and a Director can restore it later.
          </p>
        </ReasonDialog>
      ) : null}
    </section>
  );
}
