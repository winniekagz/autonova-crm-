import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  ApiErrors,
  RATE_LIMITED_ERROR,
  VALIDATION_ERROR,
  privateErrors,
  type DocumentedError,
  type SchemaObject,
} from '../../../common/api-docs.js';

/**
 * Swagger documentation for companies and contacts, kept out of the controller so it stays a thin
 * translation layer. Business rules live in `domain/` and `application/`.
 */
const INDUSTRIES = [
  'RETAIL',
  'HOSPITALITY',
  'AUTOMOTIVE',
  'MANUFACTURING',
  'LOGISTICS',
  'EDUCATION',
  'HEALTHCARE',
  'FINANCE',
  'AGRICULTURE',
  'REAL_ESTATE',
  'TECHNOLOGY',
  'GOVERNMENT',
  'OTHER',
];
const STAGES = [
  'NEW_LEAD',
  'VISITS_AND_CALLS',
  'QUALIFIED',
  'SCOPE_ALIGNMENT',
  'TOR_QUOTE_SENT',
  'DISQUALIFIED',
  'WON',
  'LOST',
];

export const companyBodySchema: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['name'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 200, example: 'Northstar Clinic' },
    kraPin: {
      type: 'string',
      example: 'A123456789B',
      description: 'Letter, nine digits, letter. A KRA PIN identifies one live company.',
    },
    location: { type: 'string', maxLength: 300 },
    industry: { type: 'string', nullable: true, enum: [...INDUSTRIES, null] },
    staffCount: { type: 'integer', nullable: true, minimum: 0, maximum: 1000000 },
    branchCount: { type: 'integer', nullable: true, minimum: 0, maximum: 10000 },
    website: { type: 'string', format: 'uri', maxLength: 300 },
    socialLinks: { type: 'array', maxItems: 10, items: { type: 'string', format: 'uri' } },
    acknowledgeDuplicates: {
      type: 'boolean',
      description:
        'Send true after reviewing a 409 COMPANY_DUPLICATE_SUSPECTED. Never bypasses a KRA PIN match.',
    },
  },
};

const companySchema: SchemaObject = {
  type: 'object',
  required: [
    'id',
    'name',
    'kraPin',
    'location',
    'industry',
    'staffCount',
    'branchCount',
    'website',
    'socialLinks',
    'archived',
    'createdByName',
    'createdAt',
    'updatedAt',
    'contactCount',
    'leadCount',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    kraPin: { type: 'string', nullable: true },
    location: { type: 'string', nullable: true },
    industry: { type: 'string', nullable: true, enum: [...INDUSTRIES, null] },
    staffCount: { type: 'integer', nullable: true },
    branchCount: { type: 'integer', nullable: true },
    website: { type: 'string', nullable: true },
    socialLinks: { type: 'array', items: { type: 'string' } },
    archived: { type: 'boolean' },
    createdByName: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    contactCount: { type: 'integer', description: 'Active contacts.' },
    leadCount: {
      type: 'integer',
      description: 'Leads the caller may see: Directors all, others their own.',
    },
  },
};

