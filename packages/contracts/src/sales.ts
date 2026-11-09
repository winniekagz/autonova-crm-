import type {
  BillingCycle,
  ClientAccountStatus,
  Currency,
  DiscountType,
  LeadStage,
  MilestoneKind,
  ProductInterest,
  QualificationRating,
  QuotationKind,
  QuotationLineKind,
  QuotationStatus,
  SignatureMethod,
  SignatureParty,
  TorAddonKind,
  TorVersionStatus,
  VatTreatment,
} from '@autonova/enums';

/** Money is always a decimal string ("1234.50"), never a float, so no precision is lost on the wire. */
export type Money = string;

// --- Qualification (SOW 4.4) -------------------------------------------------------------------------

export interface QualificationRatings {
  budget: QualificationRating;
  authority: QualificationRating;
  need: QualificationRating;
  timeline: QualificationRating;
}

export interface QualificationDto {
  id: string;
  leadId: string;
  ratings: QualificationRatings;
  /** Calculated by the server, 0 to 100. */
  score: number;
  /** The pass mark in force when this was assessed. */
  passMark: number;
  passed: boolean;
  notes: string | null;
  assessedByName: string | null;
  assessedAt: string;
}

export interface QualificationInput extends QualificationRatings {
  notes?: string;
}

export interface QualificationSettingsDto {
  passMark: number;
  /** Points available per criterion; they add up to 100. */
  weights: { budget: number; authority: number; need: number; timeline: number };
  /** True while no Director has chosen values: these are the temporary defaults. */
  isDefault: boolean;
}

export interface QualifyRequest {
  /** Required when the latest assessment did not pass: only a Director may override, and must say why. */
  overrideReason?: string;
  note?: string;
}

// --- Terms of Reference (SOW 4.5) --------------------------------------------------------------------

export interface TorScopeItemDto {
  id: string;
  itemKey: string;
  catalogueItemId: string | null;
  position: number;
  name: string;
  description: string | null;
  inScope: boolean;
  estimateDays: string;
  price: Money;
}

export interface TorAddonDto {
  id: string;
  kind: TorAddonKind;
  description: string;
  quantity: string;
  unitPrice: Money;
  lineTotal: Money;
}

export interface TorMilestoneDto {
  id: string;
  kind: MilestoneKind;
  name: string;
  targetDate: string;
}

export interface TorSignatureDto {
  id: string;
  party: SignatureParty;
  signerName: string;
  signerTitle: string | null;
  method: SignatureMethod;
  evidenceNote: string | null;
  signedAt: string;
  recordedByName: string | null;
}

export interface TorTotalsDto {
  scopeTotal: Money;
  addonsTotal: Money;
  oneOffSubtotal: Money;
  discountAmount: Money;
  netOneOff: Money;
  vatOneOff: Money;
  totalOneOff: Money;
  recurringVat: Money;
  recurringTotal: Money;
}

