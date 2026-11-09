import {
  BillingCycle,
  Currency,
  DiscountType,
  QuotationStatus,
  VatTreatment,
  enumValues,
} from '@autonova/enums';
import { paginationQuerySchema, uuidSchema } from '@autonova/validation';
import { z } from 'zod';

const money = z
  .string()
  .regex(/^\d{1,12}(?:\.\d{1,2})?$/, 'Use a non-negative amount with up to two decimals');
const quantity = z
  .string()
  .regex(/^\d{1,6}(?:\.\d{1,2})?$/, 'Use a non-negative number with up to two decimals');

export const fromTorSchema = z
  .object({
    validUntil: z.iso.date().optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();

export const quickQuoteSchema = z
  .object({
    currency: z.enum(enumValues(Currency)),
    validUntil: z.iso.date().optional(),
    vatTreatment: z.enum(enumValues(VatTreatment)),
    discountType: z.enum(enumValues(DiscountType)),
    discountValue: money,
    hostingName: z.string().trim().max(200).optional(),
    hostingCycle: z.enum(enumValues(BillingCycle)).nullable().optional(),
    hostingAmount: money,
    notes: z.string().trim().max(2000).optional(),
    lines: z
      .array(
        z
          .object({
            description: z.string().trim().min(1).max(300),
            quantity,
            unitPrice: money,
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

export const quotationStatusSchema = z
  .object({ status: z.enum(enumValues(QuotationStatus)) })
  .strict();

export const idSchema = uuidSchema;
export const listQuerySchema = paginationQuerySchema;

export type FromTorBody = z.infer<typeof fromTorSchema>;
export type QuickQuoteBody = z.infer<typeof quickQuoteSchema>;
export type QuotationStatusBody = z.infer<typeof quotationStatusSchema>;
