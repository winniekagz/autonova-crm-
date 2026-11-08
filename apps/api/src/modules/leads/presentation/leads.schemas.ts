import {
  Currency,
  LeadDisqualificationReason,
  LeadSource,
  LeadStage,
  enumValues,
} from '@autonova/enums';
import { paginationQuerySchema, uuidSchema } from '@autonova/validation';
import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).optional();
const valueSchema = z
  .string()
  .regex(/^\d{1,12}(?:\.\d{1,2})?$/, 'Use a non-negative amount with up to two decimals');

export const createLeadSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    companyName: optionalText(200),
    phone: optionalText(40),
    email: z.union([z.email().max(254), z.literal('')]).optional(),
    source: z.enum(enumValues(LeadSource)),
    referrerName: optionalText(200),
    productInterest: optionalText(120),
    notes: optionalText(5000),
    estimatedValue: valueSchema.optional(),
    currency: z.enum(enumValues(Currency)),
    nextAction: z.string().trim().min(1).max(500),
    nextActionAt: z.iso.datetime(),
    probability: z.number().int().min(0).max(100).optional(),
  })
  .strict()
  .refine((value) => value.source !== LeadSource.Referral || Boolean(value.referrerName), {
    path: ['referrerName'],
    message: 'Enter the referrer for a referral lead',
  });

export const updateLeadSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    companyName: optionalText(200),
    phone: optionalText(40),
    email: z.union([z.email().max(254), z.literal('')]).optional(),
    source: z.enum(enumValues(LeadSource)).optional(),
    referrerName: optionalText(200),
    productInterest: optionalText(120),
    notes: optionalText(5000),
    estimatedValue: valueSchema.optional(),
    currency: z.enum(enumValues(Currency)).optional(),
    nextAction: z.string().trim().min(1).max(500).optional(),
    nextActionAt: z.iso.datetime().optional(),
    probability: z.number().int().min(0).max(100).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update')
  .refine((value) => value.source !== LeadSource.Referral || Boolean(value.referrerName), {
    path: ['referrerName'],
    message: 'Enter the referrer for a referral lead',
  });

export const listLeadsQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(100).optional(),
});
export const leadIdSchema = uuidSchema;

export const transitionLeadSchema = z
  .object({
    fromStage: z.enum(enumValues(LeadStage)),
    toStage: z.enum(enumValues(LeadStage)),
    reason: optionalText(1000),
  })
  .strict();

export const disqualifyLeadSchema = z
  .object({
    fromStage: z.literal(LeadStage.VisitsAndCalls),
    reason: z.enum(enumValues(LeadDisqualificationReason)),
    revisitOn: z.iso.date().optional(),
  })
  .strict();

export const loseLeadSchema = z
  .object({
    fromStage: z.literal(LeadStage.TorQuoteSent),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict();

export const leadHistoryQuerySchema = paginationQuerySchema;
export type CreateLeadBody = z.infer<typeof createLeadSchema>;
export type UpdateLeadBody = z.infer<typeof updateLeadSchema>;
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;
export type TransitionLeadBody = z.infer<typeof transitionLeadSchema>;
export type DisqualifyLeadBody = z.infer<typeof disqualifyLeadSchema>;
export type LoseLeadBody = z.infer<typeof loseLeadSchema>;
export type LeadHistoryQuery = z.infer<typeof leadHistoryQuerySchema>;
