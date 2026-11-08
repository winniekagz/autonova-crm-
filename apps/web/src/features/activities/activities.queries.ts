'use client';

import type { ActivityInput, ActivityDto } from '@autonova/contracts';
import type { AttachmentCategory } from '@autonova/enums';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthedRequest } from '@/features/auth/use-authed-request';
import * as api from './api';

/** Cache keys for this feature. Everything starts with 'activities' so one call can clear it all. */
export const activitiesKeys = {
  all: ['activities'] as const,
  lists: (leadId: string) => ['activities', 'list', leadId] as const,
  list: (leadId: string, page: number, type: string) =>
    ['activities', 'list', leadId, { page, type }] as const,
  attachments: (activityId: string) => ['activities', 'attachments', activityId] as const,
};

export const TIMELINE_PAGE_SIZE = 10;

export function useActivities(leadId: string, page: number, type: string, enabled: boolean) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: activitiesKeys.list(leadId, page, type),
    queryFn: () =>
      request((token) => api.listActivities(token, leadId, page, TIMELINE_PAGE_SIZE, type)),
    enabled,
  });
}

export function useAttachments(leadId: string, activityId: string, enabled: boolean) {
  const request = useAuthedRequest();
  return useQuery({
    queryKey: activitiesKeys.attachments(activityId),
    queryFn: () => request((token) => api.listAttachments(token, leadId, activityId)),
    enabled,
  });
}

function useAfterActivityWrite(leadId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: activitiesKeys.lists(leadId) });
}

/** Records a report, or edits `activity` when one is given. */
export function useSaveActivity(leadId: string, activity: ActivityDto | undefined) {
  const request = useAuthedRequest();
  const after = useAfterActivityWrite(leadId);
  return useMutation({
    mutationFn: (body: ActivityInput) =>
      request((token) =>
        activity
          ? api.updateActivity(token, leadId, activity.id, body)
          : api.createActivity(token, leadId, body),
      ),
    onSuccess: () => after(),
  });
}

export function useArchiveActivity(leadId: string) {
  const request = useAuthedRequest();
  const after = useAfterActivityWrite(leadId);
  return useMutation({
    mutationFn: (input: { id: string; archive: boolean; reason: string }) =>
      request((token) =>
        input.archive
          ? api.archiveActivity(token, leadId, input.id, input.reason)
          : api.restoreActivity(token, leadId, input.id),
      ),
    onSuccess: () => after(),
  });
}

export function useLinkAttendee(leadId: string, activityId: string) {
  const request = useAuthedRequest();
  const after = useAfterActivityWrite(leadId);
  return useMutation({
    mutationFn: (input: { attendeeId: string; contactId: string }) =>
      request((token) =>
        api.linkAttendee(token, leadId, activityId, input.attendeeId, input.contactId),
      ),
    onSuccess: () => after(),
  });
}

/** Places a legal hold (with a reference) or lifts it (reference omitted). Directors only. */
export function useHold(leadId: string, activityId: string) {
  const request = useAuthedRequest();
  const after = useAfterActivityWrite(leadId);
  return useMutation({
    mutationFn: (input: { reason: string; reference?: string }) =>
      request((token) =>
        input.reference === undefined
          ? api.liftHold(token, leadId, activityId, input.reason)
          : api.placeHold(token, leadId, activityId, {
              reference: input.reference,
              reason: input.reason,
            }),
      ),
    onSuccess: () => after(),
  });
}

export function useUploadAttachment(leadId: string, activityId: string) {
  const request = useAuthedRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      category: AttachmentCategory;
      file: File;
      recordingNoticeGiven?: boolean;
      onProgress?: (fraction: number) => void;
      signal?: AbortSignal;
    }) =>
      request((token) =>
        api.uploadAttachment(token, leadId, activityId, input, input.onProgress, input.signal),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: activitiesKeys.attachments(activityId) });
      void queryClient.invalidateQueries({ queryKey: activitiesKeys.lists(leadId) });
    },
  });
}

export function useRemoveAttachment(leadId: string, activityId: string) {
  const request = useAuthedRequest();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { attachmentId: string; reason: string }) =>
      request((token) =>
        api.removeAttachment(token, leadId, activityId, input.attachmentId, input.reason),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: activitiesKeys.attachments(activityId) });
      void queryClient.invalidateQueries({ queryKey: activitiesKeys.lists(leadId) });
    },
  });
}

export function useDownloadAttachment(leadId: string, activityId: string) {
  const request = useAuthedRequest();
  return useMutation({
    mutationFn: (attachmentId: string) =>
      request((token) => api.downloadAttachment(token, leadId, activityId, attachmentId)),
  });
}
