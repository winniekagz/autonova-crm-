import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { z } from 'zod';
import { AppModule } from '../app.module.js';
import { RetentionUseCases } from '../modules/activities/application/retention.use-cases.js';
import { retentionApprovalSchema } from '../modules/activities/presentation/activities.schemas.js';

/**
 * Reviewed retention of GPS check-ins and voice notes (docs/flows/sales-activities.md). Nothing here runs on
 * a schedule and nothing is deleted without a person approving a specific list.
 *
 *   review (default)  Lists what is past its retention period and whether a hold protects it. Changes nothing.
 *                     pnpm --silent --filter @autonova/api run retention:review > due.json
 *
 *   purge             Acts only on the items in RETENTION_ITEMS_FILE (edit due.json down to what was approved),
 *                     and only as an active Director who owns the decision:
 *                     RETENTION_APPROVER_EMAIL=... RETENTION_REFERENCE="..." RETENTION_REASON="..." \
 *                       RETENTION_ITEMS_FILE=approved.json pnpm --filter @autonova/api run retention:purge
 *
 * Held reports are skipped and counted. Exit code 1 when any item failed.
 */
const mode = process.argv[2] ?? 'review';
const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
const retention = app.get(RetentionUseCases);

async function purge(): Promise<void> {
  const env = z
    .object({
      email: z.string().min(3),
      reference: z.string().min(1),
      reason: z.string().min(1),
      file: z.string().min(1),
    })
    .safeParse({
      email: process.env.RETENTION_APPROVER_EMAIL,
      reference: process.env.RETENTION_REFERENCE,
      reason: process.env.RETENTION_REASON,
      file: process.env.RETENTION_ITEMS_FILE,
    });
  if (!env.success) {
    console.error(
      'Set RETENTION_APPROVER_EMAIL, RETENTION_REFERENCE, RETENTION_REASON and RETENTION_ITEMS_FILE.',
    );
    process.exitCode = 1;
    return;
  }
  const approver = await retention.activeDirectorByEmail(env.data.email);
  if (!approver) {
    console.error('The approver must be an active Director.');
    process.exitCode = 1;
    return;
  }
  const listed = z
    .object({ candidates: z.array(z.record(z.string(), z.unknown())) })
    .or(z.array(z.record(z.string(), z.unknown())))
    .safeParse(JSON.parse(await readFile(env.data.file, 'utf8')));
  const rows = listed.success
    ? 'candidates' in listed.data
      ? listed.data.candidates
      : listed.data
    : [];
  const parsed = retentionApprovalSchema.safeParse({
    items: rows.map((row) => ({
      kind: row.kind,
      activityId: row.activityId,
      ...(typeof row.attachmentId === 'string' ? { attachmentId: row.attachmentId } : {}),
    })),
    reference: env.data.reference,
    reason: env.data.reason,
  });
  if (!parsed.success) {
    console.error('The items file is not a valid approved list (1 to 100 items):');
    for (const issue of parsed.error.issues)
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    process.exitCode = 1;
    return;
  }
  const outcome = await retention.purge(parsed.data, approver);
  console.log(JSON.stringify(outcome, null, 2));
  if (outcome.failed > 0) process.exitCode = 1;
}

try {
  if (mode === 'purge') await purge();
  else if (mode === 'review') console.log(JSON.stringify(await retention.review(), null, 2));
  else {
    console.error('Usage: retention review | retention purge');
    process.exitCode = 1;
  }
} catch (error) {
  Logger.error(error, 'Retention');
  process.exitCode = 1;
} finally {
  await app.close();
}
