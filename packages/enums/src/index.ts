/**
 * Shared domain enums. Each enum is a const object plus a derived union type so the
 * values are available at runtime (validation, UI options) and at compile time.
 *
 * Rule: an enum is added here only when it is persisted or exchanged over the API.
 * Persisted enum changes are data migrations, not code edits (see docs/04-database-design.md).
 */

/** Keys of the system roles seeded by the API. Roles themselves are database rows. */
export const SystemRoleKey = {
  Director: 'director',
  BusinessDevelopment: 'business_development',
  TechnicalLead: 'technical_lead',
  Finance: 'finance',
} as const;
export type SystemRoleKey = (typeof SystemRoleKey)[keyof typeof SystemRoleKey];

/**
 * Permission keys (`<resource>:<action>`, also enforced by a database CHECK). The mapping from
 * roles to permissions lives in the API (`role-permissions.ts`); the web app only reads the
 * current user's keys from `/auth/me` to decide what to show — the API enforces them.
 */
export const PermissionKey = {
  UsersList: 'users:list',
  UsersRead: 'users:read',
  UsersCreate: 'users:create',
  UsersUpdate: 'users:update',
  UsersAssignRoles: 'users:assign_roles',
  UsersDisable: 'users:disable',
  RolesList: 'roles:list',
  LeadsList: 'leads:list',
  LeadsRead: 'leads:read',
  LeadsCreate: 'leads:create',
  LeadsUpdate: 'leads:update',
  CompaniesList: 'companies:list',
  CompaniesRead: 'companies:read',
  CompaniesCreate: 'companies:create',
  CompaniesUpdate: 'companies:update',
  CompaniesArchive: 'companies:archive',
  ActivitiesList: 'activities:list',
  ActivitiesRead: 'activities:read',
  ActivitiesCreate: 'activities:create',
  ActivitiesUpdate: 'activities:update',
  ActivitiesArchive: 'activities:archive',
  ActivitiesRetention: 'activities:retention',
  QualificationOverride: 'qualification:override',
  SettingsManage: 'settings:manage',
  CatalogueRead: 'catalogue:read',
  CatalogueManage: 'catalogue:manage',
  TorsRead: 'tors:read',
  TorsWrite: 'tors:write',
  TorsApprove: 'tors:approve',
  QuotationsRead: 'quotations:read',
  QuotationsWrite: 'quotations:write',
  ClientsRead: 'clients:read',
} as const;
export type PermissionKey = (typeof PermissionKey)[keyof typeof PermissionKey];

export const UserStatus = {
  Invited: 'INVITED',
  Active: 'ACTIVE',
  Disabled: 'DISABLED',
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const Currency = {
  KES: 'KES',
  USD: 'USD',
} as const;
export type Currency = (typeof Currency)[keyof typeof Currency];

export const LeadSource = {
  Referral: 'REFERRAL',
  Instagram: 'INSTAGRAM',
  Website: 'WEBSITE',
  WalkIn: 'WALK_IN',
  Event: 'EVENT',
  ColdOutreach: 'COLD_OUTREACH',
  ExistingClientUpsell: 'EXISTING_CLIENT_UPSELL',
} as const;
export type LeadSource = (typeof LeadSource)[keyof typeof LeadSource];

/** PRD §4.3: the kinds of interaction a report records. */
export const ActivityType = {
  Visit: 'VISIT',
  Call: 'CALL',
  Demo: 'DEMO',
  Meeting: 'MEETING',
} as const;
export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];

/** What an attachment is, which decides its size limit and which types are accepted. */
export const AttachmentCategory = {
  Photo: 'PHOTO',
  VoiceNote: 'VOICE_NOTE',
  Document: 'DOCUMENT',
} as const;
export type AttachmentCategory = (typeof AttachmentCategory)[keyof typeof AttachmentCategory];

/** Why a stored file or location was removed or kept: the retention process records one of these. */
export const RetentionAction = {
  Purged: 'PURGED',
  GpsCleared: 'GPS_CLEARED',
} as const;
export type RetentionAction = (typeof RetentionAction)[keyof typeof RetentionAction];

