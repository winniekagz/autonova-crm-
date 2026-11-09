import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';

type Db = Prisma.TransactionClient;

/**
 * Managed number series ("TOR-2026-0001"). One atomic upsert per number, inside the caller's transaction,
 * so two simultaneous requests can never receive the same number, and a rolled-back transaction does not
 * burn one. Counters restart each calendar year (UTC); the format is a working default (PRD Q18 open).
 */
@Injectable()
export class NumberSequenceRepository {
  async next(db: Db, series: string, at: Date = new Date()): Promise<string> {
    const year = at.getUTCFullYear();
    const rows = await db.$queryRaw<{ last_value: number }[]>`
      INSERT INTO "number_sequences" ("series", "year", "last_value") VALUES (${series}, ${year}, 1)
      ON CONFLICT ("series", "year") DO UPDATE SET "last_value" = "number_sequences"."last_value" + 1
      RETURNING "last_value"`;
    const value = rows[0]?.last_value;
    if (value === undefined) throw new Error('number sequence returned no value');
    return `${series}-${year}-${String(value).padStart(4, '0')}`;
  }
}
