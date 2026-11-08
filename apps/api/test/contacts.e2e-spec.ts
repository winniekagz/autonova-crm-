import { SystemRoleKey } from '@autonova/enums';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { companyKit } from './companies-fixtures.js';
import { bearer, createApp } from './helpers.js';

describe('contacts (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  const { http, user, makeCompany, makeContact, makeLead } = companyKit(() => app);
  beforeAll(async () => {
    app = await createApp();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  describe('contacts', () => {
    it('supports several contacts per company, several decision-makers, and shared phone or email', async () => {
      const { token, user: bd } = await user();
      const owned = await makeCompany(token);
      const owner = await makeContact(token, owned.id, {
        name: 'Owner',
        jobTitle: 'CEO',
        isDecisionMaker: true,
        phone: '0712 345 678',
        email: 'Shared@Example.TEST',
      });
      await makeContact(token, owned.id, {
        name: 'Finance',
        isDecisionMaker: true,
        phone: '+254712345678',
        email: 'shared@example.test',
      });
      await makeContact(token, owned.id, { name: 'Manager', whatsappNumber: '+254 700 111222' });
      const list = await http().get(`/api/v1/companies/${owned.id}/contacts`).set(bearer(token));
      expect(list.body.total).toBe(3);
      expect(list.body.items.map((c: { name: string }) => c.name)).toEqual([
        'Finance',
        'Owner',
        'Manager',
      ]);
      expect(list.body.items.find((c: { name: string }) => c.name === 'Owner')).toMatchObject({
        email: 'shared@example.test',
        isDecisionMaker: true,
      });
      const detail = await http().get(`/api/v1/companies/${owned.id}`).set(bearer(token));
      expect(detail.body.contactCount).toBe(3);

      const audit = await prisma.auditLog.findFirst({
        where: { entityId: owner.id, action: 'contact.created' },
      });
      expect(audit?.actorUserId).toBe(bd.id);
      expect(JSON.stringify(audit?.newValues)).not.toContain('0712');
      expect(JSON.stringify(audit?.newValues)).not.toContain('example.test');
    });

    it('updates a contact, never moves it to another company, and audits the change', async () => {
      const { token } = await user();
      const one = await makeCompany(token);
      const other = await makeCompany(token);
      const contact = await makeContact(token, one.id, { name: 'Before' });
      const updated = await http()
        .patch(`/api/v1/contacts/${contact.id}`)
        .set(bearer(token))
        .send({ name: 'After', isDecisionMaker: true });
      expect(updated.body).toMatchObject({
        name: 'After',
        isDecisionMaker: true,
        companyId: one.id,
      });
      const move = await http()
        .patch(`/api/v1/contacts/${contact.id}`)
        .set(bearer(token))
        .send({ companyId: other.id });
      expect(move.status).toBe(400);
      await expect(
        prisma.contact.update({ where: { id: contact.id }, data: { companyId: other.id } }),
      ).rejects.toThrow();
      const audit = await prisma.auditLog.findMany({
        where: { entityId: contact.id },
        orderBy: { occurredAt: 'asc' },
      });
      expect(audit.map((row) => row.action)).toEqual(['contact.created', 'contact.updated']);
      expect(audit[1]?.oldValues).toMatchObject({ name: 'Before', isDecisionMaker: false });
      expect(audit[1]?.newValues).toMatchObject({ name: 'After', isDecisionMaker: true });
    });

    it('validates a contact and refuses one for a missing or archived company', async () => {
      const { token } = await user();
      const owned = await makeCompany(token);
      const bad = await http()
        .post(`/api/v1/companies/${owned.id}/contacts`)
        .set(bearer(token))
        .send({ name: '', email: 'nope' });
      expect(bad.status).toBe(400);
      expect(bad.body.details.map((d: { path: string }) => d.path)).toEqual(
        expect.arrayContaining(['name', 'email', 'isDecisionMaker']),
      );
      const director = await user(SystemRoleKey.Director);
      await http()
        .post(`/api/v1/companies/${owned.id}/archive`)
        .set(bearer(director.token))
        .send({})
        .expect(200);
      const archived = await http()
        .post(`/api/v1/companies/${owned.id}/contacts`)
        .set(bearer(token))
        .send({ name: 'Late', isDecisionMaker: false });
      expect(archived.status).toBe(409);
      expect(archived.body.code).toBe('COMPANY_ARCHIVED');
    });

    it('archives and restores a contact, but not while a lead still uses it', async () => {
      const director = await user(SystemRoleKey.Director);
      const owned = await makeCompany(director.token);
      const used = await makeContact(director.token, owned.id);
      const free = await makeContact(director.token, owned.id);
      const lead = await makeLead(director.token, {
        companyId: owned.id,
        primaryContactId: used.id,
      });
      const blocked = await http()
        .post(`/api/v1/contacts/${used.id}/archive`)
        .set(bearer(director.token))
        .send({});
      expect(blocked.status).toBe(409);
      expect(blocked.body.code).toBe('CONTACT_IN_USE');
      const archived = await http()
        .post(`/api/v1/contacts/${free.id}/archive`)
        .set(bearer(director.token))
        .send({ reason: 'Left the company' });
      expect(archived.body.archived).toBe(true);
      expect(
        (await http().get(`/api/v1/companies/${owned.id}/contacts`).set(bearer(director.token)))
          .body.total,
      ).toBe(1);
      expect(
        (
          await http()
            .get(`/api/v1/companies/${owned.id}/contacts?includeArchived=true`)
            .set(bearer(director.token))
        ).body.total,
      ).toBe(2);
      expect(
        (
          await http()
            .patch(`/api/v1/contacts/${free.id}`)
            .set(bearer(director.token))
            .send({ name: 'x' })
        ).body.code,
      ).toBe('CONTACT_ARCHIVED');
      expect(
        (
          await http()
            .post(`/api/v1/contacts/${free.id}/restore`)
            .set(bearer(director.token))
            .send({})
        ).body.archived,
      ).toBe(false);
      const audit = await prisma.auditLog.findFirst({
        where: { entityId: free.id, action: 'contact.archived' },
      });
      expect(audit?.reason).toBe('Left the company');
      expect(lead.id).toBeTruthy();
    });
  });
});
