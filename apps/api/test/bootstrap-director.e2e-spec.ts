import { SystemRoleKey, UserStatus } from '@autonova/enums';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import {
  BootstrapDirectorUseCase,
  DirectorAlreadyExistsError,
  EmailAlreadyUsedError,
} from '../src/modules/auth/application/bootstrap-director.use-case.js';
import { AuditService } from '../src/modules/audit/audit.service.js';
import { PasswordHasher } from '../src/modules/auth/application/password-hasher.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const input = (n: string) => ({
  email: `director-${n}@autonova.test`,
  fullName: 'First Director',
  password: 'a sufficiently long passphrase',
});

describe('bootstrap first Director (real database)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let useCase: BootstrapDirectorUseCase;
  let hasher: PasswordHasher;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    useCase = app.get(BootstrapDirectorUseCase);
    hasher = app.get(PasswordHasher);
  });

  afterAll(async () => {
    await app.close();
  });

  // Users and audit rows cannot be deleted, so "no Director yet" is simulated by disabling
  // whatever Directors earlier tests created (a DISABLED Director does not count as active).
  beforeEach(async () => {
    await prisma.user.updateMany({
      where: { roles: { some: { role: { key: SystemRoleKey.Director } } } },
      data: { status: UserStatus.Disabled },
    });
  });

  it('creates an ACTIVE user holding the Director role, with a verifiable argon2id hash', async () => {
    const { userId } = await useCase.execute(input('ok'));
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    expect(user.status).toBe(UserStatus.Active);
    expect(user.roles.map((r) => r.role.key)).toEqual([SystemRoleKey.Director]);
    expect(user.passwordHash?.startsWith('$argon2id$')).toBe(true);
    expect(await hasher.verify(user.passwordHash ?? '', input('ok').password)).toBe(true);
  });

  it('writes a BUSINESS audit row with no secrets', async () => {
    const { userId } = await useCase.execute(input('audit'));
    const row = await prisma.auditLog.findFirstOrThrow({ where: { entityId: userId } });
    expect(row.action).toBe('user.bootstrap_director');
    expect(row.category).toBe('BUSINESS');
    expect(row.actorUserId).toBeNull();
    expect(row.newValues).toMatchObject({
      email: 'director-audit@autonova.test',
      role: 'director',
    });
    expect(JSON.stringify(row)).not.toMatch(/argon2|passphrase|password/i);
  });

  it('refuses when an active Director already exists, and creates nothing', async () => {
    await useCase.execute(input('first'));
    const before = await prisma.user.count();
    await expect(useCase.execute(input('second'))).rejects.toBeInstanceOf(
      DirectorAlreadyExistsError,
    );
    expect(await prisma.user.count()).toBe(before);
  });

  it('is race-safe: concurrent runs create exactly one Director', async () => {
    // Without help the transactions only partly overlap (starts are spread over ~20 ms and each
    // body takes about as long), so a missing lock would go unnoticed. Holding every transaction
    // open for 300 ms just before commit — after its "is there a Director?" check — guarantees
    // that all five have passed the check before the first commits.
    const precomputed = await hasher.hash(input('race').password);
    const hashSpy = vi.spyOn(hasher, 'hash').mockResolvedValue(precomputed);
    const audit = app.get(AuditService);
    const realRecord = audit.record.bind(audit);
    const auditSpy = vi.spyOn(audit, 'record').mockImplementation(async (db, event) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await realRecord(db, event);
    });
    let results: PromiseSettledResult<unknown>[];
    try {
      results = await Promise.allSettled(
        Array.from({ length: 5 }, (_, i) => useCase.execute(input(`race-${i}`))),
      );
    } finally {
      hashSpy.mockRestore();
      auditSpy.mockRestore();
    }
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected).toHaveLength(4);
    for (const r of rejected) expect(r.reason).toBeInstanceOf(DirectorAlreadyExistsError);
    expect(
      await prisma.user.count({
        where: {
          status: UserStatus.Active,
          roles: { some: { role: { key: SystemRoleKey.Director } } },
        },
      }),
    ).toBe(1);
  });

  it('refuses to take over an existing non-Director account with the same email', async () => {
    await prisma.user.create({ data: { email: 'existing@autonova.test', fullName: 'Existing' } });
    await expect(
      useCase.execute({ ...input('x'), email: 'existing@autonova.test' }),
    ).rejects.toBeInstanceOf(EmailAlreadyUsedError);
  });
});
