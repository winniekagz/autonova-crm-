import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, uniqueEmail } from './helpers.js';

// Throttling is disabled in the other suites (they log in dozens of times from one address).
// This suite turns it on, before the application module is created.
describe('login rate limiting (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    process.env.THROTTLE_IN_TESTS = 'true';
    app = await createApp();
  });
  afterAll(async () => {
    await app.close();
    delete process.env.THROTTLE_IN_TESTS;
  });

  it('answers 429 RATE_LIMITED in the standard envelope once the login limit is exceeded', async () => {
    const attempt = () =>
      request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: uniqueEmail('brute'), password: 'wrong password entirely' });

    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await attempt()).status);

    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);

    const limited = await attempt();
    expect(limited.body).toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });
    expect(limited.body.requestId).toBeTruthy();
  });
});
