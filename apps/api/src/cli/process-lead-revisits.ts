import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { LeadRevisitProcessor } from '../modules/leads/application/lead-revisit-processor.js';

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['error', 'warn', 'log'],
});
try {
  const processor = app.get(LeadRevisitProcessor);
  const result = await processor.processDue();
  if (result.failed > 0) process.exitCode = 1;
} catch (error) {
  Logger.error(error, 'ProcessLeadRevisits');
  process.exitCode = 1;
} finally {
  await app.close();
}
