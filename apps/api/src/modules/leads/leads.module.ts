import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { LeadsUseCases } from './application/leads.use-cases.js';
import { LeadRevisitProcessor } from './application/lead-revisit-processor.js';
import { LeadsRepository } from './infrastructure/leads.repository.js';
import { LeadsController } from './presentation/leads.controller.js';

@Module({
  imports: [AuditModule],
  controllers: [LeadsController],
  providers: [LeadsUseCases, LeadsRepository, LeadRevisitProcessor],
  exports: [LeadRevisitProcessor],
})
export class LeadsModule {}
