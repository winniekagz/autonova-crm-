import { Injectable } from '@nestjs/common';
import type { ActivityAttendeeDto, ActivityDto, Paginated } from '@autonova/contracts';
import type { ActivityType } from '@autonova/enums';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { attendeeNameKey, roundCoordinate } from '../domain/activity-rules.js';
import type {
  AttendeeBody,
  CreateActivityBody,
  ListActivitiesQuery,
  UpdateActivityBody,
} from '../presentation/activities.schemas.js';

type Db = Prisma.TransactionClient;

const activitySelect = {
  id: true,
  leadId: true,
  type: true,
  occurredAt: true,
  location: true,
  latitude: true,
  longitude: true,
  discussion: true,
  painPoints: true,
  currentTools: true,
  nextSteps: true,
  gpsClearedAt: true,
  archivedAt: true,
  archivedReason: true,
  holdReference: true,
  holdReason: true,
  holdPlacedAt: true,
  holdPlacedBy: { select: { fullName: true } },
  createdByUserId: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { fullName: true } },
  attendees: {
    select: {
      id: true,
      contactId: true,
      externalName: true,
      organisation: true,
      linkedAt: true,
      contact: { select: { name: true, jobTitle: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
  _count: { select: { attachments: { where: { archivedAt: null } } } },
} as const;

/** Active attachment bytes per activity: one grouped query for a page, never one per row. */
export type AttachmentBytes = ReadonlyMap<string, number>;

type ActivityRow = Prisma.ActivityGetPayload<{ select: typeof activitySelect }>;

const toAttendee = (row: ActivityRow['attendees'][number]): ActivityAttendeeDto => ({
  id: row.id,
  kind: row.contactId ? 'CONTACT' : 'EXTERNAL',
  contactId: row.contactId,
  name: row.contact?.name ?? row.externalName ?? '',
  organisation: row.organisation,
  jobTitle: row.contact?.jobTitle ?? null,
  // A linked outside person shows the contact, and keeps how they were first recorded.
  recordedAs: row.linkedAt && row.externalName ? row.externalName : null,
  linkedAt: row.linkedAt?.toISOString() ?? null,
});

export const toActivityDto = (row: ActivityRow, bytes: number = 0): ActivityDto => ({
  id: row.id,
  leadId: row.leadId,
  type: row.type as ActivityType,
  occurredAt: row.occurredAt.toISOString(),
  location: row.location,
  gps:
    row.latitude !== null && row.longitude !== null
      ? { latitude: row.latitude.toNumber(), longitude: row.longitude.toNumber() }
      : null,
  discussion: row.discussion,
  painPoints: row.painPoints,
  currentTools: row.currentTools,
  nextSteps: row.nextSteps,
  attendees: row.attendees.map(toAttendee),
  attachmentCount: row._count.attachments,
  attachmentBytes: bytes,
  archived: row.archivedAt !== null,
  archivedReason: row.archivedReason,
  hold:
    row.holdReference && row.holdReason && row.holdPlacedAt
      ? {
          reference: row.holdReference,
          reason: row.holdReason,
          placedAt: row.holdPlacedAt.toISOString(),
          placedByName: row.holdPlacedBy?.fullName ?? null,
        }
      : null,
  gpsCleared: row.gpsClearedAt !== null,
  createdByUserId: row.createdByUserId,
  createdByName: row.createdBy.fullName,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const blank = (value: string | undefined) => (value ?? '').trim() || null;

/** Persistence only. Whether the caller may touch the lead or the activity is decided before these run. */
@Injectable()
export class ActivitiesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listForLead(leadId: string, query: ListActivitiesQuery): Promise<Paginated<ActivityDto>> {
    const where: Prisma.ActivityWhereInput = {
      leadId,
      ...(query.includeArchived === 'true' ? {} : { archivedAt: null }),
      ...(query.type ? { type: query.type } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.activity.findMany({
        where,
        select: activitySelect,
        orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.activity.count({ where }),
    ]);
    const bytes = await this.activeBytes(rows.map((row) => row.id));
    return {
      items: rows.map((row) => toActivityDto(row, bytes.get(row.id) ?? 0)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  /** Sum of active attachment sizes for these activities in one query. */
  async activeBytes(activityIds: string[], db: Db = this.prisma): Promise<AttachmentBytes> {
    if (activityIds.length === 0) return new Map();
    const rows = await db.activityAttachment.groupBy({
      by: ['activityId'],
      where: { activityId: { in: activityIds }, archivedAt: null },
      _sum: { sizeBytes: true },
    });
    return new Map(rows.map((row) => [row.activityId, row._sum.sizeBytes ?? 0]));
  }

  /** Both ids must match: an activity is only found through the lead it belongs to. */
  findInLead(leadId: string, id: string, db: Db = this.prisma) {
    return db.activity.findFirst({ where: { id, leadId }, select: activitySelect });
  }

  create(
    db: Db,
    leadId: string,
    input: CreateActivityBody,
    attendees: AttendeeBody[],
    actorUserId: string,
  ) {
    return db.activity.create({
      data: {
        leadId,
        type: input.type,
        occurredAt: new Date(input.occurredAt),
        location: blank(input.location),
        latitude: input.gps ? roundCoordinate(input.gps.latitude) : null,
        longitude: input.gps ? roundCoordinate(input.gps.longitude) : null,
        gpsRecordedAt: input.gps ? new Date() : null,
        discussion: input.discussion,
        painPoints: blank(input.painPoints),
        currentTools: blank(input.currentTools),
        nextSteps: blank(input.nextSteps),
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
        attendees: { create: attendees.map(attendeeData) },
      },
      select: { id: true },
    });
  }

  async update(
    db: Db,
    id: string,
    input: UpdateActivityBody,
    attendees: AttendeeBody[] | undefined,
    actorUserId: string,
  ) {
    if (attendees) await this.syncAttendees(db, id, attendees);
    return db.activity.update({
      where: { id },
      data: {
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.occurredAt !== undefined ? { occurredAt: new Date(input.occurredAt) } : {}),
        ...(input.location !== undefined ? { location: blank(input.location) } : {}),
        ...(input.gps !== undefined
          ? {
              latitude: input.gps ? roundCoordinate(input.gps.latitude) : null,
              longitude: input.gps ? roundCoordinate(input.gps.longitude) : null,
              // A new check-in starts a new retention period; removing one clears the clock too.
              gpsRecordedAt: input.gps ? new Date() : null,
            }
          : {}),
        ...(input.discussion !== undefined ? { discussion: input.discussion } : {}),
        ...(input.painPoints !== undefined ? { painPoints: blank(input.painPoints) } : {}),
        ...(input.currentTools !== undefined ? { currentTools: blank(input.currentTools) } : {}),
        ...(input.nextSteps !== undefined ? { nextSteps: blank(input.nextSteps) } : {}),
        updatedByUserId: actorUserId,
      },
      select: { id: true },
    });
  }

  /**
   * Makes the attendee list match `wanted` without recreating rows that stay: an outside attendee that was
   * later linked to a contact keeps the name it was recorded under and when it was linked.
   */
  private async syncAttendees(db: Db, activityId: string, wanted: AttendeeBody[]) {
    const existing = await db.activityAttendee.findMany({
      where: { activityId },
      select: { id: true, contactId: true, externalName: true, organisation: true },
    });
    const keyOfRow = (row: (typeof existing)[number]) =>
      row.contactId
        ? `contact:${row.contactId}`
        : attendeeNameKey(row.externalName ?? '', row.organisation);
    const keyOfInput = (a: AttendeeBody) =>
      'contactId' in a ? `contact:${a.contactId}` : attendeeNameKey(a.name, a.organisation);
    const wantedKeys = new Set(wanted.map(keyOfInput));
    const keptKeys = new Set(existing.filter((row) => wantedKeys.has(keyOfRow(row))).map(keyOfRow));
    const dropped = existing.filter((row) => !wantedKeys.has(keyOfRow(row))).map((row) => row.id);
    if (dropped.length > 0)
      await db.activityAttendee.deleteMany({ where: { id: { in: dropped } } });
    const added = wanted.filter((a) => !keptKeys.has(keyOfInput(a)));
    if (added.length > 0) {
      await db.activityAttendee.createMany({
        data: added.map((attendee) => ({ activityId, ...attendeeData(attendee) })),
      });
    }
  }

  /** Compare-and-set so two people archiving at once archive once. */
  archive(db: Db, id: string, actorUserId: string, reason: string, at: Date) {
    return db.activity.updateMany({
      where: { id, archivedAt: null },
      data: {
        archivedAt: at,
        archivedByUserId: actorUserId,
        archivedReason: reason,
        updatedByUserId: actorUserId,
      },
    });
  }

  restore(db: Db, id: string, actorUserId: string) {
    return db.activity.updateMany({
      where: { id, archivedAt: { not: null } },
      data: {
        archivedAt: null,
        archivedByUserId: null,
        archivedReason: null,
        updatedByUserId: actorUserId,
      },
    });
  }

  findAttendee(db: Db, activityId: string, id: string) {
    return db.activityAttendee.findFirst({
      where: { id, activityId },
      select: { id: true, contactId: true },
    });
  }

  /** Whether this contact already attends the activity, so linking cannot list one person twice. */
  async attendeeContactTaken(db: Db, activityId: string, contactId: string): Promise<boolean> {
    return (await db.activityAttendee.count({ where: { activityId, contactId } })) > 0;
  }

  /** Compare-and-set: only an unlinked outside attendee can be linked, once. */
  linkAttendee(db: Db, id: string, contactId: string, actorUserId: string) {
    return db.activityAttendee.updateMany({
      where: { id, contactId: null },
      data: { contactId, linkedAt: new Date(), linkedByUserId: actorUserId },
    });
  }

  /** The contacts among `ids` that belong to `companyId`: what a contact attendee may be. */
  contactsOfCompany(companyId: string, ids: string[], db: Db = this.prisma) {
    return db.contact.findMany({
      where: { companyId, id: { in: ids } },
      select: { id: true },
    });
  }
}

function attendeeData(attendee: AttendeeBody) {
  return 'contactId' in attendee
    ? { contactId: attendee.contactId }
    : { externalName: attendee.name, organisation: blank(attendee.organisation) };
}
