import { ContactRole, enumValues } from '@autonova/enums';
import { z } from 'zod';

/** The early check for the contact form; the API validates everything again (`companies.schemas.ts`). */
const text = (value: string | undefined) => (value ?? '').trim();
const blank = (value: string | undefined) => text(value) === '';
const optionalText = (max: number, label: string) =>
  z
    .string()
    .optional()
    .refine((value) => text(value).length <= max, `${label} must be at most ${max} characters.`);

export const contactFormSchema = z.object({
  name: z
    .string()
    .refine((value) => !blank(value), "Enter the contact's name.")
    .refine((value) => text(value).length <= 200, 'The name must be at most 200 characters.'),
  jobTitle: optionalText(150, 'The job title'),
  phone: optionalText(40, 'The phone number'),
  email: z
    .string()
    .optional()
    .refine(
      (value) =>
        blank(value) || (text(value).length <= 254 && z.email().safeParse(text(value)).success),
      'Enter a valid email address.',
    ),
  whatsappNumber: optionalText(40, 'The WhatsApp number'),
  isDecisionMaker: z.boolean(),
  role: z.enum(['', ...enumValues(ContactRole)]),
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;
export const CONTACT_FORM_FIELDS = [
  'name',
  'jobTitle',
  'phone',
  'email',
  'whatsappNumber',
  'isDecisionMaker',
  'role',
] as const;
