import type { CompanyDto, CompanyInput } from '@autonova/contracts';
import type { CompanyFormValues } from './company-form-schema';

export const blankCompany = (): CompanyFormValues => ({
  name: '',
  kraPin: '',
  location: '',
  industry: null,
  staffCount: null,
  branchCount: null,
  website: '',
  socialLinks: '',
});

/** The editable fields of a saved company, in the shape the form uses (links one per line). */
export const toFormValues = (company: CompanyDto): CompanyFormValues => ({
  name: company.name,
  kraPin: company.kraPin ?? '',
  location: company.location ?? '',
  industry: company.industry,
  staffCount: company.staffCount,
  branchCount: company.branchCount,
  website: company.website ?? '',
  socialLinks: company.socialLinks.join('\n'),
});

/** Trims and normalises what was typed into the request body the API expects. */
export function toCompanyRequestBody(values: CompanyFormValues): CompanyInput {
  const links = (values.socialLinks ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    name: values.name.trim(),
    kraPin: (values.kraPin ?? '').replace(/\s+/g, '').toUpperCase(),
    location: (values.location ?? '').trim(),
    industry: values.industry ?? null,
    staffCount: values.staffCount ?? null,
    branchCount: values.branchCount ?? null,
    website: (values.website ?? '').trim(),
    socialLinks: [...new Set(links)],
  };
}
