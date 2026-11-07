import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

describe('API foundation (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health/live → 200', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/live').expect(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /api/v1/health → 200 with database up', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.details.database.status).toBe('up');
  });

  it('echoes a supplied x-request-id and generates one otherwise', async () => {
    const supplied = await request(app.getHttpServer())
      .get('/api/v1/health/live')
      .set('x-request-id', 'trace-123');
    expect(supplied.headers['x-request-id']).toBe('trace-123');
    const generated = await request(app.getHttpServer()).get('/api/v1/health/live');
    expect(generated.headers['x-request-id']).toMatch(/[0-9a-f-]{36}/);
  });

  it('unknown routes return the standard error envelope', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);
    expect(res.body).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
  });

  it('sets security headers', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health/live');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('serves the OpenAPI document and Swagger UI', async () => {
    const doc = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(doc.body.info.title).toBe('Autonova CRM API');
    expect(Object.keys(doc.body.paths)).toContain('/api/v1/health');
    await request(app.getHttpServer()).get('/api/docs').expect(200);
  });
});
