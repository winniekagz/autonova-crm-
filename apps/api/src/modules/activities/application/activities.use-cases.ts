import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ActivityDto, Paginated } from '@autonova/contracts';
import type { ActivityType } from '@autonova/enums';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user.js';
import { scopeFor } from '../../leads/application/lead-scope.js';
import { LeadsRepository } from '../../leads/infrastructure/leads.repository.js';
import { auditDiff, changedFields, type ActivityFacts } from '../domain/activity-changes.js';
import {
  attendeeNameKey,
  canArchiveActivity,
  canModifyActivity,
  validateActivity,
  type ActivityRuleCode,
} from '../domain/activity-rules.js';
import { ActivitiesRepository, toActivityDto } from '../infrastructure/activities.repository.js';
import type {
  ArchiveActivityBody,
  AttendeeBody,
  LinkAttendeeBody,
  CreateActivityBody,
  ListActivitiesQuery,
  UpdateActivityBody,
} from '../presentation/activities.schemas.js';

export const ACTIVITY_NOT_FOUND = { code: 'ACTIVITY_NOT_FOUND', message: 'Activity not found' };
const LEAD_NOT_FOUND = { code: 'LEAD_NOT_FOUND', message: 'Lead not found' };
export const ACTIVITY_ARCHIVED = {
  code: 'ACTIVITY_ARCHIVED',
  message: 'This report is archived. Restore it before changing it.',
};
const ACTIVITY_NOT_YOURS = {
  code: 'ACTIVITY_NOT_YOURS',
  message: 'Only the person who recorded this report, or a Director, can change it.',
};
const ONLY_DIRECTOR = {
  code: 'ACTIVITY_DIRECTOR_ONLY',
  message: 'Only a Director can archive or restore a report.',
};
const ATTENDEE_NOT_FOUND = { code: 'ATTENDEE_NOT_FOUND', message: 'Attendee not found' };
const ATTENDEE_ALREADY_LINKED = {
  code: 'ATTENDEE_NOT_EXTERNAL',
  message: 'Only an outside attendee that is not yet linked can be linked to a contact.',
};
const ATTENDEE_UNAVAILABLE = {
  code: 'ACTIVITY_ATTENDEE_UNAVAILABLE',
  message: 'Each attendee contact must be a contact of the lead’s company.',
};

const RULE_MESSAGES: Record<ActivityRuleCode, { path: string; message: string }> = {
  OCCURRED_IN_FUTURE: { path: 'occurredAt', message: 'The date and time cannot be in the future.' },
  GPS_ONLY_FOR_VISITS: { path: 'gps', message: 'A location check-in is only for site visits.' },
  GPS_OUT_OF_RANGE: { path: 'gps', message: 'The coordinates are not valid.' },
  TOO_MANY_ATTENDEES: { path: 'attendees', message: 'Add at most 20 attendees.' },
  DUPLICATE_ATTENDEE: { path: 'attendees', message: 'Each attendee can be listed only once.' },
};

/** Audit snapshots list explicit fields only; free text is recorded as a length, never copied. */
type AuditValues = Record<string, string | number | boolean | null>;
const auditSummary = (a: ActivityDto): AuditValues => ({
  type: a.type,
  occurredAt: a.occurredAt,
  hasLocation: a.location !== null,
  hasGps: a.gps !== null,
  attendeeCount: a.attendees.length,
});

const factsOf = (a: ActivityDto): ActivityFacts => ({
  type: a.type,
  occurredAt: a.occurredAt,
  location: a.location,
  discussion: a.discussion,
  painPoints: a.painPoints,
  currentTools: a.currentTools,
  nextSteps: a.nextSteps,
  hasGps: a.gps !== null,
  attendees: a.attendees.map((x) =>
    x.contactId ? `contact:${x.contactId}` : attendeeNameKey(x.name, x.organisation),
  ),
});

