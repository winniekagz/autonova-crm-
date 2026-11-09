import {
  BillingCycle,
  Currency,
  DiscountType,
  MilestoneKind,
  SignatureParty,
  TorAddonKind,
  VatTreatment,
  enumValues,
} from '@autonova/enums';
import { paginationQuerySchema, uuidSchema } from '@autonova/validation';
import { z } from 'zod';

const money = z
  .string()
  .regex(/^\d{1,12}(?:\.\d{1,2})?$/, 'Use a non-negative amount with up to two decimals');
const hundredths = z
  .string()
  .regex(/^\d{1,6}(?:\.\d{1,2})?$/, 'Use a non-negative number with up to two decimals');
const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => text(max).optional();

const scopeItem = z
  .object({
    catalogueItemId: z.uuid().optional(),
    itemKey: z.uuid().optional(),
    name: text(200).min(1).optional(),
    description: optionalText(2000),
    inScope: z.boolean(),
    estimateDays: hundredths.optional(),
    price: money.optional(),
  })
  .strict()
  .refine((item) => Boolean(item.catalogueItemId) || Boolean(item.name), {
    path: ['name'],
    message: 'Choose a catalogue item or enter a name',
  });

const addon = z
  .object({
    kind: z.enum(enumValues(TorAddonKind)),
    description: text(300).min(1),
    quantity: hundredths,
    unitPrice: money,
  })
  .strict();

const milestone = z
  .object({
    kind: z.enum(enumValues(MilestoneKind)),
    name: text(200).min(1),
    targetDate: z.iso.date(),
  })
  .strict();

export const torVersionSchema = z
  .object({
    currency: z.enum(enumValues(Currency)),
    setupFee: money,
    discountType: z.enum(enumValues(DiscountType)),
    discountValue: money,
    hostingName: optionalText(200),
    hostingDescription: optionalText(2000),
    hostingCycle: z.enum(enumValues(BillingCycle)).nullable().optional(),
    hostingAmount: money,
    paymentTerms: optionalText(3000),
    vatTreatment: z.enum(enumValues(VatTreatment)),
    changeSummary: optionalText(2000),
    scopeItems: z.array(scopeItem).max(200),
    addons: z.array(addon).max(50),
    milestones: z.array(milestone).max(30),
  })
  .strict();

export const signSchema = z
  .object({
    party: z.enum(enumValues(SignatureParty)),
    signerName: text(200).min(1),
    signerTitle: optionalText(200),
    evidenceNote: optionalText(1000),
  })
  .strict();

export const catalogueSchema = z
  .object({
    name: text(200).min(1),
    description: optionalText(2000),
    productInterest: z.string().nullable().optional(),
    defaultDays: hundredths,
    defaultPrice: money,
    currency: z.enum(enumValues(Currency)),
    active: z.boolean().optional(),
  })
  .strict();

export const thresholdSchema = z.object({ percent: z.number().min(0).max(100) }).strict();

export const versionNoSchema = z.coerce.number().int().min(1).max(9999);
export const leadIdSchema = uuidSchema;
export const idSchema = uuidSchema;
export const listQuerySchema = paginationQuerySchema;

export type TorVersionBody = z.infer<typeof torVersionSchema>;
export type SignBody = z.infer<typeof signSchema>;
export type CatalogueBody = z.infer<typeof catalogueSchema>;
export type ThresholdBody = z.infer<typeof thresholdSchema>;
