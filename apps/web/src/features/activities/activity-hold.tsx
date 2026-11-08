'use client';

import type { ActivityDto } from '@autonova/contracts';
import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ReasonDialog } from '@/components/ui/reason-dialog';
import { formatNairobiDateTime } from '@/lib/nairobi-time';
import { useHold } from './activities.queries';
import { activityErrorText } from './activity-format';

/** A legal hold or approved retention exception: shown to everyone, changed by Directors only. */
export function ActivityHold({
  leadId,
  activity,
  canManage,
}: {
  leadId: string;
  activity: ActivityDto;
  canManage: boolean;
}) {
  const hold = useHold(leadId, activity.id);
  const [dialog, setDialog] = useState<'place' | 'lift' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (input: { reason: string; reference?: string }) => {
    setError(null);
    try {
      await hold.mutateAsync(input);
    } catch (failure) {
      setError(activityErrorText(failure));
    } finally {
      setDialog(null);
    }
  };

  if (!activity.hold && !canManage) return null;
  return (
    <div className="mt-2 text-sm">
      {activity.hold ? (
        <p>
          <span className="font-medium">Held:</span> {activity.hold.reference} —{' '}
          {activity.hold.reason} ({activity.hold.placedByName ?? 'a former user'},{' '}
          {formatNairobiDateTime(activity.hold.placedAt)}). Retention will not clear its check-in or
          voice notes.
        </p>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {canManage ? (
        <Button
          type="button"
          variant="secondary"
          className="mt-1"
          onClick={() => setDialog(activity.hold ? 'lift' : 'place')}
        >
          {activity.hold ? 'Lift hold' : 'Place hold'}
        </Button>
      ) : null}
      {dialog === 'place' ? (
        <ReasonDialog
          title="Place a hold on this report?"
          confirmLabel="Place hold"
          referenceLabel="Reference"
          busy={hold.isPending}
          onCancel={() => setDialog(null)}
          onConfirm={({ reason, reference }) => void run({ reason, reference })}
        >
          <p>
            A held report keeps its check-in and voice notes past the retention period. Use the
            matter or approval number as the reference. Placing the hold is audited.
          </p>
        </ReasonDialog>
      ) : null}
      {dialog === 'lift' ? (
        <ReasonDialog
          title="Lift this hold?"
          confirmLabel="Lift hold"
          busy={hold.isPending}
          onCancel={() => setDialog(null)}
          onConfirm={({ reason }) => void run({ reason })}
        >
          <p>
            The report becomes eligible for retention review again. Lifting the hold is audited.
          </p>
        </ReasonDialog>
      ) : null}
    </div>
  );
}
