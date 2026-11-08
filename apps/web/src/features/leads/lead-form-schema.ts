import { Currency, LeadSource, ProductInterest, enumValues } from '@autonova/enums';
import { z } from 'zod';

/**
 * The early, friendly check for the lead form. It mirrors the API's rules (`leads.schemas.ts`) but
 * never changes the values: trimming and normalising for the request happen in `toLeadRequestBody`,
 * and the API validates everything again.
 */
const blank = (value: string | undefined) => (value ?? '').trim() === '';
const textOf = (value: string | undefined) => (value ?? '').trim();

const optionalText = (max: number, label: string) =>
  z
    .string()
    .optional()
    .refine((value) => textOf(value).length <= max, `${label} must be at most ${max} characters.`);

const requiredText = (max: number, empty: string, label: string) =>
  z
    .string()
    .refine((value) => !blank(value), empty)
    .refine((value) => textOf(value).length <= max, `${label} must be at most ${max} characters.`);

export const leadFormSchema = z
  .object({
    name: requiredText(200, "Enter the lead's name.", 'The name'),
    companyName: optionalText(200, 'The company'),
    phone: optionalText(40, 'The phone number'),
    email: z
      .string()
      .optional()
      .refine(
        (value) =>
          blank(value) ||
          (textOf(value).length <= 254 && z.email().safeParse(textOf(value)).success),
        'Enter a valid email address.',
      ),
    source: z.enum(enumValues(LeadSource)),
    referrerName: optionalText(200, 'The referrer'),
    productInterest: z.enum(enumValues(ProductInterest)).nullable().optional(),
    notes: optionalText(5000, 'The notes'),
    estimatedValue: z
      .string()
      .optional()
      .refine(
        (value) => blank(value) || /^\d{1,12}(?:\.\d{1,2})?$/.test(textOf(value)),
        'Use a non-negative amount with up to two decimals.',
      ),
    currency: z.enum(enumValues(Currency)),
    nextAction: requiredText(500, 'Enter the next action.', 'The next action'),
    nextActionAt: z
      .string()
      .refine((value) => !Number.isNaN(Date.parse(value)), 'Choose a follow-up date.'),
    probability: z
      .number('Enter a whole number from 0 to 100.')
      .int('Enter a whole number from 0 to 100.')
      .min(0, 'Enter a whole number from 0 to 100.')
      .max(100, 'Enter a whole number from 0 to 100.')
      .optional(),
  })
  .superRefine((value, context) => {
    if (value.source === LeadSource.Referral && blank(value.referrerName)) {
      context.addIssue({
        code: 'custom',
        path: ['referrerName'],
        message: 'Enter the referrer for a referral lead.',
      });
    }
  });

/** Field names the API may report problems for; anything else it sends is ignored. */
export const LEAD_FORM_FIELDS = [
  'name',
  'companyName',
  'phone',
  'email',
  'source',
  'referrerName',
  'productInterest',
  'notes',
  'estimatedValue',
  'currency',
  'nextAction',
  'nextActionAt',
  'probability',
] as const;
