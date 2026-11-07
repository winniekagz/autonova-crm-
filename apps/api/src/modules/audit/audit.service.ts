import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditCategory } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Anything that can create an audit row: the root client or an interactive transaction client. */
export interface AuditDb {
  auditLog: {
    create(args: { data: Prisma.AuditLogUncheckedCreateInput }): PromiseLike<unknown>;
  };
}

export type AuditValue = string | number | boolean | null | undefined;
export type AuditSnapshot = Record<string, AuditValue>;

export interface AuditEvent {
  /** Dotted verb, e.g. `user.created`, `auth.login_failed`. */
  action: string;
  entityType: string;
  entityId: string;
  /** Null for system-initiated actions (bootstrap, jobs) and unauthenticated security events. */
  actorUserId?: string | null;
  oldValues?: AuditSnapshot;
  newValues?: AuditSnapshot;
  reason?: string;
  requestId?: string;
}

/**
 * Copies only allow-listed fields into an audit snapshot. Snapshots must never be built from
 * a whole entity: that is how password hashes, tokens and unnecessary personal data leak
 * into an append-only table that can never be cleaned (docs/06, "Audit data minimisation").
 */
export function snapshot<T extends object, K extends keyof T & string>(
  entity: T,
  allowedFields: readonly K[],
): AuditSnapshot {
  const out: AuditSnapshot = {};
  for (const field of allowedFields) {
    const value: unknown = entity[field];
    if (value instanceof Date) out[field] = value.toISOString();
    else if (
      value === null ||
      value === undefined ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      out[field] = value;
    } else {
      throw new Error(`Audit field "${field}" is not a primitive; map it explicitly`);
    }
  }
  return out;
}

/** Defence in depth: refuse snapshots whose keys look like credentials, even if allow-listed by mistake. */
const FORBIDDEN_KEY = /pass(word)?|hash|secret|token|otp|recovery|mfa_?code/i;
const ALLOWED_DESPITE_NAME = new Set(['mfaEnrolled']);

function assertNoSecrets(values: AuditSnapshot | undefined): void {
  if (!values) return;
  for (const key of Object.keys(values)) {
    if (FORBIDDEN_KEY.test(key) && !ALLOWED_DESPITE_NAME.has(key)) {
      throw new Error(`Refusing to audit field "${key}": it looks like a credential`);
    }
  }
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * BUSINESS audit: must be called with the **transaction client** of the business change so the
   * audit row and the change commit or roll back together.
   */
  async record(db: AuditDb, event: AuditEvent): Promise<void> {
    await db.auditLog.create({ data: this.toData(event, AuditCategory.BUSINESS) });
  }

  /**
   * SECURITY audit (failed login, refresh reuse, lockout, ...): there is no business
   * transaction, so it is written on its own. It is awaited, but a failure to write is logged at
   * error level and never turns a legitimate request into an error.
   */
  async recordSecurity(event: AuditEvent): Promise<void> {
    // Built outside the try: a malformed event is a programmer error and must not be swallowed.
    const data = this.toData(event, AuditCategory.SECURITY);
    try {
      await this.prisma.auditLog.create({ data });
    } catch (err) {
      this.logger.error(
        { err, action: event.action, requestId: event.requestId },
        'Failed to write security audit event',
      );
    }
  }

  private toData(event: AuditEvent, category: AuditCategory): Prisma.AuditLogUncheckedCreateInput {
    // Programmer errors (secret-looking keys) must surface in every path, so validate before any I/O.
    assertNoSecrets(event.oldValues);
    assertNoSecrets(event.newValues);
    return {
      category,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      actorUserId: event.actorUserId ?? null,
      oldValues: event.oldValues ?? undefined,
      newValues: event.newValues ?? undefined,
      reason: event.reason ?? null,
      requestId: event.requestId ?? null,
    };
  }
}