/** Industry classification for a company. Broad on purpose: it is for filtering, not for reporting detail. */
export const CompanyIndustry = {
  Retail: 'RETAIL',
  Hospitality: 'HOSPITALITY',
  Automotive: 'AUTOMOTIVE',
  Manufacturing: 'MANUFACTURING',
  Logistics: 'LOGISTICS',
  Education: 'EDUCATION',
  Healthcare: 'HEALTHCARE',
  Finance: 'FINANCE',
  Agriculture: 'AGRICULTURE',
  RealEstate: 'REAL_ESTATE',
  Technology: 'TECHNOLOGY',
  Government: 'GOVERNMENT',
  Other: 'OTHER',
} as const;
export type CompanyIndustry = (typeof CompanyIndustry)[keyof typeof CompanyIndustry];

/** PRD §4.1 product catalogue. Values are stable keys; show people `PRODUCT_INTEREST_LABELS`. */
export const ProductInterest = {
  RetailPos: 'RETAIL_POS',
  CarWashAutomation: 'CAR_WASH_AUTOMATION',
  Erp: 'ERP',
  VisitorSecuritySystem: 'VISITOR_SECURITY_SYSTEM',
  HiringPlatform: 'HIRING_PLATFORM',
  CustomBuild: 'CUSTOM_BUILD',
} as const;
export type ProductInterest = (typeof ProductInterest)[keyof typeof ProductInterest];

export const PRODUCT_INTEREST_LABELS: Record<ProductInterest, string> = {
  RETAIL_POS: 'Retail POS',
  CAR_WASH_AUTOMATION: 'Car Wash Automation',
  ERP: 'ERP',
  VISITOR_SECURITY_SYSTEM: 'Visitor/Security System',
  HIRING_PLATFORM: 'Hiring Platform (TalentHub)',
  CUSTOM_BUILD: 'Custom Build',
};

/** Canonical current pipeline stage stored on each lead/opportunity aggregate. */
export const LeadStage = {
  NewLead: 'NEW_LEAD',
  VisitsAndCalls: 'VISITS_AND_CALLS',
  Qualified: 'QUALIFIED',
  ScopeAlignment: 'SCOPE_ALIGNMENT',
  TorQuoteSent: 'TOR_QUOTE_SENT',
  Disqualified: 'DISQUALIFIED',
  Won: 'WON',
  Lost: 'LOST',
} as const;
export type LeadStage = (typeof LeadStage)[keyof typeof LeadStage];

/** PRD §4.4 disqualification choices. Timing is the only choice that schedules re-entry. */
export const LeadDisqualificationReason = {
  NoBudget: 'NO_BUDGET',
  NoDecisionMaker: 'NO_DECISION_MAKER',
  NeedDoesNotFit: 'NEED_DOES_NOT_FIT',
  ChoseCompetitor: 'CHOSE_COMPETITOR',
  Unresponsive: 'UNRESPONSIVE',
  TimingRevisitLater: 'TIMING_REVISIT_LATER',
  Other: 'OTHER',
} as const;
export type LeadDisqualificationReason =
  (typeof LeadDisqualificationReason)[keyof typeof LeadDisqualificationReason];

export const LeadTransitionSource = {
  Manual: 'MANUAL',
  ScheduledRevisit: 'SCHEDULED_REVISIT',
  /** The commercial workflow moved the lead: sending a ToR, or a both-parties signature converting it. */
  TorSent: 'TOR_SENT',
  Conversion: 'CONVERSION',
} as const;
export type LeadTransitionSource = (typeof LeadTransitionSource)[keyof typeof LeadTransitionSource];

/** Delivery state of a next-action reminder. Only PENDING rows are ever retried. */
export const LeadReminderStatus = {
  Pending: 'PENDING',
  Sent: 'SENT',
  Failed: 'FAILED',
  Skipped: 'SKIPPED',
} as const;
export type LeadReminderStatus = (typeof LeadReminderStatus)[keyof typeof LeadReminderStatus];

/** Why a reminder was not delivered (or is being retried). Never contains provider details. */
export const LeadReminderReason = {
  SmtpNotConfigured: 'SMTP_NOT_CONFIGURED',
  DeliveryFailed: 'DELIVERY_FAILED',
  LeadNotActive: 'LEAD_NOT_ACTIVE',
  FollowUpChanged: 'FOLLOW_UP_CHANGED',
  RecipientUnavailable: 'RECIPIENT_UNAVAILABLE',
  TooOverdue: 'TOO_OVERDUE',
} as const;
export type LeadReminderReason = (typeof LeadReminderReason)[keyof typeof LeadReminderReason];

