import { SystemRoleKey, UserStatus } from '@autonova/enums';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { beforeEach } from 'vitest';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { createVerifiedDirector } from './helpers.js';

/** Keys that must never appear anywhere in a user-administration response. */
export const SENSITIVE =
  /passwordHash|password_hash|argon2|refreshToken|mfaSecret|recovery|token|secret/i;

/**
 * The last-Director rules count ALL active Directors in the database, and earlier tests (and other
 * suites) leave some behind. Call inside a `describe` to disable every Director the current test
 * does not own, so each test controls exactly who is an active Director.
 */
export function useDirectorIsolation(
  getApp: () => NestExpressApplication,
  getPrisma: () => PrismaService,
) {
  let owned: string[] = [];
  beforeEach(() => {
    owned = [];
  });

  const isolateDirectors = async () => {
    await getPrisma().user.updateMany({
      where: {
        id: { notIn: owned },
        roles: { some: { role: { key: SystemRoleKey.Director } } },
        status: UserStatus.Active,
      },
      data: { status: UserStatus.Disabled },
    });
  };

  /** A MFA-verified Director who is the only active Director apart from those the test adds. */
  const directorActor = async () => {
    const { director, token } = await createVerifiedDirector(getApp());
    owned.push(director.id);
    await isolateDirectors();
    return { director, token };
  };
  /** Marks a user the test created as a Director it owns, so isolation leaves them active. */
  const own = (userId: string) => {
    owned.push(userId);
  };
  const ownedIds = () => owned;

  return { directorActor, own, ownedIds };
}
