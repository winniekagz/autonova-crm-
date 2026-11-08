import type { CompanyDto, ContactDto, MeResponse } from '@autonova/contracts';
import { DIRECTOR } from '@/test/render';

/** Business Development: sees and edits companies in their scope, but cannot archive. */
export const BD_COMPANIES: MeResponse = {
  ...DIRECTOR,
  roles: ['business_development'],
  permissions: [
    'companies:list',
    'companies:read',
    'companies:create',
    'companies:update',
    'leads:list',
    'leads:read',
    'leads:create',
    'leads:update',
  ],
};
export const DIRECTOR_COMPANIES: MeResponse = {
  ...DIRECTOR,
  permissions: [...BD_COMPANIES.permissions, 'companies:archive'],
};
export const NO_COMPANY_ACCESS: MeResponse = { ...DIRECTOR, roles: ['finance'], permissions: [] };

export const makeCompany = (over: Partial<CompanyDto> = {}): CompanyDto => ({
  id: 'co-1',
  name: 'Otieno Logistics',
  kraPin: 'A123456789B',
  location: 'Westlands, Nairobi',
  industry: 'LOGISTICS',
  staffCount: 40,
  branchCount: 3,
  website: 'https://otieno.test',
  socialLinks: ['https://linkedin.test/otieno'],
  archived: false,
  createdByName: 'Dee Director',
  createdAt: '2026-11-01T08:00:00.000Z',
  updatedAt: '2026-11-01T08:00:00.000Z',
  contactCount: 2,
  leadCount: 1,
  ...over,
});

export const makeContact = (over: Partial<ContactDto> = {}): ContactDto => ({
  id: 'ct-1',
  companyId: 'co-1',
  name: 'Achieng Otieno',
  jobTitle: 'CEO',
  phone: '0712 345 678',
  email: 'achieng@otieno.test',
  whatsappNumber: null,
  isDecisionMaker: true,
  archived: false,
  createdAt: '2026-11-01T08:00:00.000Z',
  updatedAt: '2026-11-01T08:00:00.000Z',
  ...over,
});

export const pageOf = (items: readonly object[], total = items.length) => ({
  body: { items, page: 1, pageSize: 20, total },
});

export const NO_DUPLICATES = { body: { exact: [], potential: [], hiddenMatchCount: 0 } };
