import { Module } from '@nestjs/common';
import { LeadsModule } from '../leads/leads.module.js';
import { TorsModule } from '../tors/tors.module.js';
import { QuotationPdfUseCase } from './application/quotation-pdf.use-case.js';
import { QuotationsUseCases } from './application/quotations.use-cases.js';
import { QuotationsRepository } from './infrastructure/quotations.repository.js';
import { QuotationsController } from './presentation/quotations.controller.js';

@Module({
  imports: [LeadsModule, TorsModule],
  controllers: [QuotationsController],
  providers: [QuotationsUseCases, QuotationPdfUseCase, QuotationsRepository],
  exports: [QuotationsUseCases],
})
export class QuotationsModule {}
