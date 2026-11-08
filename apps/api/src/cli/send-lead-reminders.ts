import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { LeadReminderProcessor } from '../modules/leads/application/lead-reminder-processor.js';

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error', 'warn', 'log'],
});
try {
  const result = await app.get(LeadReminderProcessor).processDue();
  // Non-zero when anything needs a person's attention, so the scheduler surfaces it.
  if (result.failed > 0) process.exitCode = 1;
} catch (error) {
  Logger.error(error, 'SendLeadReminders');
  process.exitCode = 1;
} finally {
  await app.close();
}