export interface TorVersionDto {
  id: string;
  torId: string;
  versionNo: number;
  status: TorVersionStatus;
  currency: Currency;
  setupFee: Money;
  discountType: DiscountType;
  discountValue: Money;
  hostingName: string | null;
  hostingDescription: string | null;
  hostingCycle: BillingCycle | null;
  hostingAmount: Money;
  paymentTerms: string | null;
  vatTreatment: VatTreatment;
  vatRate: string;
  changeSummary: string | null;
  totals: TorTotalsDto;
  scopeItems: TorScopeItemDto[];
  addons: TorAddonDto[];
  milestones: TorMilestoneDto[];
  signatures: TorSignatureDto[];
  /** True when the discount is above the threshold and no Director has approved it yet. */
  discountNeedsApproval: boolean;
  discountApprovedByName: string | null;
  discountApprovedAt: string | null;
  sentAt: string | null;
  signedAt: string | null;
  contentHash: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface TorVersionSummaryDto {
  id: string;
  versionNo: number;
  status: TorVersionStatus;
  changeSummary: string | null;
  totalOneOff: Money;
  currency: Currency;
  sentAt: string | null;
  signedAt: string | null;
  createdAt: string;
}

export interface TorDto {
  id: string;
  number: string;
  leadId: string;
  versions: TorVersionSummaryDto[];
  /** The newest version: the one to edit, send or sign. */
  current: TorVersionDto;
  /** True once a signed version exists: later changes are change requests, which are not built yet. */
  signed: boolean;
  clientAccountId: string | null;
}

export type TorChangeKind = 'ADDED' | 'REMOVED' | 'CHANGED' | 'SCOPE_FLIPPED';

export interface TorChangeDto {
  kind: TorChangeKind;
  itemName: string;
  detail: string;
}

export interface TorVersionDiffDto {
  fromVersionNo: number;
  toVersionNo: number;
  scope: TorChangeDto[];
  /** Commercial fields that differ, as readable lines. */
  commercial: string[];
}

export interface TorScopeItemInput {
  /** Set to copy a catalogue item; name, days and price default from it and may be overridden. */
  catalogueItemId?: string;
  /** Keeps an item's identity across versions; omit for a new item. */
  itemKey?: string;
  name?: string;
  description?: string;
  inScope: boolean;
  estimateDays?: string;
  price?: Money;
}

export interface TorVersionInput {
  currency: Currency;
  setupFee: Money;
  discountType: DiscountType;
  discountValue: Money;
  hostingName?: string;
  hostingDescription?: string;
  hostingCycle?: BillingCycle | null;
  hostingAmount: Money;
  paymentTerms?: string;
  vatTreatment: VatTreatment;
  changeSummary?: string;
  scopeItems: TorScopeItemInput[];
  addons: { kind: TorAddonKind; description: string; quantity: string; unitPrice: Money }[];
  milestones: { kind: MilestoneKind; name: string; targetDate: string }[];
}

export interface SignTorRequest {
  party: SignatureParty;
  signerName: string;
  signerTitle?: string;
  /** What the person recorded this from, for example "Signed scan received by email on 5 Nov". */
  evidenceNote?: string;
}

export interface CatalogueItemDto {
  id: string;
  name: string;
  description: string | null;
  productInterest: ProductInterest | null;
  defaultDays: string;
  defaultPrice: Money;
  currency: Currency;
  active: boolean;
}

export interface CatalogueItemInput {
  name: string;
  description?: string;
  productInterest?: ProductInterest | null;
  defaultDays: string;
  defaultPrice: Money;
  currency: Currency;
  active?: boolean;
}

// --- Quotations (SOW 4.6) ----------------------------------------------------------------------------

export interface QuotationLineDto {
  id: string;
  kind: QuotationLineKind;
  description: string;
  quantity: string;
  unitPrice: Money;
  lineTotal: Money;
}

export interface QuotationDto {
  id: string;
  number: string;
  leadId: string;
  kind: QuotationKind;
  torVersionId: string | null;
  /** The version number the quote was built from, for display. */
  torVersionNo: number | null;
  status: QuotationStatus;
  currency: Currency;
  validUntil: string;
  /** True once the validity date has passed and the quote was still open. */
  expired: boolean;
  vatTreatment: VatTreatment;
  vatRate: string;
  discountType: DiscountType;
  discountValue: Money;
  hostingName: string | null;
  hostingCycle: BillingCycle | null;
  hostingAmount: Money;
  totals: Omit<TorTotalsDto, 'scopeTotal' | 'addonsTotal'>;
  lines: QuotationLineDto[];
  notes: string | null;
  sentAt: string | null;
  decidedAt: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface QuickQuoteInput {
  currency: Currency;
  validUntil: string;
  vatTreatment: VatTreatment;
  discountType: DiscountType;
  discountValue: Money;
  hostingName?: string;
  hostingCycle?: BillingCycle | null;
  hostingAmount: Money;
  notes?: string;
  lines: { description: string; quantity: string; unitPrice: Money }[];
}

export interface QuoteFromTorInput {
  validUntil: string;
  notes?: string;
}

// --- Conversion (SOW 4.7) ----------------------------------------------------------------------------

export interface ClientAccountDto {
  id: string;
  number: string;
  leadId: string;
  torId: string;
  signedTorVersionId: string;
  signedTorVersionNo: number;
  companyId: string | null;
  name: string;
  status: ClientAccountStatus;
  goLiveDate: string | null;
  planName: string | null;
  billingCycle: BillingCycle | null;
  planAmount: Money;
  currency: Currency;
  nextRenewalDate: string | null;
  milestones: TorMilestoneDto[];
  createdAt: string;
}

// --- Pipeline summary --------------------------------------------------------------------------------

export interface PipelineSummaryDto {
  asOf: string;
  stages: { stage: LeadStage; count: number }[];
  qualifiedOpportunities: number;
  /** ToR versions sent and waiting for one or both signatures. */
  torsAwaitingSignature: number;
  signedDeals: number;
  won: number;
  lost: number;
  /** Open leads whose next action date has passed. */
  overdueFollowUps: number;
  /** Revisit-later leads whose date has arrived but that have not re-entered the pipeline yet. */
  revisitsDue: number;
  currency: Currency;
  /** Estimated value of open qualified leads, per currency, as decimal strings. */
  openValue: { currency: Currency; amount: Money }[];
}
