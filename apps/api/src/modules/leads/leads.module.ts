import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { CompaniesModule } from '../companies/companies.module.js';
import { LeadDuplicatesService } from './application/lead-duplicates.service.js';
import { LeadReminderProcessor } from './application/lead-reminder-processor.js';
import { LeadsUseCases } from './application/leads.use-cases.js';
import { LeadRevisitProcessor } from './application/lead-revisit-processor.js';
import { LeadRemindersRepository } from './infrastructure/lead-reminders.repository.js';
import { LeadsRepository } from './infrastructure/leads.repository.js';
import { LeadsController } from './presentation/leads.controller.js';

@Module({
  imports: [AuditModule, CompaniesModule],
  controllers: [LeadsController],
  providers: [
    LeadsUseCases,
    LeadsRepository,
    LeadRemindersRepository,
    LeadDuplicatesService,
    LeadRevisitProcessor,
    LeadReminderProcessor,
  ],
  exports: [LeadRevisitProcessor, LeadReminderProcessor],
})
export class LeadsModule {}
