import { SystemRoleKey } from '@autonova/enums';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../src/generated/prisma/client.js';

describe('database integrity (migrations applied to a fresh database)', () => {
  // Runtime role (least privilege) — what the API really uses.
  let prisma: PrismaClient;
  // Owner role — used only to prove the trigger layer independently of the privilege layer.
  let owner: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    });
    owner = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.MIGRATION_DATABASE_URL }),
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await owner.$disconnect();
  });

  const newUser = (email: string, extra: object = {}) =>
    prisma.user.create({ data: { email, fullName: 'Test User', ...extra } });

  it('connects to the throwaway test database', async () => {
    const [row] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
    expect(row?.db).toBe('autonova_test');
  });

  it('enforces unique and lower-case emails', async () => {
    await newUser('unique@autonova.test');
    await expect(newUser('unique@autonova.test')).rejects.toThrow();
    await expect(newUser('Mixed@Autonova.Test')).rejects.toThrow();
  });

  it('refuses an ACTIVE user without a password hash', async () => {
    await expect(newUser('nopass@autonova.test', { status: 'ACTIVE' })).rejects.toThrow();
    await expect(
      newUser('withpass@autonova.test', { status: 'ACTIVE', passwordHash: 'hash' }),
    ).resolves.toBeDefined();
  });

  it('enforces machine-readable role keys', async () => {
    await expect(prisma.role.create({ data: { key: 'Bad Key', name: 'x' } })).rejects.toThrow();
    // The seed already created the system roles, so a duplicate key must be rejected.
    await expect(
      prisma.role.create({ data: { key: SystemRoleKey.Director, name: 'dup' } }),
    ).rejects.toThrow();
  });

  it('enforces <resource>:<action> permission keys', async () => {
    await expect(prisma.permission.create({ data: { key: 'nocolon' } })).rejects.toThrow();
    await expect(
      prisma.permission.create({ data: { key: 'users:manage' } }),
    ).resolves.toBeDefined();
  });

  it('does not cascade deletes: a role in use cannot be deleted', async () => {
    const user = await newUser('roleholder@autonova.test');
    const role = await prisma.role.create({ data: { key: 'temp_role', name: 'Temp' } });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    try {
      await expect(prisma.role.delete({ where: { id: role.id } })).rejects.toThrow();
      await expect(prisma.user.delete({ where: { id: user.id } })).rejects.toThrow();
    } finally {
      // Leave nothing behind: other suites list every role, and a stray one would break them
      // depending on which file Vitest happens to run first.
      await prisma.userRole.deleteMany({ where: { roleId: role.id } });
      await prisma.role.delete({ where: { id: role.id } });
    }
  });

  describe('audit log is append-only', () => {
    it('accepts inserts, including system actions with no actor', async () => {
      const row = await prisma.auditLog.create({
        data: { action: 'test.created', entityType: 'test', entityId: 'e1', newValues: { a: 1 } },
      });
      expect(row.actorUserId).toBeNull();
      expect(row.category).toBe('BUSINESS');
    });

    it('stores security events with their own category', async () => {
      const row = await prisma.auditLog.create({
        data: {
          category: 'SECURITY',
          action: 'auth.login_failed',
          entityType: 'user',
          entityId: 'x',
        },
      });
      expect(row.category).toBe('SECURITY');
    });

    it('layer 1 — privileges: the runtime role cannot UPDATE, DELETE or TRUNCATE', async () => {
      const row = await prisma.auditLog.create({
        data: { action: 'test.privileges', entityType: 'test', entityId: 'e2' },
      });
      await expect(
        prisma.auditLog.update({ where: { id: row.id }, data: { action: 'tampered' } }),
      ).rejects.toThrow(/permission denied/i);
      await expect(prisma.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(
        /permission denied/i,
      );
      await expect(prisma.$executeRawUnsafe('TRUNCATE "audit_logs"')).rejects.toThrow(
        /permission denied/i,
      );
    });

    it('layer 2 — triggers: even the owner role cannot UPDATE, DELETE or TRUNCATE', async () => {
      const row = await owner.auditLog.create({
        data: { action: 'test.immutable', entityType: 'test', entityId: 'e3' },
      });
      await expect(
        owner.auditLog.update({ where: { id: row.id }, data: { action: 'tampered' } }),
      ).rejects.toThrow(/append-only/);
      await expect(owner.auditLog.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
      await expect(owner.$executeRawUnsafe('TRUNCATE "audit_logs"')).rejects.toThrow(/append-only/);
      expect(await prisma.auditLog.findUnique({ where: { id: row.id } })).not.toBeNull();
    });
  });

  describe('runtime role privileges', () => {
    it('is not a superuser and cannot change the schema', async () => {
      const [row] = await prisma.$queryRaw<{ rolsuper: boolean; rolcreaterole: boolean }[]>`
        SELECT rolsuper, rolcreaterole FROM pg_roles WHERE rolname = current_user`;
      expect(row).toEqual({ rolsuper: false, rolcreaterole: false });
      await expect(prisma.$executeRawUnsafe('CREATE TABLE should_fail (id int)')).rejects.toThrow(
        /permission denied/i,
      );
      await expect(
        prisma.$executeRawUnsafe(
          'ALTER TABLE "audit_logs" DISABLE TRIGGER audit_logs_no_update_delete',
        ),
      ).rejects.toThrow(/must be owner|permission denied/i);
    });

    it('cannot read the migrations bookkeeping table', async () => {
      await expect(prisma.$queryRaw`SELECT * FROM "_prisma_migrations"`).rejects.toThrow(
        /permission denied/i,
      );
    });
  });
});
