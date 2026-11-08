import { SystemRoleKey } from '@autonova/enums';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { bearer, createUser, loginToken, loginVerifiedToken } from './helpers.js';

/** Builders shared by the companies, contacts and lead-relationship e2e suites. */
export function companyKit(getApp: () => NestExpressApplication) {
  const http = () => request(getApp().getHttpServer());
  let n = 0;
  const tag = () => `${Date.now().toString(36)}${(n += 1)}`;
  const pin = () =>
    `K${String(100_000_000 + n * 13 + Math.floor(Math.random() * 1000)).slice(0, 9)}Z`;
  const user = async (role: SystemRoleKey = SystemRoleKey.BusinessDevelopment) => {
    const created = await createUser(getApp(), { roles: [role] });
    const token =
      role === SystemRoleKey.Director
        ? await loginVerifiedToken(getApp(), created.email)
        : await loginToken(getApp(), created.email);
    return { user: created, token };
  };
  const company = (over: Record<string, unknown> = {}) => ({ name: `Company ${tag()}`, ...over });
  const makeCompany = async (token: string, over: Record<string, unknown> = {}) => {
    const res = await http().post('/api/v1/companies').set(bearer(token)).send(company(over));
    if (res.status !== 201)
      throw new Error(`company create failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body as { id: string; name: string };
  };
  const makeContact = async (
    token: string,
    companyId: string,
    over: Record<string, unknown> = {},
  ) => {
    const res = await http()
      .post(`/api/v1/companies/${companyId}/contacts`)
      .set(bearer(token))
      .send({ name: `Contact ${tag()}`, isDecisionMaker: false, ...over });
    if (res.status !== 201)
      throw new Error(`contact create failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body as { id: string };
  };
  const makeLead = async (token: string, over: Record<string, unknown> = {}) => {
    const res = await http()
      .post('/api/v1/leads')
      .set(bearer(token))
      .send({
        name: `Lead ${tag()}`,
        source: 'WEBSITE',
        currency: 'KES',
        nextAction: 'Call',
        nextActionAt: '2030-01-01T08:00:00.000Z',
        ...over,
      });
    if (res.status !== 201)
      throw new Error(`lead create failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body as { id: string };
  };
  return { http, tag, pin, user, company, makeCompany, makeContact, makeLead };
}
