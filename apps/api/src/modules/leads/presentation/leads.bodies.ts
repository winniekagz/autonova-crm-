import type { ApiBodyOptions } from '@nestjs/swagger';

/** Request-body descriptions for Swagger, kept here so the controller stays a thin translation layer. */
export const createLeadBody: ApiBodyOptions = {
  examples: {
    referralLead: {
      summary: 'Create a referral lead (use a unique email for each run)',
      value: {
        name: 'Northstar Clinic Website',
        email: 'contact@example.test',
        source: 'REFERRAL',
        referrerName: 'Jane Mwangi',
        productInterest: 'RETAIL_POS',
        estimatedValue: '12500.50',
        currency: 'KES',
        nextAction: 'Schedule discovery call',
        nextActionAt: '2026-11-10T08:00:00.000Z',
        probability: 20,
      },
    },
  },
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['name', 'source', 'currency', 'nextAction', 'nextActionAt'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 200, example: 'Northstar Clinic Website' },
      companyId: {
        type: 'string',
        format: 'uuid',
        nullable: true,
        description: 'Company to link; omit or null for an individual prospect.',
      },
      primaryContactId: { type: 'string', format: 'uuid', nullable: true },
      additionalContactIds: {
        type: 'array',
        maxItems: 20,
        items: { type: 'string', format: 'uuid' },
      },
      phone: { type: 'string' },
      email: { type: 'string', format: 'email' },
      source: {
        type: 'string',
        enum: [
          'REFERRAL',
          'INSTAGRAM',
          'WEBSITE',
          'WALK_IN',
          'EVENT',
          'COLD_OUTREACH',
          'EXISTING_CLIENT_UPSELL',
        ],
      },
      referrerName: {
        type: 'string',
        example: 'Jane Mwangi',
        description: 'Required when source is REFERRAL.',
      },
      productInterest: {
        type: 'string',
        enum: [
          'RETAIL_POS',
          'CAR_WASH_AUTOMATION',
          'ERP',
          'VISITOR_SECURITY_SYSTEM',
          'HIRING_PLATFORM',
          'CUSTOM_BUILD',
        ],
      },
      acknowledgeDuplicates: {
        type: 'boolean',
        description:
          'Send true after the user reviewed the possible duplicates reported by a 409 LEAD_DUPLICATE_SUSPECTED.',
      },
      notes: { type: 'string' },
      estimatedValue: {
        type: 'string',
        example: '12500.50',
        description: 'Non-negative amount with up to two decimal places.',
      },
      currency: { type: 'string', enum: ['KES', 'USD'] },
      nextAction: { type: 'string' },
      nextActionAt: { type: 'string', format: 'date-time', example: '2026-11-10T08:00:00.000Z' },
      probability: { type: 'integer', minimum: 0, maximum: 100 },
    },
  },
};

export const updateLeadBody: ApiBodyOptions = {
  examples: {
    followUp: {
      summary: 'Update only the next follow-up action',
      value: { nextAction: 'Send proposal outline' },
    },
  },
  schema: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 200, example: 'Northstar Clinic Website' },
      phone: { type: 'string' },
      email: { type: 'string', format: 'email' },
      source: {
        type: 'string',
        enum: [
          'REFERRAL',
          'INSTAGRAM',
          'WEBSITE',
          'WALK_IN',
          'EVENT',
          'COLD_OUTREACH',
          'EXISTING_CLIENT_UPSELL',
        ],
      },
      referrerName: {
        type: 'string',
        example: 'Jane Mwangi',
        description: 'Required when source is REFERRAL.',
      },
      productInterest: { type: 'string' },
      notes: { type: 'string' },
      estimatedValue: {
        type: 'string',
        example: '12500.50',
        description: 'Non-negative amount with up to two decimal places.',
      },
      currency: { type: 'string', enum: ['KES', 'USD'] },
      nextAction: { type: 'string' },
      nextActionAt: { type: 'string', format: 'date-time', example: '2026-11-10T08:00:00.000Z' },
      probability: { type: 'integer', minimum: 0, maximum: 100 },
    },
  },
};

export const leadRelationshipsBody: ApiBodyOptions = {
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['companyId', 'primaryContactId', 'additionalContactIds'],
    properties: {
      companyId: { type: 'string', format: 'uuid', nullable: true },
      primaryContactId: { type: 'string', format: 'uuid', nullable: true },
      additionalContactIds: {
        type: 'array',
        maxItems: 20,
        items: { type: 'string', format: 'uuid' },
      },
    },
  },
};