const contactSchema: SchemaObject = {
  type: 'object',
  required: [
    'id',
    'companyId',
    'name',
    'jobTitle',
    'phone',
    'email',
    'whatsappNumber',
    'isDecisionMaker',
    'archived',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    companyId: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    jobTitle: { type: 'string', nullable: true },
    phone: { type: 'string', nullable: true },
    email: { type: 'string', format: 'email', nullable: true },
    whatsappNumber: { type: 'string', nullable: true },
    isDecisionMaker: { type: 'boolean' },
    archived: { type: 'boolean' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const companyLeadSchema: SchemaObject = {
  type: 'object',
  required: ['id', 'name', 'stage', 'ownerName', 'estimatedValue', 'currency', 'nextActionAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    stage: { type: 'string', enum: STAGES },
    ownerName: { type: 'string' },
    estimatedValue: { type: 'string', nullable: true },
    currency: { type: 'string', enum: ['KES', 'USD'] },
    nextActionAt: { type: 'string', format: 'date-time' },
  },
};

const candidateSchema: SchemaObject = {
  type: 'object',
  required: ['id', 'name', 'kraPin', 'location', 'archived', 'matchedOn'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string' },
    kraPin: { type: 'string', nullable: true },
    location: { type: 'string', nullable: true },
    archived: { type: 'boolean' },
    matchedOn: { type: 'array', items: { type: 'string', enum: ['KRA_PIN', 'NAME'] } },
  },
};

const pageOf = (item: SchemaObject): SchemaObject => ({
  type: 'object',
  required: ['items', 'total', 'page', 'pageSize'],
  properties: {
    items: { type: 'array', items: item },
    total: { type: 'integer' },
    page: { type: 'integer' },
    pageSize: { type: 'integer' },
  },
});

const companyNotFound: DocumentedError = {
  status: 404,
  codes: ['COMPANY_NOT_FOUND'],
  when: 'No such company, or the caller may not see it (its existence is not revealed).',
};
const contactNotFound: DocumentedError = {
  status: 404,
  codes: ['CONTACT_NOT_FOUND'],
  when: 'No such contact, or its company is not visible to the caller.',
};
const duplicateErrors: DocumentedError = {
  status: 409,
  codes: ['COMPANY_KRA_PIN_EXISTS', 'COMPANY_DUPLICATE_SUSPECTED'],
  when: '`COMPANY_KRA_PIN_EXISTS`: another live company has this KRA PIN; refused. `COMPANY_DUPLICATE_SUSPECTED`: a company with the same normalised name exists; resend with `acknowledgeDuplicates: true` to confirm.',
};
const archivedConflict: DocumentedError = {
  status: 409,
  codes: [
    'COMPANY_ARCHIVED',
    'COMPANY_HAS_OPEN_LEADS',
    'CONTACT_ARCHIVED',
    'CONTACT_IN_USE',
    'COMPANY_KRA_PIN_EXISTS',
  ],
  when: 'The record is archived, a company still has open leads, a contact is still linked to a lead, or a restore would reuse a KRA PIN now held by another company.',
};

const ok = (schema: SchemaObject, description: string, status = 200) =>
  ApiResponse({ status, description, schema });

export const DocListCompanies = () =>
  applyDecorators(
    ok(pageOf(companySchema), 'Paginated companies the caller may see, A–Z.'),
    ApiErrors(...privateErrors, VALIDATION_ERROR),
  );
export const DocCreateCompany = () =>
  applyDecorators(
    ok(companySchema, 'Created company.', 201),
    ApiErrors(...privateErrors, VALIDATION_ERROR, duplicateErrors, RATE_LIMITED_ERROR),
  );
export const DocGetCompany = () =>
  applyDecorators(
    ok(companySchema, 'Company details.'),
    ApiErrors(...privateErrors, VALIDATION_ERROR, companyNotFound),
  );
export const DocUpdateCompany = () =>
  applyDecorators(
    ok(companySchema, 'Updated company.'),
    ApiErrors(
      ...privateErrors,
      VALIDATION_ERROR,
      companyNotFound,
      duplicateErrors,
      archivedConflict,
    ),
  );
export const DocArchiveCompany = () =>
  applyDecorators(
    ok(companySchema, 'Archived company.'),
    ApiErrors(...privateErrors, VALIDATION_ERROR, companyNotFound, archivedConflict),
  );
export const DocRestoreCompany = () =>
  applyDecorators(
    ok(companySchema, 'Restored company.'),
    ApiErrors(...privateErrors, VALIDATION_ERROR, companyNotFound, archivedConflict),
  );
export const DocCompanyLeads = () =>
  applyDecorators(
    ok(pageOf(companyLeadSchema), 'Paginated leads of the company the caller may see.'),
    ApiErrors(...privateErrors, VALIDATION_ERROR, companyNotFound),
  );
export const DocCompanyDuplicateCheck = () =>
  applyDecorators(
    ok(
      {
        type: 'object',
        required: ['exact', 'potential', 'hiddenMatchCount'],
        properties: {
          exact: {
            type: 'array',
            items: candidateSchema,
            description: 'Same KRA PIN: saving is refused.',
          },
          potential: {
            type: 'array',
            items: candidateSchema,
            description: 'Same normalised name: the user may confirm.',
          },
          hiddenMatchCount: {
            type: 'integer',
            description: 'Matches the caller may not see; counted, never described.',
          },
        },
      },
      'Possible duplicates the caller may see, split into definite and potential.',
    ),
    ApiErrors(...privateErrors, VALIDATION_ERROR, RATE_LIMITED_ERROR),
  );

export const contactBodySchema: SchemaObject = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'isDecisionMaker'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 200 },
    jobTitle: { type: 'string', maxLength: 150 },
    phone: { type: 'string', maxLength: 40 },
    email: { type: 'string', format: 'email' },
    whatsappNumber: { type: 'string', maxLength: 40 },
    isDecisionMaker: { type: 'boolean' },
  },
};

export const DocListContacts = () =>
  applyDecorators(
    ok(pageOf(contactSchema), 'Paginated contacts of the company (decision-makers first).'),
    ApiErrors(...privateErrors, VALIDATION_ERROR, companyNotFound),
  );
export const DocCreateContact = () =>
  applyDecorators(
    ok(contactSchema, 'Created contact.', 201),
    ApiErrors(
      ...privateErrors,
      VALIDATION_ERROR,
      companyNotFound,
      archivedConflict,
      RATE_LIMITED_ERROR,
    ),
  );
export const DocGetContact = () =>
  applyDecorators(
    ok(contactSchema, 'Contact details.'),
    ApiErrors(...privateErrors, VALIDATION_ERROR, contactNotFound),
  );
export const DocUpdateContact = () =>
  applyDecorators(
    ok(contactSchema, 'Updated contact.'),
    ApiErrors(...privateErrors, VALIDATION_ERROR, contactNotFound, archivedConflict),
  );
export const DocArchiveContact = () =>
  applyDecorators(
    ok(contactSchema, 'Archived contact.'),
    ApiErrors(...privateErrors, VALIDATION_ERROR, contactNotFound, archivedConflict),
  );
export const DocRestoreContact = () =>
  applyDecorators(
    ok(contactSchema, 'Restored contact.'),
    ApiErrors(...privateErrors, VALIDATION_ERROR, contactNotFound),
  );
