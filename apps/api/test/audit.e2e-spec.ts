import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { AuditService, snapshot } from '../src/modules/audit/audit.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import type { INestApplication } from '@nestjs/common';

describe('audit service (real database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let audit: AuditService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    audit = app.get(AuditService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('commits the business change and its audit row together', async () => {
    const entityId = `commit-${Date.now()}`;
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: `${entityId}@autonova.test`, fullName: 'Commit' },
      });
      await audit.record(tx, {
        action: 'user.created',
        entityType: 'user',
        entityId,
        newValues: snapshot(user, ['email', 'status']),
      });
    });
    expect(await prisma.user.count({ where: { email: `${entityId}@autonova.test` } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { entityId } })).toBe(1);
  });

  it('rolls back the business change when the audit write fails', async () => {
    const entityId = `rollback-${Date.now()}`;
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.user.create({
          data: { email: `${entityId}@autonova.test`, fullName: 'Rollback' },
        });
        await audit.record(tx, {
          action: 'user.created',
          entityType: 'user',
          entityId,
          // Violates the FK to users: the audit insert fails inside the transaction.
          actorUserId: '00000000-0000-7000-8000-000000000000',
        });
      }),
    ).rejects.toThrow();
    expect(await prisma.user.count({ where: { email: `${entityId}@autonova.test` } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { entityId } })).toBe(0);
  });

  it('rolls back the audit row when the business change fails afterwards', async () => {
    const entityId = `late-fail-${Date.now()}`;
    await expect(
      prisma.$transaction(async (tx) => {
        await audit.record(tx, { action: 'thing.changed', entityType: 'thing', entityId });
        throw new Error('business rule violated');
      }),
    ).rejects.toThrow('business rule violated');
    expect(await prisma.auditLog.count({ where: { entityId } })).toBe(0);
  });

  it('writes security events on their own, with the SECURITY category', async () => {
    const entityId = `sec-${Date.now()}`;
    await audit.recordSecurity({
      action: 'auth.login_failed',
      entityType: 'user',
      entityId,
      newValues: { reason: 'bad_password' },
      requestId: 'req-1',
    });
    const row = await prisma.auditLog.findFirst({ where: { entityId } });
    expect(row).toMatchObject({ category: 'SECURITY', actorUserId: null, requestId: 'req-1' });
  });
});
