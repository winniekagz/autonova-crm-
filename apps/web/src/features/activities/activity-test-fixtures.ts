import type { ActivityAttachmentDto, ActivityDto, MeResponse } from '@autonova/contracts';
import { DIRECTOR } from '@/test/render';

const REPORT_PERMISSIONS = [
  'leads:list',
  'leads:read',
  'activities:list',
  'activities:read',
  'activities:create',
  'activities:update',
  'companies:read',
];

/** Business Development: records and edits their own reports. */
export const BD_REPORTS: MeResponse = {
  ...DIRECTOR,
  id: 'u-bd',
  roles: ['business_development'],
  permissions: REPORT_PERMISSIONS,
};
export const DIRECTOR_REPORTS: MeResponse = {
  ...DIRECTOR,
  permissions: [...REPORT_PERMISSIONS, 'activities:archive', 'activities:retention'],
};
export const NO_REPORT_ACCESS: MeResponse = { ...DIRECTOR, roles: ['finance'], permissions: [] };
export const READ_ONLY_REPORTS: MeResponse = {
  ...BD_REPORTS,
  permissions: ['leads:read', 'activities:list', 'activities:read'],
};

export const makeActivity = (over: Partial<ActivityDto> = {}): ActivityDto => ({
  id: 'a-1',
  leadId: 'l-1',
  type: 'MEETING',
  occurredAt: '2026-11-05T07:00:00.000Z',
  location: 'Westlands office',
  gps: null,
  discussion: 'Walked through the fleet tracking proposal.',
  painPoints: 'Drivers fill paper logbooks',
  currentTools: 'Excel and WhatsApp',
  nextSteps: 'Send a quote by Friday',
  attendees: [
    {
      id: 'at-1',
      kind: 'CONTACT',
      contactId: 'ct-1',
      name: 'Achieng Otieno',
      organisation: null,
      jobTitle: 'CEO',
      recordedAs: null,
      linkedAt: null,
    },
    {
      id: 'at-2',
      kind: 'EXTERNAL',
      contactId: null,
      name: 'Sam Consultant',
      organisation: 'Acme IT',
      jobTitle: null,
      recordedAs: null,
      linkedAt: null,
    },
  ],
  attachmentCount: 0,
  attachmentBytes: 0,
  archived: false,
  archivedReason: null,
  hold: null,
  gpsCleared: false,
  createdByUserId: 'u-bd',
  createdByName: 'Brian Mwangi',
  createdAt: '2026-11-05T09:00:00.000Z',
  updatedAt: '2026-11-05T09:00:00.000Z',
  ...over,
});

export const makeAttachment = (
  over: Partial<ActivityAttachmentDto> = {},
): ActivityAttachmentDto => ({
  id: 'f-1',
  activityId: 'a-1',
  category: 'PHOTO',
  fileName: 'site.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: 204_800,
  uploadedByName: 'Brian Mwangi',
  recordingNoticeGiven: null,
  createdAt: '2026-11-05T09:05:00.000Z',
  ...over,
});

export const reportsPage = (items: readonly object[], total = items.length) => ({
  body: { items, page: 1, pageSize: 10, total },
});
