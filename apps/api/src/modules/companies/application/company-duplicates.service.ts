import { ConflictException, Injectable } from '@nestjs/common';
import type { CompanyDuplicateCheckResult } from '@autonova/contracts';
import { normalizeCompanyName } from '../../../common/match-keys.js';
import type { AuthenticatedUser } from '../../auth/domain/authenticated-user.js';
import { isDefiniteDuplicate, normalizeKraPin, type CompanyKeys } from '../domain/company-rules.js';
import { CompaniesRepository } from '../infrastructure/companies.repository.js';
import type { CompanyDuplicateCheckBody } from '../presentation/companies.schemas.js';
import { companyVisibility } from './company-scope.js';

export const COMPANY_KRA_PIN_EXISTS = {
  code: 'COMPANY_KRA_PIN_EXISTS',
  message:
    'A company with this KRA PIN already exists. Open the existing company instead of creating another; if you cannot see it, ask a Director.',
};
export const COMPANY_DUPLICATE_SUSPECTED = {
  code: 'COMPANY_DUPLICATE_SUSPECTED',
  message:
    'A company with the same name already exists. Review the matches, then confirm to save anyway.',
};

/**
 * Duplicate policy (decision: docs/flows/companies-and-contacts.md): the same KRA PIN is the same legal
 * entity, so saving is refused; a matching or near-identical name only warns and can be confirmed.
 * Matching runs over every company, so a user who cannot see a company still cannot create a twin of it,
 * but such a match is only counted: never named, and never labelled "exact".
 */
@Injectable()
export class CompanyDuplicatesService {
  constructor(private readonly companies: CompaniesRepository) {}

  keysOf(input: { name?: string | null; kraPin?: string | null }): CompanyKeys {
    return { kraPin: normalizeKraPin(input.kraPin), name: normalizeCompanyName(input.name) };
  }

  async check(
    input: CompanyDuplicateCheckBody,
    user: AuthenticatedUser,
  ): Promise<CompanyDuplicateCheckResult> {
    const { exact, potential, hiddenMatchCount } = await this.find(
      this.keysOf(input),
      input.excludeCompanyId,
      user,
    );
    return { exact, potential, hiddenMatchCount };
  }

  /** Throws when a PIN matches, or when a name matches and the caller did not acknowledge it. */
  async assertAllowed(
    keys: CompanyKeys,
    excludeId: string | undefined,
    user: AuthenticatedUser,
    acknowledged: boolean,
  ): Promise<boolean> {
    const found = await this.find(keys, excludeId, user);
    const pinHit = found.exact.length > 0 || found.pinHiddenCount > 0;
    if (pinHit) throw new ConflictException(COMPANY_KRA_PIN_EXISTS);
    const nameHit = found.potential.length > 0 || found.hiddenMatchCount > 0;
    if (!nameHit) return false;
    if (!acknowledged) throw new ConflictException(COMPANY_DUPLICATE_SUSPECTED);
    return true;
  }

  private async find(
    keys: CompanyKeys,
    excludeId: string | undefined,
    user: AuthenticatedUser,
  ): Promise<CompanyDuplicateCheckResult & { pinHiddenCount: number }> {
    const rows = await this.companies.findDuplicates(keys, excludeId);
    const seen = await this.companies.visibleIds(
      rows.map((row) => row.id),
      companyVisibility(user),
    );
    const exact = [];
    const potential = [];
    let pinHiddenCount = 0;
    let hiddenMatchCount = 0;
    for (const row of rows) {
      const candidate = this.companies.candidateOf(row, keys);
      const definite = isDefiniteDuplicate(candidate.matchedOn);
      if (!seen.has(row.id)) {
        if (definite) pinHiddenCount += 1;
        else hiddenMatchCount += 1;
      } else if (definite) exact.push(candidate);
      else potential.push(candidate);
    }
    return {
      exact,
      potential,
      hiddenMatchCount: hiddenMatchCount + pinHiddenCount,
      pinHiddenCount,
    };
  }
}
