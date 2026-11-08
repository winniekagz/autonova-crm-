'use client';

import type { ActivityAttachmentDto } from '@autonova/contracts';
import { AttachmentCategory, enumValues } from '@autonova/enums';
import {
  ATTACHMENT_RULES,
  DEFAULT_ACTIVITY_ATTACHMENT_TOTAL_MB,
  MAX_ATTACHMENTS_PER_ACTIVITY,
  categoryForExtension,
  checkAttachmentCandidate,
} from '@autonova/validation';
import { useRef, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ReasonDialog } from '@/components/ui/reason-dialog';
import { SelectField } from '@/components/ui/select-field';
import {
  useAttachments,
  useDownloadAttachment,
  useRemoveAttachment,
  useUploadAttachment,
} from './activities.queries';
import { CATEGORY_LABELS, activityErrorText, formatBytes, isRetryable } from './activity-format';

const MB = 1024 * 1024;

const accept = enumValues(AttachmentCategory)
  .flatMap((c) => ATTACHMENT_RULES[c].extensions.map((e) => `.${e}`))
  .join(',');

const EARLY: Record<'EMPTY' | 'TOO_LARGE' | 'TYPE_NOT_ALLOWED', (limitMb: number) => string> = {
  EMPTY: () => 'That file is empty.',
  TOO_LARGE: (mb) => `That file is too large for this category (the limit is ${mb} MB).`,
  TYPE_NOT_ALLOWED: () => 'That file type is not accepted for this category.',
};

interface AttachmentsPanelProps {
  leadId: string;
  activityId: string;
  /** Whether the viewer may add files (the recorder or a Director). */
  canChange: boolean;
  /** Only a Director removes files, and always with a reason. */
  canRemove: boolean;
  /** Total size of the active files, to show how much of the allowance is used. */
  usedBytes: number;
}

type Pending = { file: File; category: AttachmentCategory; recordingNoticeGiven?: boolean };

