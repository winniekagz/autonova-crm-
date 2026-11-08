import { CompanyIndustry, enumValues } from '@autonova/enums';
import { z } from 'zod';

/**
 * The early, friendly check for the company form. It mirrors the API's rules (`companies.schemas.ts`)
 * and never changes the values: normalising for the request happens in `company-input.ts`, and the API
 * validates everything again.
 */
const text = (value: string | undefined) => (value ?? '').trim();
const blank = (value: string | undefined) => text(value) === '';

const optionalText = (max: number, label: string) =>
  z
    .string()
    .optional()
    .refine((value) => text(value).length <= max, `${label} must be at most ${max} characters.`);

const KRA_PIN = /^[A-Z]\d{9}[A-Z]$/;
const isWebAddress = (value: string) => {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && value.length <= 300;
  } catch {
    return false;
  }
};

const countField = (max: number, label: string) =>
  z
    .number(`Enter a whole number for ${label}.`)
    .int(`Enter a whole number for ${label}.`)
    .min(0, `${label} cannot be negative.`)
    .max(max, `${label} must be at most ${max.toLocaleString('en-KE')}.`)
    .nullable()
    .optional();

export const companyFormSchema = z.object({
  name: z
    .string()
    .refine((value) => !blank(value), "Enter the company's name.")
    .refine((value) => text(value).length <= 200, 'The name must be at most 200 characters.'),
  kraPin: z
    .string()
    .optional()
    .refine(
      (value) => blank(value) || KRA_PIN.test(text(value).replace(/\s+/g, '').toUpperCase()),
      'Enter a KRA PIN such as A123456789B.',
    ),
  location: optionalText(300, 'The location'),
  industry: z.enum(enumValues(CompanyIndustry)).nullable().optional(),
  staffCount: countField(1_000_000, 'Staff count'),
  branchCount: countField(10_000, 'Branches'),
  website: z
    .string()
    .optional()
    .refine(
      (value) => blank(value) || isWebAddress(text(value)),
      'Enter a full web address starting with https://',
    ),
  socialLinks: z
    .string()
    .optional()
    .refine(
      (value) =>
        text(value)
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .every(isWebAddress),
      'Enter one full web address per line, starting with https://',
    )
    .refine(
      (value) =>
        text(value)
          .split('\n')
          .filter((line) => line.trim()).length <= 10,
      'Add at most 10 links.',
    ),
});

export type CompanyFormValues = z.infer<typeof companyFormSchema>;

/** Field names the API may report problems for; anything else it sends is ignored. */
export const COMPANY_FORM_FIELDS = [
  'name',
  'kraPin',
  'location',
  'industry',
  'staffCount',
  'branchCount',
  'website',
  'socialLinks',
] as const;
