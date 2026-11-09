import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { QualificationSettingsDto } from '@autonova/contracts';
import { DEFAULT_BANT_SETTINGS, type BantSettings } from '../../qualification/domain/bant.js';
import { SettingsRepository } from '../infrastructure/settings.repository.js';

export const SETTING_KEYS = {
  bant: 'qualification.bant',
  discountThresholdPercent: 'tor.discount_threshold_percent',
  quoteValidityDays: 'quotation.validity_days',
} as const;

/** Temporary default (PRD example: 10%). Above this, a Director must approve before a ToR is sent. */
export const DEFAULT_DISCOUNT_THRESHOLD_PERCENT = 10;
/** Temporary default for a new quotation's validity date (PRD Q18 open). */
export const DEFAULT_QUOTE_VALIDITY_DAYS = 30;

const bantSchema = z.object({
  passMark: z.number().int(),
  weights: z.object({
    budget: z.number().int(),
    authority: z.number().int(),
    need: z.number().int(),
    timeline: z.number().int(),
  }),
});
const thresholdSchema = z.number().min(0).max(100);
const validitySchema = z.number().int().min(1).max(365);

/**
 * Typed access to the few settings the sales workflow reads. A missing or unreadable row falls back to the
 * documented default, and says so (`isDefault`), so a temporary default is never mistaken for a decision.
 */
@Injectable()
export class SettingsService {
  constructor(private readonly settings: SettingsRepository) {}

  async bant(): Promise<BantSettings & { isDefault: boolean }> {
    const parsed = bantSchema.safeParse(await this.settings.read(SETTING_KEYS.bant));
    return parsed.success
      ? { ...parsed.data, isDefault: false }
      : { ...DEFAULT_BANT_SETTINGS, isDefault: true };
  }

  async bantDto(): Promise<QualificationSettingsDto> {
    const { isDefault, ...settings } = await this.bant();
    return { ...settings, isDefault };
  }

  async discountThresholdPercent(): Promise<number> {
    const parsed = thresholdSchema.safeParse(
      await this.settings.read(SETTING_KEYS.discountThresholdPercent),
    );
    return parsed.success ? parsed.data : DEFAULT_DISCOUNT_THRESHOLD_PERCENT;
  }

  async quoteValidityDays(): Promise<number> {
    const parsed = validitySchema.safeParse(
      await this.settings.read(SETTING_KEYS.quoteValidityDays),
    );
    return parsed.success ? parsed.data : DEFAULT_QUOTE_VALIDITY_DAYS;
  }
}
