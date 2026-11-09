import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { companyKit } from './companies-fixtures.js';
import { bearer, createApp } from './helpers.js';

describe('contact roles (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const { http, user, makeCompany, makeContact } = companyKit(() => app);
  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  it('holds an owner, a manager and a finance contact in one company, each with a role', async () => {
    const { token } = await user();
    const company = await makeCompany(token);
    await makeContact(token, company.id, { name: 'Owner One', role: 'OWNER' });
    await makeContact(token, company.id, { name: 'Manager Two', role: 'MANAGER' });
    await makeContact(token, company.id, { name: 'Finance Three', role: 'FINANCE' });
    await makeContact(token, company.id, { name: 'No Role Four' });
    const list = await http().get(`/api/v1/companies/${company.id}/contacts`).set(bearer(token));
    expect(list.status).toBe(200);
    const roles = Object.fromEntries(
      list.body.items.map((c: { name: string; role: string | null }) => [c.name, c.role]),
    );
    expect(roles).toEqual({
      'Owner One': 'OWNER',
      'Manager Two': 'MANAGER',
      'Finance Three': 'FINANCE',
      'No Role Four': null,
    });
  });

  it('rejects an unknown role with a field error', async () => {
    const { token } = await user();
    const company = await makeCompany(token);
    const res = await http()
      .post(`/api/v1/companies/${company.id}/contacts`)
      .set(bearer(token))
      .send({ name: 'Bad', isDecisionMaker: false, role: 'CEO' });
    expect(res.status).toBe(400);
    expect(res.body.details.map((d: { path: string }) => d.path)).toContain('role');
  });

  it('changes and clears a role on update, and records it in the audit trail', async () => {
    const { token } = await user();
    const company = await makeCompany(token);
    const contact = await makeContact(token, company.id, { name: 'Rolling', role: 'MANAGER' });
    const changed = await http()
      .patch(`/api/v1/contacts/${contact.id}`)
      .set(bearer(token))
      .send({ role: 'FINANCE' });
    expect(changed.body.role).toBe('FINANCE');
    const untouched = await http()
      .patch(`/api/v1/contacts/${contact.id}`)
      .set(bearer(token))
      .send({ jobTitle: 'Accountant' });
    expect(untouched.body).toMatchObject({ role: 'FINANCE', jobTitle: 'Accountant' });
    const cleared = await http()
      .patch(`/api/v1/contacts/${contact.id}`)
      .set(bearer(token))
      .send({ role: null });
    expect(cleared.body.role).toBeNull();
    const audit = await prisma.auditLog.findMany({
      where: { entityId: contact.id, action: 'contact.updated' },
      orderBy: { occurredAt: 'asc' },
    });
    expect(audit[0]?.oldValues).toMatchObject({ role: 'MANAGER' });
    expect(audit[0]?.newValues).toMatchObject({ role: 'FINANCE' });
  });

  it('keeps contacts created before roles existed valid, with no role', async () => {
    const { token } = await user();
    const company = await makeCompany(token);
    const contact = await makeContact(token, company.id, { name: 'Legacy' });
    const row = await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } });
    expect(row.role).toBeNull();
  });
});