@Injectable()
export class ActivitiesUseCases {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activities: ActivitiesRepository,
    private readonly leads: LeadsRepository,
    private readonly audit: AuditService,
  ) {}

  /** The lead, only if the caller may see it. Everything nested starts here, never from an activity id. */
  async requireLead(leadId: string, user: AuthenticatedUser) {
    const lead = await this.leads.findForLifecycle(leadId, scopeFor(user));
    if (!lead) throw new NotFoundException(LEAD_NOT_FOUND);
    return lead;
  }

  /** The activity within its lead, for collaborators in this module that already checked lead access. */
  findOne(leadId: string, id: string) {
    return this.activities.findInLead(leadId, id);
  }

  async list(
    leadId: string,
    query: ListActivitiesQuery,
    user: AuthenticatedUser,
  ): Promise<Paginated<ActivityDto>> {
    await this.requireLead(leadId, user);
    return this.activities.listForLead(leadId, query);
  }

  async get(leadId: string, id: string, user: AuthenticatedUser): Promise<ActivityDto> {
    await this.requireLead(leadId, user);
    const row = await this.activities.findInLead(leadId, id);
    if (!row) throw new NotFoundException(ACTIVITY_NOT_FOUND);
    const bytes = await this.activities.activeBytes([id]);
    return toActivityDto(row, bytes.get(id) ?? 0);
  }

  async create(
    leadId: string,
    input: CreateActivityBody,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<ActivityDto> {
    const lead = await this.requireLead(leadId, user);
    const attendees = input.attendees ?? [];
    this.assertRules(input, attendees);
    await this.assertAttendees(lead.companyId, attendees);

    const created = await this.prisma.$transaction(async (tx) => {
      const row = await this.activities.create(tx, leadId, input, attendees, user.id);
      const dto = await this.activities.findInLead(leadId, row.id, tx);
      if (!dto) throw new NotFoundException(ACTIVITY_NOT_FOUND);
      await this.audit.record(tx, {
        action: 'activity.created',
        entityType: 'activity',
        entityId: row.id,
        actorUserId: user.id,
        newValues: { leadId, ...auditSummary(toActivityDto(dto)) },
        requestId,
      });
      return row;
    });
    return this.get(leadId, created.id, user);
  }

  async update(
    leadId: string,
    id: string,
    input: UpdateActivityBody,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<ActivityDto> {
    const lead = await this.requireLead(leadId, user);
    const current = await this.requireModifiable(leadId, id, user);
    const attendees = input.attendees;
    const merged = {
      type: input.type ?? current.type,
      occurredAt: input.occurredAt ?? current.occurredAt.toISOString(),
      gps: input.gps === undefined ? currentGps(current) : input.gps,
    };
    this.assertRules(merged, attendees ?? current.attendees.map(attendeeOf));
    if (attendees) await this.assertAttendees(lead.companyId, attendees);

    const before = factsOf(toActivityDto(current));
    await this.prisma.$transaction(async (tx) => {
      await this.activities.update(tx, id, input, attendees, user.id);
      const after = await this.activities.findInLead(leadId, id, tx);
      if (!after) throw new NotFoundException(ACTIVITY_NOT_FOUND);
      const diff = auditDiff(changedFields(before, factsOf(toActivityDto(after))));
      await this.audit.record(tx, {
        action: 'activity.updated',
        entityType: 'activity',
        entityId: id,
        actorUserId: user.id,
        oldValues: diff.oldValues,
        newValues: { ...diff.newValues, changedFields: diff.changedFields },
        requestId,
      });
    });
    return this.get(leadId, id, user);
  }

  async archive(
    leadId: string,
    id: string,
    input: ArchiveActivityBody,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<ActivityDto> {
    await this.requireLead(leadId, user);
    await this.requireArchivist(leadId, id, user);
    await this.prisma.$transaction(async (tx) => {
      const changed = await this.activities.archive(tx, id, user.id, input.reason, new Date());
      if (changed.count !== 1) throw new ConflictException(ACTIVITY_ARCHIVED);
      await this.audit.record(tx, {
        action: 'activity.archived',
        entityType: 'activity',
        entityId: id,
        actorUserId: user.id,
        reason: input.reason,
        requestId,
      });
    });
    return this.get(leadId, id, user);
  }

  async restore(
    leadId: string,
    id: string,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<ActivityDto> {
    await this.requireLead(leadId, user);
    await this.requireArchivist(leadId, id, user);
    await this.prisma.$transaction(async (tx) => {
      const changed = await this.activities.restore(tx, id, user.id);
      if (changed.count !== 1) return;
      await this.audit.record(tx, {
        action: 'activity.restored',
        entityType: 'activity',
        entityId: id,
        actorUserId: user.id,
        requestId,
      });
    });
    return this.get(leadId, id, user);
  }

  /** The activity within its lead, for a Director only: archive and restore are Director powers. */
  async requireArchivist(leadId: string, id: string, user: AuthenticatedUser) {
    const row = await this.activities.findInLead(leadId, id);
    if (!row) throw new NotFoundException(ACTIVITY_NOT_FOUND);
    if (!canArchiveActivity({ isDirector: user.roles.includes('director') })) {
      throw new ForbiddenException(ONLY_DIRECTOR);
    }
    return row;
  }

  /**
   * Links an outside attendee to a contact of the lead's company. The name recorded at the time is kept, so the
   * history still shows who was in the room; no CRM contact is ever created from an outside attendee here.
   */
  async linkAttendee(
    leadId: string,
    id: string,
    attendeeId: string,
    input: LinkAttendeeBody,
    user: AuthenticatedUser,
    requestId?: string,
  ): Promise<ActivityDto> {
    const lead = await this.requireLead(leadId, user);
    await this.requireModifiable(leadId, id, user);
    await this.assertAttendees(lead.companyId, [{ contactId: input.contactId }]);
    await this.prisma.$transaction(async (tx) => {
      const attendee = await this.activities.findAttendee(tx, id, attendeeId);
      if (!attendee) throw new NotFoundException(ATTENDEE_NOT_FOUND);
      if (attendee.contactId !== null) throw new ConflictException(ATTENDEE_ALREADY_LINKED);
      const taken = await this.activities.attendeeContactTaken(tx, id, input.contactId);
      if (taken) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          message: RULE_MESSAGES.DUPLICATE_ATTENDEE.message,
          details: [RULE_MESSAGES.DUPLICATE_ATTENDEE],
        });
      }
      const changed = await this.activities.linkAttendee(tx, attendeeId, input.contactId, user.id);
      if (changed.count !== 1) throw new ConflictException(ATTENDEE_ALREADY_LINKED);
      await this.audit.record(tx, {
        action: 'activity.attendee_linked',
        entityType: 'activity',
        entityId: id,
        actorUserId: user.id,
        // The typed name is personal data the contact record already holds, so only ids are recorded.
        newValues: { attendeeId, contactId: input.contactId },
        requestId,
      });
    });
    return this.get(leadId, id, user);
  }

  /**
   * The activity within its lead, if the caller may change it: creator or Director, and not archived
   * (unless `allowArchived`, for archive/restore). Wrong lead, wrong id and invisible lead all read 404.
   */
  async requireModifiable(
    leadId: string,
    id: string,
    user: AuthenticatedUser,
    options: { allowArchived?: boolean } = {},
  ) {
    const row = await this.activities.findInLead(leadId, id);
    if (!row) throw new NotFoundException(ACTIVITY_NOT_FOUND);
    const actor = { id: user.id, isDirector: user.roles.includes('director') };
    if (!canModifyActivity(actor, row)) throw new ForbiddenException(ACTIVITY_NOT_YOURS);
    if (row.archivedAt && !options.allowArchived) throw new ConflictException(ACTIVITY_ARCHIVED);
    return row;
  }

  private assertRules(
    input: {
      type: ActivityType;
      occurredAt: string;
      gps?: { latitude: number; longitude: number } | null;
    },
    attendees: AttendeeBody[],
  ) {
    const result = validateActivity({
      type: input.type,
      occurredAt: new Date(input.occurredAt),
      gps: input.gps ?? null,
      attendeeKeys: attendees.map((a) =>
        'contactId' in a ? `contact:${a.contactId}` : attendeeNameKey(a.name, a.organisation),
      ),
      now: new Date(),
    });
    if (result.ok) return;
    const detail = RULE_MESSAGES[result.code];
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: detail.message,
      details: [detail],
    });
  }

  /** Contact attendees must belong to the lead's company; a lead with no company has none to choose from. */
  private async assertAttendees(companyId: string | null, attendees: AttendeeBody[]) {
    const ids = attendees.flatMap((a) => ('contactId' in a ? [a.contactId] : []));
    if (ids.length === 0) return;
    if (!companyId) throw new ConflictException(ATTENDEE_UNAVAILABLE);
    const found = await this.activities.contactsOfCompany(companyId, ids);
    if (found.length !== new Set(ids).size) throw new ConflictException(ATTENDEE_UNAVAILABLE);
  }
}

function attendeeOf(row: {
  contactId: string | null;
  externalName: string | null;
  organisation: string | null;
}): AttendeeBody {
  return row.contactId
    ? { contactId: row.contactId }
    : { name: row.externalName ?? '', organisation: row.organisation ?? undefined };
}

function currentGps(row: {
  latitude: { toNumber(): number } | null;
  longitude: { toNumber(): number } | null;
}) {
  return row.latitude !== null && row.longitude !== null
    ? { latitude: row.latitude.toNumber(), longitude: row.longitude.toNumber() }
    : null;
}
