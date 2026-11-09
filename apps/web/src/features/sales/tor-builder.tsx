'use client';

import type { CatalogueItemDto, TorVersionDto, TorVersionInput } from '@autonova/contracts';
import {
  BillingCycle,
  DiscountType,
  MilestoneKind,
  TorAddonKind,
  VatTreatment,
  enumValues,
} from '@autonova/enums';
import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { kindLabel } from './sales-format';
import {
  blankTorForm,
  toTorRequest,
  torFormSchema,
  versionToForm,
  type TorFormValues,
} from './tor-form-schema';

/**
 * The editable ToR. It collects what the person types and shows field errors; every total comes back from
 * the server after saving, so the screen can never disagree with the PDF.
 */
export function TorBuilder({
  initial,
  catalogue,
  busy,
  submitLabel,
  onSubmit,
}: {
  initial: TorVersionDto | null;
  catalogue: CatalogueItemDto[];
  busy: boolean;
  submitLabel: string;
  onSubmit: (body: TorVersionInput) => Promise<void>;
}) {
  const form = useForm<TorFormValues>({
    resolver: zodResolver(torFormSchema),
    defaultValues: initial ? versionToForm(initial) : blankTorForm(),
  });
  const { register, control, formState } = form;
  const errors = formState.errors;
  const scope = useFieldArray({ control, name: 'scopeItems' });
  const addons = useFieldArray({ control, name: 'addons' });
  const milestones = useFieldArray({ control, name: 'milestones' });
  const discountType = form.watch('discountType');
  const submit = form.handleSubmit((values) => onSubmit(toTorRequest(values)));

  const addFromCatalogue = (id: string) => {
    const item = catalogue.find((c) => c.id === id);
    if (!item) return;
    scope.append({
      catalogueItemId: item.id,
      name: item.name,
      description: item.description ?? '',
      inScope: true,
      estimateDays: item.defaultDays,
      price: item.defaultPrice,
    });
  };

  return (
    <form onSubmit={submit} noValidate aria-label="Terms of Reference" className="grid gap-5">
      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium">Scope</legend>
        {scope.fields.length === 0 ? (
          <p className="text-sm text-ink-soft">
            No items yet. Add one from the catalogue or by hand.
          </p>
        ) : null}
        {scope.fields.map((field, index) => (
          <div
            key={field.id}
            className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-6"
          >
            <div className="sm:col-span-3">
              <TextField
                label="Item"
                error={errors.scopeItems?.[index]?.name?.message}
                {...register(`scopeItems.${index}.name`)}
              />
            </div>
            <TextField
              label="Days"
              inputMode="decimal"
              error={errors.scopeItems?.[index]?.estimateDays?.message}
              {...register(`scopeItems.${index}.estimateDays`)}
            />
            <TextField
              label="Price"
              inputMode="decimal"
              error={errors.scopeItems?.[index]?.price?.message}
              {...register(`scopeItems.${index}.price`)}
            />
            <div className="flex items-end gap-2">
              <label className="flex h-10 items-center gap-2 text-sm">
                <input type="checkbox" {...register(`scopeItems.${index}.inScope`)} />
                In scope
              </label>
            </div>
            <div className="sm:col-span-5">
              <TextField
                label="Description (optional)"
                {...register(`scopeItems.${index}.description`)}
              />
            </div>
            <div className="flex items-end">
              <Button type="button" variant="secondary" onClick={() => scope.remove(index)}>
                Remove
              </Button>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap items-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              scope.append({
                name: '',
                description: '',
                inScope: true,
                estimateDays: '0',
                price: '0',
              })
            }
          >
            Add item
          </Button>
          {catalogue.length > 0 ? (
            <SelectField
              label="Add from catalogue"
              value=""
              onChange={(event) => addFromCatalogue(event.target.value)}
            >
              <option value="">Choose…</option>
              {catalogue.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
          ) : null}
        </div>
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium">Add-ons</legend>
        {addons.fields.map((field, index) => (
          <div
            key={field.id}
            className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-5"
          >
            <SelectField label="Kind" {...register(`addons.${index}.kind`)}>
              {enumValues(TorAddonKind).map((kind) => (
                <option key={kind} value={kind}>
                  {kindLabel(kind)}
                </option>
              ))}
            </SelectField>
            <div className="sm:col-span-2">
              <TextField
                label="Description"
                error={errors.addons?.[index]?.description?.message}
                {...register(`addons.${index}.description`)}
              />
            </div>
            <TextField
              label="Quantity"
              inputMode="decimal"
              error={errors.addons?.[index]?.quantity?.message}
              {...register(`addons.${index}.quantity`)}
            />
            <TextField
              label="Unit price"
              inputMode="decimal"
              error={errors.addons?.[index]?.unitPrice?.message}
              {...register(`addons.${index}.unitPrice`)}
            />
            <Button type="button" variant="secondary" onClick={() => addons.remove(index)}>
              Remove add-on
            </Button>
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              addons.append({ kind: 'OTHER', description: '', quantity: '1', unitPrice: '0' })
            }
          >
            Add add-on
          </Button>
        </div>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="text-sm font-medium">Pricing</legend>
        <SelectField label="Currency" {...register('currency')}>
          <option value="KES">KES</option>
          <option value="USD">USD</option>
        </SelectField>
        <TextField
          label="Setup fee"
          inputMode="decimal"
          error={errors.setupFee?.message}
          {...register('setupFee')}
        />
        <SelectField label="VAT" {...register('vatTreatment')}>
          {enumValues(VatTreatment).map((v) => (
            <option key={v} value={v}>
              {v === 'APPLIED' ? 'Applied (16%)' : 'Exempt'}
            </option>
          ))}
        </SelectField>
        <SelectField label="Discount" {...register('discountType')}>
          {enumValues(DiscountType).map((v) => (
            <option key={v} value={v}>
              {kindLabel(v)}
            </option>
          ))}
        </SelectField>
        {discountType !== 'NONE' ? (
          <TextField
            label={discountType === 'PERCENT' ? 'Discount (%)' : 'Discount amount'}
            inputMode="decimal"
            error={errors.discountValue?.message}
            {...register('discountValue')}
          />
        ) : null}
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="text-sm font-medium">Hosting and support (recurring)</legend>
        <TextField label="Plan name" {...register('hostingName')} />
        <TextField
          label="Amount per cycle"
          inputMode="decimal"
          error={errors.hostingAmount?.message}
          {...register('hostingAmount')}
        />
        <SelectField label="Billing cycle" {...register('hostingCycle')}>
          <option value="">None</option>
          {enumValues(BillingCycle).map((c) => (
            <option key={c} value={c}>
              {kindLabel(c)}
            </option>
          ))}
        </SelectField>
        {errors.hostingCycle ? (
          <p className="text-xs text-danger sm:col-span-2">{errors.hostingCycle.message}</p>
        ) : null}
      </fieldset>

      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium">Milestones</legend>
        {milestones.fields.map((field, index) => (
          <div
            key={field.id}
            className="grid gap-2 rounded-md border border-line p-3 sm:grid-cols-4"
          >
            <SelectField label="Kind" {...register(`milestones.${index}.kind`)}>
              {enumValues(MilestoneKind).map((kind) => (
                <option key={kind} value={kind}>
                  {kindLabel(kind)}
                </option>
              ))}
            </SelectField>
            <TextField
              label="Name"
              error={errors.milestones?.[index]?.name?.message}
              {...register(`milestones.${index}.name`)}
            />
            <TextField
              label="Target date"
              type="date"
              error={errors.milestones?.[index]?.targetDate?.message}
              {...register(`milestones.${index}.targetDate`)}
            />
            <Button type="button" variant="secondary" onClick={() => milestones.remove(index)}>
              Remove milestone
            </Button>
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => milestones.append({ kind: 'GO_LIVE', name: '', targetDate: '' })}
          >
            Add milestone
          </Button>
        </div>
      </fieldset>

      <TextField label="Payment terms" {...register('paymentTerms')} />
      <TextField label="What changed in this round (optional)" {...register('changeSummary')} />

      <div>
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
