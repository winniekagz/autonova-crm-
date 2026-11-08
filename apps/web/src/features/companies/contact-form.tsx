'use client';

import type { ContactDto } from '@autonova/contracts';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';
import { applyServerFieldErrors } from '@/lib/form-errors';
import { useSaveContact } from './companies.queries';
import { companyErrorText } from './company-format';
import {
  CONTACT_FORM_FIELDS,
  contactFormSchema,
  type ContactFormValues,
} from './contact-form-schema';
import { blankContact, contactToForm, toContactRequestBody } from './contact-input';

interface ContactFormProps {
  companyId: string;
  contact?: ContactDto;
  onDone: () => void;
}

/** Add a contact to a company, or edit one. The company cannot be changed: a contact belongs to one company. */
export function ContactForm({ companyId, contact, onDone }: ContactFormProps) {
  const save = useSaveContact(companyId, contact);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: contact ? contactToForm(contact) : blankContact(),
  });

  const onSubmit = handleSubmit(async (values) => {
    if (save.isPending) return;
    setFormError(null);
    try {
      await save.mutateAsync(toContactRequestBody(values));
      onDone();
    } catch (cause) {
      if (!applyServerFieldErrors(cause, setError, CONTACT_FORM_FIELDS)) {
        setFormError(companyErrorText(cause));
      }
    }
  });

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label={contact ? 'Edit contact' : 'Add contact'}
      className="grid gap-4 rounded-lg border border-line bg-canvas p-4 sm:grid-cols-2"
    >
      {formError ? (
        <div className="sm:col-span-2">
          <Alert tone="error">{formError}</Alert>
        </div>
      ) : null}
      <TextField
        label="Contact name"
        required
        maxLength={200}
        error={errors.name?.message}
        {...register('name')}
      />
      <TextField label="Job title" error={errors.jobTitle?.message} {...register('jobTitle')} />
      <TextField label="Phone" type="tel" error={errors.phone?.message} {...register('phone')} />
      <TextField label="Email" type="email" error={errors.email?.message} {...register('email')} />
      <TextField
        label="WhatsApp number"
        type="tel"
        error={errors.whatsappNumber?.message}
        {...register('whatsappNumber')}
      />
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" {...register('isDecisionMaker')} />
        <span>Decision-maker</span>
      </label>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : contact ? 'Save contact' : 'Add contact'}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
