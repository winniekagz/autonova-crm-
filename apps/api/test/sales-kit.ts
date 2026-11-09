import type { NestExpressApplication } from '@nestjs/platform-express';
import { bearer } from './helpers.js';
import { companyKit } from './companies-fixtures.js';

export const FULL = {
  budget: 'FULLY_MET',
  authority: 'FULLY_MET',
  need: 'FULLY_MET',
  timeline: 'FULLY_MET',
};
export const NONE = {
  budget: 'NOT_MET',
  authority: 'NOT_MET',
  need: 'NOT_MET',
  timeline: 'NOT_MET',
};

/** Builders for the commercial workflow e2e suites: a lead taken to a stage, and a valid ToR body. */
export function salesKit(getApp: () => NestExpressApplication) {
  const kit = companyKit(getApp);
  const { http, user, makeLead } = kit;

  const move = (token: string, id: string, fromStage: string, toStage: string) =>
    http().post(`/api/v1/leads/${id}/transitions`).set(bearer(token)).send({ fromStage, toStage });

  /** A lead in Visits and calls, owned by a fresh BD user. */
  const visitsLead = async () => {
    const owner = await user();
    const company = await kit.makeCompany(owner.token);
    const lead = await makeLead(owner.token, { companyId: company.id });
    await move(owner.token, lead.id, 'NEW_LEAD', 'VISITS_AND_CALLS').expect(200);
    return { owner, lead };
  };

  const qualify = async (token: string, id: string, ratings: object = FULL) => {
    await http()
      .post(`/api/v1/leads/${id}/qualification`)
      .set(bearer(token))
      .send(ratings)
      .expect(201);
    return http()
      .post(`/api/v1/leads/${id}/qualify`)
      .set(bearer(token))
      .send({ fromStage: 'VISITS_AND_CALLS' });
  };

  const qualifiedLead = async () => {
    const ctx = await visitsLead();
    const response = await qualify(ctx.owner.token, ctx.lead.id);
    if (response.status !== 200) throw new Error(`qualify failed with ${response.status}`);
    return ctx;
  };

  const torBody = (over: Record<string, unknown> = {}) => ({
    currency: 'KES',
    setupFee: '100000.00',
    discountType: 'NONE',
    discountValue: '0',
    hostingName: 'Standard plan',
    hostingDescription: 'Hosting, backups and support',
    hostingCycle: 'MONTHLY',
    hostingAmount: '5000.00',
    paymentTerms: '50% deposit, balance on go-live',
    vatTreatment: 'APPLIED',
    changeSummary: 'First draft',
    scopeItems: [
      {
        name: 'Point of sale',
        description: 'Tills and receipts',
        inScope: true,
        estimateDays: '10',
        price: '40000.00',
      },
      { name: 'Loyalty programme', inScope: false, estimateDays: '3', price: '0' },
    ],
    addons: [
      { kind: 'TRAINING_DAYS', description: 'Staff training', quantity: '2', unitPrice: '7500.00' },
    ],
    milestones: [
      { kind: 'REQUIREMENTS_SIGN_OFF', name: 'Requirements sign-off', targetDate: '2026-12-01' },
      { kind: 'GO_LIVE', name: 'Go live', targetDate: '2027-01-15' },
    ],
    ...over,
  });

  const torUrl = (leadId: string) => `/api/v1/leads/${leadId}/tor`;

  const createTor = (token: string, leadId: string, over: Record<string, unknown> = {}) =>
    http().post(torUrl(leadId)).set(bearer(token)).send(torBody(over));

  const sign = (
    token: string,
    leadId: string,
    versionNo: number,
    party: 'CLIENT' | 'AUTONOVA',
    name = 'Signer',
  ) =>
    http()
      .post(`${torUrl(leadId)}/versions/${versionNo}/sign`)
      .set(bearer(token))
      .send({ party, signerName: name });

  return { ...kit, move, visitsLead, qualify, qualifiedLead, torBody, torUrl, createTor, sign };
}
