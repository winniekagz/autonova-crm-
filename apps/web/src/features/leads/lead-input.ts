import type { LeadDto, LeadInput } from '@autonova/contracts';
import { LeadSource } from '@autonova/enums';

/** Defaults for a new lead: website source, KES, follow-up due tomorrow. */
export function blankInput(): LeadInput {
  return {
    name: '',
    source: LeadSource.Website,
    currency: 'KES',
    nextAction: '',
    nextActionAt: new Date(Date.now() + 86_400_000).toISOString(),
  };
}

/** The editable subset of a saved lead, with empty optional fields omitted. */
export function toInput(lead: LeadDto): LeadInput {
  return {
    name: lead.name,
    ...(lead.companyName ? { companyName: lead.companyName } : {}),
    ...(lead.phone ? { phone: lead.phone } : {}),
    ...(lead.email ? { email: lead.email } : {}),
    source: lead.source,
    ...(lead.referrerName ? { referrerName: lead.referrerName } : {}),
    ...(lead.productInterest ? { productInterest: lead.productInterest } : {}),
    ...(lead.notes ? { notes: lead.notes } : {}),
    ...(lead.estimatedValue ? { estimatedValue: lead.estimatedValue } : {}),
    currency: lead.currency,
    nextAction: lead.nextAction,
    nextActionAt: lead.nextActionAt,
    ...(lead.probability !== null ? { probability: lead.probability } : {}),
  };
}

/** Trims and normalises what the user typed into the request body the API expects. */
export function toLeadRequestBody(values: LeadInput): LeadInput {
  return {
    ...values,
    name: values.name.trim(),
    nextActionAt: new Date(values.nextActionAt).toISOString(),
    companyName: values.companyName?.trim() ?? '',
    phone: values.phone?.trim() ?? '',
    email: values.email?.trim().toLowerCase() ?? '',
    referrerName: values.referrerName?.trim() ?? '',
    productInterest: values.productInterest?.trim() ?? '',
    notes: values.notes?.trim() ?? '',
    estimatedValue: values.estimatedValue?.trim() || undefined,
  };
}
