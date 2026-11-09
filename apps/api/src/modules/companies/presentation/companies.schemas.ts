import { CompanyIndustry, ContactRole, enumValues } from '@autonova/enums';
import { paginationQuerySchema, uuidSchema } from '@autonova/validation';
import { z } from 'zod';
import { isValidKraPin, normalizeKraPin } from '../domain/company-rules.js';

const optionalText = (max: number) => z.string().trim().max(max).optional();
const count = (max: number) => z.number().int().min(0).max(max).nullable().optional();

const kraPin = z
  .string()
  .optional()
  .refine((value) => {
    const pin = normalizeKraPin(value);
    return pin === null || isValidKraPin(pin);
  }, 'Enter a KRA PIN such as A123456789B');

const link = z
  .url({ protocol: /^https?$/, message: 'Enter a full web address starting with https://' })
  .max(300);
const websiteSchema = z.union([link, z.literal('')]).optional();

const companyFields = {
  name: z.string().trim().min(1).max(200),
  kraPin,
  location: optionalText(300),
  industry: z.enum(enumValues(CompanyIndustry)).nullable().optional(),
  staffCount: count(1_000_000),
  branchCount: count(10_000),
  website: websiteSchema,
  socialLinks: z.array(link).max(10).optional(),
};
const acknowledgeDuplicates = z.boolean().optional();

export const createCompanySchema = z.object({ ...companyFields, acknowledgeDuplicates }).strict();

export const updateCompanySchema = z
  .object({
    ...companyFields,
    name: companyFields.name.optional(),
    acknowledgeDuplicates,
  })
  .strict()
  .refine(
    (value) => Object.keys(value).some((key) => key !== 'acknowledgeDuplicates'),
    'Provide at least one field to update',
  );

export const companyIdSchema = uuidSchema;

export const listCompaniesQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().min(1).max(100).optional(),
  industry: z.enum(enumValues(CompanyIndustry)).optional(),
  includeArchived: z.enum(['true', 'false']).optional(),
});

export const companyDuplicateCheckSchema = z
  .object({
    name: optionalText(200),
    kraPin,
    excludeCompanyId: uuidSchema.optional(),
  })
  .strict();

export const archiveSchema = z.object({ reason: optionalText(500) }).strict();

const contactFields = {
  name: z.string().trim().min(1).max(200),
  jobTitle: optionalText(150),
  phone: optionalText(40),
  email: z.union([z.email().max(254), z.literal('')]).optional(),
  whatsappNumber: optionalText(40),
  isDecisionMaker: z.boolean(),
  role: z.enum(enumValues(ContactRole)).nullable().optional(),
};

export const createContactSchema = z.object(contactFields).strict();
export const updateContactSchema = z
  .object({
    ...contactFields,
    name: contactFields.name.optional(),
    isDecisionMaker: contactFields.isDecisionMaker.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

export const contactIdSchema = uuidSchema;
export const listContactsQuerySchema = paginationQuerySchema.extend({
  includeArchived: z.enum(['true', 'false']).optional(),
});
export const companyLeadsQuerySchema = paginationQuerySchema;

export type CreateCompanyBody = z.infer<typeof createCompanySchema>;
export type UpdateCompanyBody = z.infer<typeof updateCompanySchema>;
export type CompanyFields = Omit<CreateCompanyBody, 'acknowledgeDuplicates'>;
export type CompanyUpdateFields = Omit<UpdateCompanyBody, 'acknowledgeDuplicates'>;
export type ListCompaniesQuery = z.infer<typeof listCompaniesQuerySchema>;
export type CompanyDuplicateCheckBody = z.infer<typeof companyDuplicateCheckSchema>;
export type ArchiveBody = z.infer<typeof archiveSchema>;
export type CreateContactBody = z.infer<typeof createContactSchema>;
export type UpdateContactBody = z.infer<typeof updateContactSchema>;
export type ListContactsQuery = z.infer<typeof listContactsQuerySchema>;
export type CompanyLeadsQuery = z.infer<typeof companyLeadsQuerySchema>;
