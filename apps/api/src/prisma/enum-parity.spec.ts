import { UserStatus as SharedUserStatus, enumValues } from '@autonova/enums';
import { describe, expect, it } from 'vitest';
import { UserStatus as PrismaUserStatus } from '../generated/prisma/enums.js';

// Prisma's schema cannot import TypeScript, so shared enums that mirror a database enum are
// pinned here (ADR-004). Add a case whenever a persisted enum is shared.
describe('shared enums match database enums', () => {
  it('UserStatus', () => {
    expect(Object.values(PrismaUserStatus).sort()).toEqual(enumValues(SharedUserStatus).sort());
  });
});
