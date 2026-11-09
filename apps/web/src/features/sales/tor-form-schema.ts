import type { TorVersionDto, TorVersionInput } from '@autonova/contracts';
import {
  BillingCycle,
  Currency,
  DiscountType,
  MilestoneKind,
  TorAddonKind,
  VatTreatment,
  enumValues,
} from '@autonova/enums';
import { z } from 'zod';

const money = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, 'Use an amount like 1500 or 1500.50');
const decimal = z
  .string()
  .trim()
  .regex(/^\d{1,6}(\.\d{1,2})?$/, 'Use a number with up to two decimals');

const scopeItem = z.object({
  itemKey: z.string().optional(),
  catalogueItemId: z.string().optional(),
  name: z.string().trim().min(1, 'Name the item').max(200),
  description: z.string().max(2000),
  inScope: z.boolean(),
  estimateDays: decimal,
  price: money,
});

const addon = z.object({
  kind: z.enum(enumValues(TorAddonKind)),
  description: z.string().trim().min(1, 'Describe the add-on').max(300),
  quantity: decimal.refine((v) => Number(v) > 0, 'Quantity must be above zero'),
  unitPrice: money,
});

const milestone = z.object({
  kind: z.enum(enumValues(MilestoneKind)),
  name: z.string().trim().min(1, 'Name the milestone').max(200),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date'),
});

/**
 * The form holds what people type. It checks SHAPE only (is this an amount, is a name present). It never
 * adds up a price or a tax: the server does that and the screen shows what it returns.
 */
export const torFormSchema = z
  .object({
    currency: z.enum(enumValues(Currency)),
    setupFee: money,
    discountType: z.enum(enumValues(DiscountType)),
    discountValue: money,
    hostingName: z.string().max(200),
    hostingDescription: z.string().max(2000),
    hostingCycle: z.enum(['', ...enumValues(BillingCycle)]),
    hostingAmount: money,
    paymentTerms: z.string().max(3000),
    vatTreatment: z.enum(enumValues(VatTreatment)),
    changeSummary: z.string().max(2000),
    scopeItems: z.array(scopeItem).max(200),
    addons: z.array(addon).max(50),
    milestones: z.array(milestone).max(30),
  })
  .superRefine((value, ctx) => {
    if (Number(value.hostingAmount) > 0 && !value.hostingCycle) {
      ctx.addIssue({ code: 'custom', path: ['hostingCycle'], message: 'Choose a billing cycle' });
    }
    if (value.discountType !== 'NONE' && !(Number(value.discountValue) > 0)) {
      ctx.addIssue({
        code: 'custom',
        path: ['discountValue'],
        message: 'Enter the discount value',
      });
    }
    if (value.discountType === 'PERCENT' && Number(value.discountValue) > 100) {
      ctx.addIssue({
        code: 'custom',
        path: ['discountValue'],
        message: 'A percentage cannot exceed 100',
      });
    }
  });

export type TorFormValues = z.infer<typeof torFormSchema>;

export const blankTorForm = (): TorFormValues => ({
  currency: 'KES',
  setupFee: '0',
  discountType: 'NONE',
  discountValue: '0',
  hostingName: '',
  hostingDescription: '',
  hostingCycle: '',
  hostingAmount: '0',
  paymentTerms: '',
  vatTreatment: 'APPLIED',
  changeSummary: '',
  scopeItems: [],
  addons: [],
  milestones: [],
});

/** Loads a stored version into the form, so a new round starts from exactly what was agreed before. */
export const versionToForm = (v: TorVersionDto): TorFormValues => ({
  currency: v.currency,
  setupFee: v.setupFee,
  discountType: v.discountType,
  discountValue: v.discountValue,
  hostingName: v.hostingName ?? '',
  hostingDescription: v.hostingDescription ?? '',
  hostingCycle: v.hostingCycle ?? '',
  hostingAmount: v.hostingAmount,
  paymentTerms: v.paymentTerms ?? '',
  vatTreatment: v.vatTreatment,
  changeSummary: '',
  scopeItems: v.scopeItems.map((i) => ({
    itemKey: i.itemKey,
    ...(i.catalogueItemId ? { catalogueItemId: i.catalogueItemId } : {}),
    name: i.name,
    description: i.description ?? '',
    inScope: i.inScope,
    estimateDays: i.estimateDays,
    price: i.price,
  })),
  addons: v.addons.map((a) => ({
    kind: a.kind,
    description: a.description,
    quantity: a.quantity,
    unitPrice: a.unitPrice,
  })),
  milestones: v.milestones.map((m) => ({ kind: m.kind, name: m.name, targetDate: m.targetDate })),
});

/** The request body. Empty optional text is omitted so the server stores null, not an empty string. */
export function toTorRequest(values: TorFormValues): TorVersionInput {
  const optional = (text: string) => (text.trim() ? { value: text.trim() } : null);
  const hostingName = optional(values.hostingName);
  const hostingDescription = optional(values.hostingDescription);
  const paymentTerms = optional(values.paymentTerms);
  const changeSummary = optional(values.changeSummary);
  return {
    currency: values.currency,
    setupFee: values.setupFee,
    discountType: values.discountType,
    discountValue: values.discountType === 'NONE' ? '0' : values.discountValue,
    ...(hostingName ? { hostingName: hostingName.value } : {}),
    ...(hostingDescription ? { hostingDescription: hostingDescription.value } : {}),
    hostingCycle: values.hostingCycle === '' ? null : values.hostingCycle,
    hostingAmount: values.hostingAmount,
    ...(paymentTerms ? { paymentTerms: paymentTerms.value } : {}),
    vatTreatment: values.vatTreatment,
    ...(changeSummary ? { changeSummary: changeSummary.value } : {}),
    scopeItems: values.scopeItems.map((i) => ({
      ...(i.itemKey ? { itemKey: i.itemKey } : {}),
      ...(i.catalogueItemId ? { catalogueItemId: i.catalogueItemId } : {}),
      name: i.name.trim(),
      ...(i.description.trim() ? { description: i.description.trim() } : {}),
      inScope: i.inScope,
      estimateDays: i.estimateDays,
      price: i.inScope ? i.price : '0',
    })),
    addons: values.addons.map((a) => ({ ...a, description: a.description.trim() })),
    milestones: values.milestones.map((m) => ({ ...m, name: m.name.trim() })),
  };
}
