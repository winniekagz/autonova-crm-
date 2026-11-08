import { SystemRoleKey, UserStatus } from '@autonova/enums';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { EmailService } from '../src/modules/email/email.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  bearer,
  createApp,
  createUser,
  createVerifiedDirector,
  login,
  loginToken,
  uniqueEmail,
} from './helpers.js';

const NEW_PASSWORD = 'a fresh passphrase for the invite';

describe('invitations: set-up link, acceptance and resend (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  let adminToken: string;
  const http = () => request(app.getHttpServer());

  /** Every setup token the email service was asked to send, in order. The database keeps hashes only. */
  const sent: { email: string; token: string }[] = [];

  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
    vi.spyOn(app.get(EmailService), 'sendInvitation').mockImplementation(async (input) => {
      sent.push({ email: input.email, token: input.token });
    });
    adminToken = (await createVerifiedDirector(app)).token;
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await app.close();
  });
  afterEach(() => {
    sent.length = 0;
  });

  const invite = async () => {
    const email = uniqueEmail('invitee');
    const res = await http()
      .post('/api/v1/users')
      .set(bearer(adminToken))
      .send({ email, fullName: 'Invited Person', roles: [SystemRoleKey.Finance] });
    expect(res.status).toBe(201);
    const token = sent.at(-1)?.token;
    if (!token) throw new Error('no invitation token was captured');
    return { id: res.body.id as string, email, token };
  };
  const accept = (token: string, password = NEW_PASSWORD) =>
    http().post('/api/v1/auth/invitations/accept').send({ token, password });

  describe('accepting', () => {
    it('needs no sign-in: sets the password, activates the account, and returns nothing', async () => {
      const { id, email, token } = await invite();
      const res = await accept(token);
      expect(res.status).toBe(204);
      expect(res.text).toBe('');

      const user = await prisma.user.findUniqueOrThrow({ where: { id } });
      expect(user.status).toBe(UserStatus.Active);
      expect(user.passwordHash).toMatch(/^\$argon2id\$/);
      expect((await login(app, email, NEW_PASSWORD)).status).toBe(200);
    });

    it('the person cannot sign in before accepting, and the wrong password never works after', async () => {
      const { email, token } = await invite();
      expect((await login(app, email, NEW_PASSWORD)).status).toBe(401);
      await accept(token).expect(204);
      expect((await login(app, email, 'not the passphrase at all')).status).toBe(401);
    });

    it('a link works once: the second use is refused and changes nothing', async () => {
      const { id, email, token } = await invite();
      await accept(token).expect(204);
      const before = await prisma.user.findUniqueOrThrow({ where: { id } });

      const again = await accept(token, 'a different passphrase entirely');
      expect(again.status).toBe(400);
      expect(again.body.code).toBe('INVITATION_INVALID');
      const after = await prisma.user.findUniqueOrThrow({ where: { id } });
      expect(after.passwordHash).toBe(before.passwordHash);
      expect((await login(app, email, NEW_PASSWORD)).status).toBe(200);
    });

    it('of simultaneous attempts with one link, exactly one wins', async () => {
      const { id, token } = await invite();
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) => accept(token, `${NEW_PASSWORD} number ${i}`)),
      );
      expect(results.filter((r) => r.status === 204)).toHaveLength(1);
      expect(results.filter((r) => r.status === 400)).toHaveLength(5);
      expect((await prisma.user.findUniqueOrThrow({ where: { id } })).status).toBe(
        UserStatus.Active,
      );
    });

    it('refuses an unknown token, an expired one and one for a disabled account with the SAME answer', async () => {
      const unknown = await accept('A'.repeat(43));

      const expired = await invite();
      await prisma.$executeRaw`UPDATE user_invitations SET expires_at = now() - interval '1 minute' WHERE user_id = ${expired.id}::uuid`;
      const expiredRes = await accept(expired.token);

      const disabled = await invite();
      await prisma.user.update({
        where: { id: disabled.id },
        data: { status: UserStatus.Disabled },
      });
      const disabledRes = await accept(disabled.token);

      for (const res of [unknown, expiredRes, disabledRes]) {
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVITATION_INVALID');
      }
      expect(unknown.body.message).toBe(expiredRes.body.message);
      expect(unknown.body.message).toBe(disabledRes.body.message);
      // A disabled account is never revived by an old link.
      const row = await prisma.user.findUniqueOrThrow({ where: { id: disabled.id } });
      expect(row.status).toBe(UserStatus.Disabled);
      expect(row.passwordHash).toBeNull();
    });

    it.each([
      ['a malformed token', { token: 'short', password: NEW_PASSWORD }],
      ['a token with illegal characters', { token: `${'A'.repeat(42)}!`, password: NEW_PASSWORD }],
      ['a short password', { token: 'A'.repeat(43), password: 'short' }],
      ['a common password', { token: 'A'.repeat(43), password: 'password1234' }],
      ['an unknown field', { token: 'A'.repeat(43), password: NEW_PASSWORD, status: 'ACTIVE' }],
      ['no body', {}],
    ])('rejects %s as a validation error', async (_label, body) => {
      const res = await http().post('/api/v1/auth/invitations/accept').send(body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });

    it('does not let the caller choose who is activated or which roles they get', async () => {
      const { id, token } = await invite();
      const res = await http()
        .post('/api/v1/auth/invitations/accept')
        .send({ token, password: NEW_PASSWORD, userId: id, roles: [SystemRoleKey.Director] });
      expect(res.status).toBe(400);
      expect((await prisma.user.findUniqueOrThrow({ where: { id } })).status).toBe(
        UserStatus.Invited,
      );
    });
  });

  describe('what is stored and recorded', () => {
    it('keeps only a hash of the link token, never the token or the password', async () => {
      const { id, token } = await invite();
      await accept(token).expect(204);
      const rows = await prisma.userInvitation.findMany({ where: { userId: id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(rows)).not.toContain(token);
      expect(rows[0]?.acceptedAt).not.toBeNull();
    });

    it('audits sending and acceptance without the token, the password or the email address', async () => {
      const { id, email, token } = await invite();
      await accept(token).expect(204);
      const rows = await prisma.auditLog.findMany({
        where: {
          entityId: id,
          action: { in: ['user.invitation_sent', 'user.invitation_accepted'] },
        },
      });
      expect(rows.map((r) => r.action).sort()).toEqual([
        'user.invitation_accepted',
        'user.invitation_sent',
      ]);
      const dump = JSON.stringify(rows);
      for (const secret of [token, NEW_PASSWORD, email]) expect(dump).not.toContain(secret);
    });
  });

  describe('resending', () => {
    it('replaces the old link: the old one stops working and the new one works', async () => {
      const { id, token: first } = await invite();
      await http().post(`/api/v1/users/${id}/invitation`).set(bearer(adminToken)).expect(204);
      const second = sent.at(-1)?.token;
      expect(second).toBeDefined();
      expect(second).not.toBe(first);

      expect((await accept(first)).status).toBe(400);
      expect((await accept(second ?? '')).status).toBe(204);
    });

    it('is refused for an account that is no longer waiting for an invitation', async () => {
      const active = await createUser(app);
      const res = await http()
        .post(`/api/v1/users/${active.id}/invitation`)
        .set(bearer(adminToken));
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('INVITATION_NOT_AVAILABLE');
      expect(sent).toHaveLength(0);
    });

    it('needs users:create: anonymous is 401 and Business Development is 403', async () => {
      const { id } = await invite();
      await http().post(`/api/v1/users/${id}/invitation`).expect(401);

      const bd = await createUser(app, { roles: [SystemRoleKey.BusinessDevelopment] });
      // Sign in BEFORE building the request: supertest starts the shared server when a request is
      // created, and the sign-in request would close it again underneath the pending one.
      const bdToken = await loginToken(app, bd.email);
      const res = await http().post(`/api/v1/users/${id}/invitation`).set(bearer(bdToken));
      expect(res.status).toBe(403);
    });

    it('a failed email says so, and the account stays invited so it can be resent', async () => {
      vi.spyOn(app.get(EmailService), 'sendInvitation').mockRejectedValueOnce(
        new Error('smtp down: secret-host.internal'),
      );
      const email = uniqueEmail('mailfail');
      const res = await http()
        .post('/api/v1/users')
        .set(bearer(adminToken))
        .send({ email, fullName: 'Mail Fail', roles: [SystemRoleKey.Finance] });

      expect(res.status).toBe(503);
      expect(res.body.code).toBe('INVITATION_EMAIL_FAILED');
      expect(JSON.stringify(res.body)).not.toContain('secret-host.internal');
      const row = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(row.status).toBe(UserStatus.Invited);
    });
  });
});