export function AttachmentsPanel({
  leadId,
  activityId,
  canChange,
  canRemove,
  usedBytes,
}: AttachmentsPanelProps) {
  const list = useAttachments(leadId, activityId, true);
  const upload = useUploadAttachment(leadId, activityId);
  const remove = useRemoveAttachment(leadId, activityId);
  const download = useDownloadAttachment(leadId, activityId);
  const [category, setCategory] = useState<AttachmentCategory>('PHOTO');
  const [progress, setProgress] = useState<number | null>(null);
  const [failed, setFailed] = useState<{
    pending: Pending;
    message: string;
    retryable: boolean;
  } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [toRemove, setToRemove] = useState<ActivityAttachmentDto | null>(null);
  const [participantsTold, setParticipantsTold] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const items = list.data ?? [];
  const full = items.length >= MAX_ATTACHMENTS_PER_ACTIVITY;

  const send = async (pending: Pending) => {
    if (upload.isPending) return;
    setProblem(null);
    setNotice(null);
    setFailed(null);
    setProgress(0);
    try {
      await upload.mutateAsync({ ...pending, onProgress: setProgress });
      setParticipantsTold(false);
      setNotice(`${pending.file.name} was added.`);
    } catch (error) {
      setFailed({ pending, message: activityErrorText(error), retryable: isRetryable(error) });
    } finally {
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  };

  const onPick = (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    setNotice(null);
    setFailed(null);
    // A file's name suggests its kind; follow it unless the person already chose another category.
    const suggested = categoryForExtension(file.name);
    const chosen =
      suggested && suggested !== category ? (suggested as AttachmentCategory) : category;
    if (chosen !== category) setCategory(chosen);
    const check = checkAttachmentCandidate(chosen, file);
    if (!check.ok) {
      setProblem(EARLY[check.code](ATTACHMENT_RULES[chosen].maxBytes / MB));
      if (input.current) input.current.value = '';
      return;
    }
    if (chosen === 'VOICE_NOTE' && !participantsTold) {
      setProblem(
        'Confirm the participants were told they were being recorded, then choose the file again.',
      );
      if (input.current) input.current.value = '';
      return;
    }
    void send({
      file,
      category: chosen,
      ...(chosen === 'VOICE_NOTE' ? { recordingNoticeGiven: true } : {}),
    });
  };

  const open = async (attachment: ActivityAttachmentDto) => {
    setProblem(null);
    try {
      const { blob, fileName } = await download.mutateAsync(attachment.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName ?? attachment.fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setProblem(activityErrorText(error));
    }
  };

  const confirmRemove = async (reason: string) => {
    if (!toRemove) return;
    setProblem(null);
    setNotice(null);
    try {
      await remove.mutateAsync({ attachmentId: toRemove.id, reason });
      setNotice(`${toRemove.fileName} was removed.`);
    } catch (error) {
      setProblem(activityErrorText(error));
    } finally {
      setToRemove(null);
    }
  };

  return (
    <div className="mt-3 space-y-3 border-t border-line pt-3" aria-label="Attachments">
      <p className="text-[13px] font-medium text-ink">Attachments</p>
      {notice ? <Alert tone="success">{notice}</Alert> : null}
      {problem ? <Alert tone="error">{problem}</Alert> : null}
      {list.isLoading ? (
        <p role="status" className="text-sm text-ink-soft">
          Loading attachments…
        </p>
      ) : list.isError ? (
        <Alert tone="error">{activityErrorText(list.error)}</Alert>
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-soft">No attachments yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((attachment) => (
            <li
              key={attachment.id}
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span>
                {attachment.fileName}{' '}
                <span className="text-xs text-ink-soft">
                  · {CATEGORY_LABELS[attachment.category]} · {formatBytes(attachment.sizeBytes)}
                  {attachment.recordingNoticeGiven ? ' · participants told' : ''}
                </span>
              </span>
              <span className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  aria-label={`Download ${attachment.fileName}`}
                  disabled={download.isPending}
                  onClick={() => void open(attachment)}
                >
                  Download
                </Button>
                {canRemove ? (
                  <Button
                    type="button"
                    variant="secondary"
                    aria-label={`Remove ${attachment.fileName}`}
                    onClick={() => setToRemove(attachment)}
                  >
                    Remove
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-ink-soft">
        {formatBytes(usedBytes)} of {DEFAULT_ACTIVITY_ATTACHMENT_TOTAL_MB} MB used.
      </p>
      {canChange ? (
        <div className="space-y-2">
          {full ? (
            <p className="text-sm text-ink-soft">
              This report has {MAX_ATTACHMENTS_PER_ACTIVITY} attachments, the most it can hold.
              Remove one to add another.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-[12rem_1fr] sm:items-end">
              <SelectField
                label="Kind of file"
                value={category}
                disabled={upload.isPending}
                onChange={(event) => setCategory(event.target.value as AttachmentCategory)}
              >
                {enumValues(AttachmentCategory).map((value) => (
                  <option key={value} value={value}>
                    {CATEGORY_LABELS[value]}
                  </option>
                ))}
              </SelectField>
              <label className="block">
                <span className="mb-1 block text-[13px] font-medium text-ink">Choose a file</span>
                <input
                  ref={input}
                  type="file"
                  accept={accept}
                  disabled={upload.isPending}
                  className="block w-full text-sm"
                  onChange={(event) => onPick(event.target.files?.[0])}
                />
              </label>
            </div>
          )}
          {category === 'VOICE_NOTE' ? (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={participantsTold}
                disabled={upload.isPending}
                onChange={(event) => setParticipantsTold(event.target.checked)}
              />
              <span>Everyone present was told this conversation is being recorded.</span>
            </label>
          ) : null}
          <p className="text-xs text-ink-soft">
            Photos up to {ATTACHMENT_RULES.PHOTO.maxBytes / MB} MB (JPG, PNG, WebP), documents up to{' '}
            {ATTACHMENT_RULES.DOCUMENT.maxBytes / MB} MB (PDF, Word, Excel, CSV), voice notes up to{' '}
            {ATTACHMENT_RULES.VOICE_NOTE.maxBytes / MB} MB (MP3, M4A, WAV, WebM). Files are private
            to people who can see this lead. They are not scanned for viruses.
          </p>
          {progress !== null ? (
            <div role="status" aria-label="Upload progress">
              <progress className="h-2 w-full" max={1} value={progress} />
              <p className="text-xs text-ink-soft">Uploading… {Math.round(progress * 100)}%</p>
            </div>
          ) : null}
          {failed ? (
            <Alert tone="error">
              <p>
                {failed.pending.file.name} was not added. {failed.message}
              </p>
              {failed.retryable ? (
                <Button
                  className="mt-2"
                  type="button"
                  variant="secondary"
                  onClick={() => void send(failed.pending)}
                >
                  Try again
                </Button>
              ) : null}
            </Alert>
          ) : null}
        </div>
      ) : null}
      {toRemove ? (
        <ReasonDialog
          title="Remove this attachment?"
          confirmLabel="Remove attachment"
          busy={remove.isPending}
          onCancel={() => setToRemove(null)}
          onConfirm={({ reason }) => void confirmRemove(reason)}
        >
          <p>
            {toRemove.fileName} will no longer be listed or downloadable. Who removed it and why is
            kept in the history. The stored file stays until a Director approves its purge under the
            retention process.
          </p>
        </ReasonDialog>
      ) : null}
    </div>
  );
}
