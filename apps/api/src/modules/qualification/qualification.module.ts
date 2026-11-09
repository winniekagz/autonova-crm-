import { Module } from '@nestjs/common';
import { LeadsModule } from '../leads/leads.module.js';
import { QualificationUseCases } from './application/qualification.use-cases.js';
import { QualificationRepository } from './infrastructure/qualification.repository.js';
import { QualificationController } from './presentation/qualification.controller.js';

@Module({
  imports: [LeadsModule],
  controllers: [QualificationController],
  providers: [QualificationUseCases, QualificationRepository],
})
export class QualificationModule {}
