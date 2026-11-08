import { ConflictException, Injectable } from '@nestjs/common';
import type { LeadDuplicateCheckResult } from '@autonova/contracts';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user.js';
import {
  matchedOn,
  normalizeCompanyName,
  normalizePhone,
  type LeadKeys,
} from '../domain/lead-duplicates.js';
import { LeadsRepository } from '../infrastructure/leads.repository.js';
import type { DuplicateCheckBody } from '../presentation/leads.schemas.js';
import { scopeFor } from './lead-scope.js';

export const DUPLICATE_SUSPECTED = {
  code: 'LEAD_DUPLICATE_SUSPECTED',
  message:
    'A lead with the same phone number or company already exists. Review the matches, then confirm to save anyway.',
};
const MAX_LISTED = 10;

/**
 * Duplicate policy (PRD §4.1 acceptance: "warns about a possible duplicate"): a match never blocks
 * or merges. Saving is refused once, with a clear code, until the caller acknowledges the warning.
 * Matches in other people's pipelines are counted but never described to the caller.
 */
@Injectable()
export class LeadDuplicatesService {
  constructor(private readonly leads: LeadsRepository) {}

  keysOf(input: { phone?: string | null; companyName?: string | null }): LeadKeys {
    return { phone: normalizePhone(input.phone), company: normalizeCompanyName(input.companyName) };
  }

  async check(
    input: DuplicateCheckBody,
    user: AuthenticatedUser,
  ): Promise<LeadDuplicateCheckResult> {
    return this.find(this.keysOf(input), input.excludeLeadId, user);
  }

  /** True when matches exist and the caller acknowledged them; throws 409 when they did not. */
  async assertAcknowledged(
    keys: LeadKeys,
    excludeLeadId: string | undefined,
    user: AuthenticatedUser,
    acknowledged: boolean,
  ): Promise<boolean> {
    const found = await this.find(keys, excludeLeadId, user);
    if (found.candidates.length === 0 && found.hiddenMatchCount === 0) return false;
    if (!acknowledged) throw new ConflictException(DUPLICATE_SUSPECTED);
    return true;
  }

  private async find(
    keys: LeadKeys,
    excludeLeadId: string | undefined,
    user: AuthenticatedUser,
  ): Promise<LeadDuplicateCheckResult> {
    const rows = await this.leads.findDuplicateCandidates(keys, excludeLeadId);
    const scope = scopeFor(user);
    const visible = rows.filter((row) => !scope || row.ownerUserId === scope);
    return {
      candidates: visible.slice(0, MAX_LISTED).map((row) => ({
        id: row.id,
        name: row.name,
        companyName: row.companyName,
        phone: row.phone,
        stage: row.stage,
        ownerName: row.owner.fullName,
        matchedOn: matchedOn(row, keys),
        createdAt: row.createdAt.toISOString(),
      })),
      hiddenMatchCount: rows.length - visible.length,
    };
  }
}
