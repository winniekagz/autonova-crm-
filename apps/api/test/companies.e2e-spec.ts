import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { companyKit } from './companies-fixtures.js';
import { bearer, createApp } from './helpers.js';

describe('companies (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const { http, tag, pin, user, company, makeCompany } = companyKit(() => app);
  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  describe('companies', () => {
    it('creates, reads, updates and audits a company with typed fields', async () => {
      const { token, user: bd } = await user();
      const created = await http()
        .post('/api/v1/companies')
        .set(bearer(token))
        .send(
          company({
            kraPin: ' a123456789b ',
            location: 'Westlands, Nairobi',
            industry: 'RETAIL',
            staffCount: 40,
            branchCount: 3,
            website: 'https://example.test',
            socialLinks: ['https://linkedin.test/c/x', 'https://linkedin.test/c/x'],
          }),
        );
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        kraPin: 'A123456789B',
        industry: 'RETAIL',
        staffCount: 40,
        branchCount: 3,
        socialLinks: ['https://linkedin.test/c/x'],
        archived: false,
        contactCount: 0,
        leadCount: 0,
      });
      expect(Object.keys(created.body)).not.toContain('nameNormalized');
      expect(Object.keys(created.body)).not.toContain('createdByUserId');

      const updated = await http()
        .patch(`/api/v1/companies/${created.body.id}`)
        .set(bearer(token))
        .send({ location: 'Karen', staffCount: 55 });
      expect(updated.status).toBe(200);
      expect(updated.body).toMatchObject({
        location: 'Karen',
        staffCount: 55,
        name: created.body.name,
      });

      const audit = await prisma.auditLog.findMany({
        where: { entityType: 'company', entityId: created.body.id },
        orderBy: { occurredAt: 'asc' },
      });
      expect(audit.map((row) => row.action)).toEqual(['company.created', 'company.updated']);
      expect(audit[1]?.actorUserId).toBe(bd.id);
      expect(audit[1]?.oldValues).toEqual({ location: 'Westlands, Nairobi', staffCount: 40 });
      expect(audit[1]?.newValues).toEqual({ location: 'Karen', staffCount: 55 });
    });

    it('rejects invalid input with field-level errors', async () => {
      const { token } = await user();
      const res = await http()
        .post('/api/v1/companies')
        .set(bearer(token))
        .send({ name: '', kraPin: '12345', staffCount: -2, website: 'ftp://x', industry: 'Shops' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      const paths = res.body.details.map((d: { path: string }) => d.path);
      expect(paths).toEqual(
        expect.arrayContaining(['name', 'kraPin', 'staffCount', 'website', 'industry']),
      );
      const stray = await http()
        .post('/api/v1/companies')
        .set(bearer(token))
        .send(company({ createdByUserId: 'x' }));
      expect(stray.status).toBe(400);
    });

    it('refuses a second live company with the same KRA PIN, even when acknowledged, and in the database', async () => {
      const { token } = await user();
      const kraPin = pin();
      const first = await makeCompany(token, { kraPin });
      const clash = await http()
        .post('/api/v1/companies')
        .set(bearer(token))
        .send(company({ kraPin: kraPin.toLowerCase(), acknowledgeDuplicates: true }));
      expect(clash.status).toBe(409);
      expect(clash.body.code).toBe('COMPANY_KRA_PIN_EXISTS');
      const check = await http()
        .post('/api/v1/companies/duplicate-check')
        .set(bearer(token))
        .send({ kraPin });
      expect(check.body.exact).toEqual([
        expect.objectContaining({ id: first.id, matchedOn: ['KRA_PIN'] }),
      ]);
      await expect(
        prisma.company.create({
          data: {
            name: 'Raw twin',
            nameNormalized: 'raw twin',
            kraPin,
            createdByUserId: (await prisma.company.findUniqueOrThrow({ where: { id: first.id } }))
              .createdByUserId,
            updatedByUserId: (await prisma.company.findUniqueOrThrow({ where: { id: first.id } }))
              .createdByUserId,
          },
        }),
      ).rejects.toThrow();
    });

    it('warns about a similar name until acknowledged, then saves a separate company', async () => {
      const { token } = await user();
      const base = `Zeta ${tag()}`;
      const first = await makeCompany(token, { name: `${base} Limited` });
      const warned = await http()
        .post('/api/v1/companies')
        .set(bearer(token))
        .send({ name: `  ${base.toUpperCase()} ltd. ` });
      expect(warned.status).toBe(409);
      expect(warned.body.code).toBe('COMPANY_DUPLICATE_SUSPECTED');
      const check = await http()
        .post('/api/v1/companies/duplicate-check')
        .set(bearer(token))
        .send({ name: `${base} LTD` });
      expect(check.body.potential).toEqual([
        expect.objectContaining({ id: first.id, matchedOn: ['NAME'] }),
      ]);
      expect(check.body.exact).toEqual([]);
      const saved = await http()
        .post('/api/v1/companies')
        .set(bearer(token))
        .send({ name: `${base} Ltd`, acknowledgeDuplicates: true });
      expect(saved.status).toBe(201);
      expect(saved.body.id).not.toBe(first.id);
      const audit = await prisma.auditLog.findFirst({
        where: { entityId: saved.body.id, action: 'company.created' },
      });
      expect(audit?.newValues).toMatchObject({ duplicateAcknowledged: true });
    });

    it('checks duplicates on edit only when the name or PIN actually changes', async () => {
      const { token } = await user();
      const base = `Twin ${tag()}`;
      const a = await makeCompany(token, { name: base });
      await http()
        .post('/api/v1/companies')
        .set(bearer(token))
        .send({ name: `${base} Ltd`, acknowledgeDuplicates: true });
      const keep = await http()
        .patch(`/api/v1/companies/${a.id}`)
        .set(bearer(token))
        .send({ name: base, location: 'Mombasa' });
      expect(keep.status).toBe(200);
      const b = await makeCompany(token);
      const clash = await http()
        .patch(`/api/v1/companies/${b.id}`)
        .set(bearer(token))
        .send({ name: `${base} Limited` });
      expect(clash.status).toBe(409);
      const self = await http()
        .post('/api/v1/companies/duplicate-check')
        .set(bearer(token))
        .send({ name: base, excludeCompanyId: a.id });
      expect(self.body.potential.map((c: { id: string }) => c.id)).not.toContain(a.id);
    });

    it('lists with pagination, search, industry filter and a stable A-Z order', async () => {
      const { token } = await user();
      const stem = `Lister${tag()}`;
      for (const [i, industry] of ['RETAIL', 'RETAIL', 'LOGISTICS'].entries()) {
        await makeCompany(token, { name: `${stem} ${String.fromCharCode(67 - i)}`, industry });
      }
      const page1 = await http().get(`/api/v1/companies?q=${stem}&pageSize=2`).set(bearer(token));
      expect(page1.body.total).toBe(3);
      expect(page1.body.items.map((c: { name: string }) => c.name)).toEqual([
        `${stem} A`,
        `${stem} B`,
      ]);
      const page2 = await http()
        .get(`/api/v1/companies?q=${stem}&pageSize=2&page=2`)
        .set(bearer(token));
      expect(page2.body.items.map((c: { name: string }) => c.name)).toEqual([`${stem} C`]);
      const retail = await http()
        .get(`/api/v1/companies?q=${stem}&industry=RETAIL`)
        .set(bearer(token));
      expect(retail.body.total).toBe(2);
      expect((await http().get('/api/v1/companies?pageSize=101').set(bearer(token))).status).toBe(
        400,
      );
      expect((await http().get('/api/v1/companies?industry=Shops').set(bearer(token))).status).toBe(
        400,
      );
    });

    it('finds a company by exact KRA PIN or by name ignoring punctuation and suffix', async () => {
      const { token } = await user();
      const kraPin = pin();
      const stem = `Findme${tag()}`;
      const created = await makeCompany(token, { name: `${stem} Holdings Ltd`, kraPin });
      for (const q of [kraPin.toLowerCase(), `${stem.toUpperCase()}   holdings`]) {
        const res = await http()
          .get(`/api/v1/companies?q=${encodeURIComponent(q)}`)
          .set(bearer(token));
        expect(
          res.body.items.map((c: { id: string }) => c.id),
          q,
        ).toContain(created.id);
      }
    });
  });
});
