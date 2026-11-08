import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './helpers.js';

type Operation = {
  tags?: string[];
  summary?: string;
  security?: unknown[];
  responses?: Record<string, { description?: string; content?: Record<string, unknown> }>;
  requestBody?: unknown;
};
type Doc = {
  paths: Record<string, Record<string, Operation>>;
  components?: { schemas?: Record<string, unknown> };
};

/** Public by design: the document must say so by NOT asking for a bearer token. */
const PUBLIC_OPERATIONS = new Set([
  'GET /api/v1/health',
  'GET /api/v1/health/live',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/refresh',
  'POST /api/v1/auth/invitations/accept',
]);

describe('OpenAPI document (Swagger)', () => {
  let app: NestExpressApplication;
  let doc: Doc;
  const operations = () =>
    Object.entries(doc.paths).flatMap(([path, methods]) =>
      Object.entries(methods).map(([method, operation]) => ({
        key: `${method.toUpperCase()} ${path}`,
        operation,
      })),
    );

  beforeAll(async () => {
    app = await createApp();
    doc = (await request(app.getHttpServer()).get('/api/docs-json').expect(200)).body;
  });
  afterAll(async () => {
    await app.close();
  });

  it('documents every route the API exposes, including refresh, sessions and invitations', () => {
    const keys = operations().map((o) => o.key);
    for (const expected of [
      'POST /api/v1/auth/login',
      'POST /api/v1/auth/refresh',
      'GET /api/v1/auth/sessions',
      'DELETE /api/v1/auth/sessions/{sessionId}',
      'POST /api/v1/auth/invitations/accept',
      'POST /api/v1/users/{id}/invitation',
      'GET /api/v1/auth/mfa/status',
    ]) {
      expect(keys).toContain(expected);
    }
  });

  it('every operation has a summary and a tag', () => {
    for (const { key, operation } of operations()) {
      expect(operation.summary, key).toBeTruthy();
      expect(operation.tags?.length, key).toBeGreaterThan(0);
    }
  });

  it('asks for a bearer token on every operation except the deliberately public ones', () => {
    for (const { key, operation } of operations()) {
      const asksForToken = (operation.security ?? []).length > 0;
      expect(asksForToken, key).toBe(!PUBLIC_OPERATIONS.has(key));
    }
  });

  it('every private operation documents its sign-in (401) and permission (403) failures', () => {
    for (const { key, operation } of operations()) {
      if (PUBLIC_OPERATIONS.has(key)) continue;
      const codes = Object.keys(operation.responses ?? {});
      expect(codes, key).toContain('401');
      expect(codes, key).toContain('403');
    }
  });

  it('every operation that takes input documents the 400 validation failure', () => {
    for (const { key, operation } of operations()) {
      const takesInput = key.includes('{') || operation.requestBody !== undefined;
      if (!takesInput) continue;
      expect(Object.keys(operation.responses ?? {}), key).toContain('400');
    }
  });

  it('lists the stable error codes an operation can return, not just a status', () => {
    const login = doc.paths['/api/v1/auth/login']?.post;
    expect(login?.responses?.['401']?.description).toContain('INVALID_CREDENTIALS');
    const refresh = doc.paths['/api/v1/auth/refresh']?.post;
    expect(refresh?.responses?.['401']?.description).toContain('REFRESH_TOKEN_INVALID');
    expect(refresh?.responses?.['403']?.description).toContain('CSRF_REJECTED');
    const accept = doc.paths['/api/v1/auth/invitations/accept']?.post;
    expect(accept?.responses?.['400']?.description).toContain('INVITATION_INVALID');
    const disable = doc.paths['/api/v1/users/{id}/disable']?.post;
    expect(disable?.responses?.['422']?.description).toContain('LAST_DIRECTOR');
  });

  it('describes the error envelope with exactly the fields the API returns', () => {
    const content = doc.paths['/api/v1/auth/login']?.post?.responses?.['401']?.content;
    const schema = content?.['application/json'] as
      { schema: { properties: Record<string, unknown>; required: string[] } } | undefined;
    if (!schema) throw new Error('login 401 has no documented body');
    expect(Object.keys(schema.schema.properties).sort()).toEqual(
      ['code', 'details', 'message', 'path', 'requestId', 'statusCode', 'timestamp'].sort(),
    );
    expect(schema.schema.required).not.toContain('details');
  });

  it('documents successful responses with a shape, so clients are not left guessing', () => {
    const shaped = (path: string, method: string, status: string) =>
      doc.paths[path]?.[method]?.responses?.[status]?.content?.['application/json'];
    expect(shaped('/api/v1/auth/login', 'post', '200')).toBeDefined();
    expect(shaped('/api/v1/auth/refresh', 'post', '200')).toBeDefined();
    expect(shaped('/api/v1/auth/me', 'get', '200')).toBeDefined();
    expect(shaped('/api/v1/auth/sessions', 'get', '200')).toBeDefined();
    expect(shaped('/api/v1/users', 'get', '200')).toBeDefined();
    expect(shaped('/api/v1/users/{id}', 'get', '200')).toBeDefined();
    expect(shaped('/api/v1/roles', 'get', '200')).toBeDefined();
  });

  it('never advertises a credential field in any response schema it describes', () => {
    const dump = JSON.stringify(operations().map(({ operation }) => operation.responses));
    expect(dump).not.toMatch(/passwordHash|password_hash|tokenHash|token_hash|refreshToken/);
  });

  it('has no dangling schema references', () => {
    const text = JSON.stringify(doc);
    const names = new Set(Object.keys(doc.components?.schemas ?? {}));
    for (const [, name] of text.matchAll(/#\/components\/schemas\/([A-Za-z0-9_.-]+)/g)) {
      expect(names.has(name ?? ''), `schema ${name}`).toBe(true);
    }
  });

  it('explains the shared error contract and the invitation steps in the overview', async () => {
    const description = (doc as unknown as { info: { description: string } }).info.description;
    expect(description).toContain('## Errors');
    expect(description).toContain('requestId');
    expect(description).toContain('/auth/invitations/accept');
  });
});
