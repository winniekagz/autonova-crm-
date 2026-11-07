import { describe, expect, it, vi } from 'vitest';
import { AuditService, snapshot } from './audit.service.js';
import type { PrismaService } from '../../prisma/prisma.service.js';

describe('snapshot', () => {
  const user = {
    id: 'u1',
    email: 'a@b.co',
    fullName: 'A B',
    passwordHash: 'SECRET',
    status: 'ACTIVE',
    lastLoginAt: new Date('2026-11-07T00:00:00Z'),
  };

  it('copies only allow-listed fields', () => {
    const out = snapshot(user, ['email', 'status']);
    expect(out).toEqual({ email: 'a@b.co', status: 'ACTIVE' });
    expect(JSON.stringify(out)).not.toContain('SECRET');
  });

  it('serialises dates as ISO strings', () => {
    expect(snapshot(user, ['lastLoginAt'])).toEqual({ lastLoginAt: '2026-11-07T00:00:00.000Z' });
  });

  it('refuses non-primitive values instead of dumping them', () => {
    expect(() => snapshot({ roles: ['a'] }, ['roles'])).toThrow(/not a primitive/);
  });
});

describe('AuditService', () => {
  const make = (create = vi.fn().mockResolvedValue({})) => {
    const prisma = { auditLog: { create } } as unknown as PrismaService;
    return { service: new AuditService(prisma), create };
  };

  it('record() writes through the supplied (transaction) client, not the root client', async () => {
    const root = make();
    const tx = { auditLog: { create: vi.fn().mockResolvedValue({}) } };
    await root.service.record(tx, { action: 'user.created', entityType: 'user', entityId: 'u1' });
    expect(tx.auditLog.create).toHaveBeenCalledOnce();
    expect(root.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create.mock.calls[0]?.[0].data).toMatchObject({
      category: 'BUSINESS',
      actorUserId: null,
    });
  });

  it('record() propagates write failures so the business transaction rolls back', async () => {
    const { service } = make();
    const tx = { auditLog: { create: vi.fn().mockRejectedValue(new Error('db down')) } };
    await expect(
      service.record(tx, { action: 'a.b', entityType: 't', entityId: '1' }),
    ).rejects.toThrow('db down');
  });

  it('recordSecurity() uses the SECURITY category', async () => {
    const { service, create } = make();
    await service.recordSecurity({
      action: 'auth.login_failed',
      entityType: 'user',
      entityId: 'x',
    });
    expect(create.mock.calls[0]?.[0].data.category).toBe('SECURITY');
  });

  it('recordSecurity() never throws when the write fails', async () => {
    const { service } = make(vi.fn().mockRejectedValue(new Error('db down')));
    await expect(
      service.recordSecurity({ action: 'auth.login_failed', entityType: 'user', entityId: 'x' }),
    ).resolves.toBeUndefined();
  });

  it.each(['passwordHash', 'refreshToken', 'totpSecret', 'otp', 'recoveryCode'])(
    'rejects a credential-looking key (%s) in both paths',
    async (key) => {
      const { service, create } = make();
      const event = { action: 'a.b', entityType: 't', entityId: '1', newValues: { [key]: 'x' } };
      await expect(service.record({ auditLog: { create } }, event)).rejects.toThrow(/credential/);
      // Programmer errors must not be swallowed by the best-effort security path either.
      await expect(service.recordSecurity(event)).rejects.toThrow(/credential/);
      expect(create).not.toHaveBeenCalled();
    },
  );
});