/** How well a BANT criterion is met. The backend turns the four ratings into a score; the client never sends one. */
export const QualificationRating = {
  NotMet: 'NOT_MET',
  PartiallyMet: 'PARTIALLY_MET',
  FullyMet: 'FULLY_MET',
} as const;
export type QualificationRating = (typeof QualificationRating)[keyof typeof QualificationRating];

/** A ToR version is DRAFT (editable), SENT (frozen, awaiting signatures), SIGNED (locked), or SUPERSEDED (replaced by a newer sent version). */
export const TorVersionStatus = {
  Draft: 'DRAFT',
  Sent: 'SENT',
  Signed: 'SIGNED',
  Superseded: 'SUPERSEDED',
} as const;
export type TorVersionStatus = (typeof TorVersionStatus)[keyof typeof TorVersionStatus];

export const DiscountType = { None: 'NONE', Percent: 'PERCENT', Amount: 'AMOUNT' } as const;
export type DiscountType = (typeof DiscountType)[keyof typeof DiscountType];

export const VatTreatment = { Applied: 'APPLIED', Exempt: 'EXEMPT' } as const;
export type VatTreatment = (typeof VatTreatment)[keyof typeof VatTreatment];

export const BillingCycle = {
  Monthly: 'MONTHLY',
  Quarterly: 'QUARTERLY',
  Annual: 'ANNUAL',
} as const;
export type BillingCycle = (typeof BillingCycle)[keyof typeof BillingCycle];

export const TorAddonKind = {
  TrainingDays: 'TRAINING_DAYS',
  Hardware: 'HARDWARE',
  DataMigration: 'DATA_MIGRATION',
  SmsBundle: 'SMS_BUNDLE',
  Other: 'OTHER',
} as const;
export type TorAddonKind = (typeof TorAddonKind)[keyof typeof TorAddonKind];

export const MilestoneKind = {
  RequirementsSignOff: 'REQUIREMENTS_SIGN_OFF',
  Demo: 'DEMO',
  Uat: 'UAT',
  GoLive: 'GO_LIVE',
  Training: 'TRAINING',
  Other: 'OTHER',
} as const;
export type MilestoneKind = (typeof MilestoneKind)[keyof typeof MilestoneKind];

export const SignatureParty = { Client: 'CLIENT', Autonova: 'AUTONOVA' } as const;
export type SignatureParty = (typeof SignatureParty)[keyof typeof SignatureParty];

/** Phase 1 records a typed name confirmed by staff. Drawn signatures, OTP and signed scans are not built. */
export const SignatureMethod = { TypedName: 'TYPED_NAME' } as const;
export type SignatureMethod = (typeof SignatureMethod)[keyof typeof SignatureMethod];

export const QuotationStatus = {
  Draft: 'DRAFT',
  Sent: 'SENT',
  Accepted: 'ACCEPTED',
  Expired: 'EXPIRED',
  Rejected: 'REJECTED',
} as const;
export type QuotationStatus = (typeof QuotationStatus)[keyof typeof QuotationStatus];

export const QuotationKind = { FromTor: 'FROM_TOR', Quick: 'QUICK' } as const;
export type QuotationKind = (typeof QuotationKind)[keyof typeof QuotationKind];

export const QuotationLineKind = { Scope: 'SCOPE', Addon: 'ADDON', Custom: 'CUSTOM' } as const;
export type QuotationLineKind = (typeof QuotationLineKind)[keyof typeof QuotationLineKind];

export const ClientAccountStatus = {
  Active: 'ACTIVE',
  Suspended: 'SUSPENDED',
  Closed: 'CLOSED',
} as const;
export type ClientAccountStatus = (typeof ClientAccountStatus)[keyof typeof ClientAccountStatus];

export function enumValues<T extends Record<string, string>>(e: T): [T[keyof T], ...T[keyof T][]] {
  return Object.values(e) as [T[keyof T], ...T[keyof T][]];
}
