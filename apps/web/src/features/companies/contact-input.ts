import type { ContactDto, ContactInput } from '@autonova/contracts';
import type { ContactFormValues } from './contact-form-schema';

export const blankContact = (): ContactFormValues => ({
  name: '',
  jobTitle: '',
  phone: '',
  email: '',
  whatsappNumber: '',
  isDecisionMaker: false,
  role: '',
});

export const contactToForm = (contact: ContactDto): ContactFormValues => ({
  name: contact.name,
  jobTitle: contact.jobTitle ?? '',
  phone: contact.phone ?? '',
  email: contact.email ?? '',
  whatsappNumber: contact.whatsappNumber ?? '',
  isDecisionMaker: contact.isDecisionMaker,
  role: contact.role ?? '',
});

export const toContactRequestBody = (values: ContactFormValues): ContactInput => ({
  name: values.name.trim(),
  jobTitle: (values.jobTitle ?? '').trim(),
  phone: (values.phone ?? '').trim(),
  email: (values.email ?? '').trim().toLowerCase(),
  whatsappNumber: (values.whatsappNumber ?? '').trim(),
  isDecisionMaker: values.isDecisionMaker,
  // null clears a role on an edit; on create the API treats it as no role.
  role: values.role === '' ? null : values.role,
});
