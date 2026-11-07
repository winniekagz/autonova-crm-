import type { Db } from './auth.repository.js';

/**
 * Serialises every operation that can change WHO IS AN ACTIVE DIRECTOR (bootstrap, role changes,
 * disabling). Each of them reads "how many other active Directors are there?" and then writes; without
 * a lock two concurrent requests can both read "one other" and both proceed, leaving none.
 * Transaction-scoped: released automatically on commit or rollback.
 */
const DIRECTOR_SET_LOCK_KEY = 7_204_001;

export async function lockDirectorSet(tx: Db): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${DIRECTOR_SET_LOCK_KEY})`;
}
