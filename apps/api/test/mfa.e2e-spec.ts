import { SystemRoleKey } from '@autonova/enums';
import { generate } from 'otplib';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { bearer, createApp, createUser, loginToken, requireRefreshToken } from './helpers.js';

describe('Director MFA (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createApp({ withProbe: true });
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  it('enrolls only after a valid code, verifies the session, and never exposes the secret in profile data', async () => {
    const director = await createUser(app, { roles: [SystemRoleKey.Director] });
    const token = await loginToken(app, director.email);
    expect((await http().get('/api/v1/test-probe').set(bearer(token))).status).toBe(403);
    const start = await http().post('/api/v1/auth/mfa/enrollment').set(bearer(token)).send();
    expect(start.status).toBe(201);
    expect(start.body.uri).toMatch(/^otpauth:\/\/totp\//);
    expect(start.body.secret).toBeTruthy();
    const stored = await prisma.userMfa.findUniqueOrThrow({ where: { userId: director.id } });
    expect(stored.secretCiphertext).not.toContain(start.body.secret);
    expect(stored.enrolledAt).toBeNull();

    const bad = await http()
      .post('/api/v1/auth/mfa/enrollment/confirm')
      .set(bearer(token))
      .send({ code: '000000' });
    expect([400, 401]).toContain(bad.status);
    expect(
      (await prisma.userMfa.findUniqueOrThrow({ where: { userId: director.id } })).enrolledAt,
    ).toBeNull();

    const code = await generate({ secret: start.body.secret });
    const confirmed = await http()
      .post('/api/v1/auth/mfa/enrollment/confirm')
      .set(bearer(token))
      .send({ code });
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.recoveryCodes).toHaveLength(10);
    expect((await http().get('/api/v1/test-probe').set(bearer(token))).status).toBe(200);
    const me = await http().get('/api/v1/auth/me').set(bearer(token));
    expect(me.body).toMatchObject({ mfa: { required: true, verified: true }, restricted: false });
    expect(JSON.stringify(me.body)).not.toContain(start.body.secret);
    expect(JSON.stringify(me.body)).not.toMatch(/recovery|secretCiphertext/i);
    const storedMfa = await prisma.userMfa.findUniqueOrThrow({ where: { userId: director.id } });
    expect(storedMfa.secretCiphertext).not.toContain(start.body.secret);
  });

  it('a recovery code is single-use and forces every session back to enrollment', async () => {
    const director = await createUser(app, { roles: [SystemRoleKey.Director] });
    const token = await loginToken(app, director.email);
    const { body: setup } = await http()
      .post('/api/v1/auth/mfa/enrollment')
      .set(bearer(token))
      .send();
    const code = await generate({ secret: setup.secret });
    const enabled = await http()
      .post('/api/v1/auth/mfa/enrollment/confirm')
      .set(bearer(token))
      .send({ code });
    const recovery = enabled.body.recoveryCodes[0] as string;

    const recovered = await http()
      .post('/api/v1/auth/mfa/recover')
      .set(bearer(token))
      .send({ code: recovery });
    expect(recovered.status).toBe(201);
    expect((await http().get('/api/v1/test-probe').set(bearer(token))).status).toBe(403);
    expect(
      (await prisma.userMfa.findUniqueOrThrow({ where: { userId: director.id } })).enrolledAt,
    ).toBeNull();
    const reused = await http()
      .post('/api/v1/auth/mfa/recover')
      .set(bearer(token))
      .send({ code: recovery });
    expect(reused.status).toBe(401);
  });

  it('refresh never upgrades a Director session and non-Directors cannot enroll MFA', async () => {
    const director = await createUser(app, { roles: [SystemRoleKey.Director] });
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: director.email, password: director.password });
    const cookie = `autonova_refresh=${requireRefreshToken(login)}`;
    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('origin', 'http://localhost:3000')
      .set('x-autonova-csrf', '1')
      .set('cookie', cookie)
      .send();
    const session = await prisma.session.findFirstOrThrow({ where: { userId: director.id } });
    expect(refreshed.status).toBe(200);
    expect(session.mfaVerifiedAt).toBeNull();
    const bd = await createUser(app, { roles: [SystemRoleKey.BusinessDevelopment] });
    const bdToken = await loginToken(app, bd.email);
    const denied = await http().post('/api/v1/auth/mfa/enrollment').set(bearer(bdToken)).send();
    expect(denied.status).toBe(403);
  });
});
