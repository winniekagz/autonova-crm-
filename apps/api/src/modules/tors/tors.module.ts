import { Module } from '@nestjs/common';
import { ClientsModule } from '../clients/clients.module.js';
import { LeadsModule } from '../leads/leads.module.js';
import { CatalogueUseCases } from './application/catalogue.use-cases.js';
import { TorPdfUseCase } from './application/tor-pdf.use-case.js';
import { TorSigningUseCases } from './application/tor-signing.use-cases.js';
import { TorsUseCases } from './application/tors.use-cases.js';
import { CatalogueRepository } from './infrastructure/catalogue.repository.js';
import { TorsRepository } from './infrastructure/tors.repository.js';
import { CatalogueController } from './presentation/catalogue.controller.js';
import { TorsController } from './presentation/tors.controller.js';

@Module({
  imports: [LeadsModule, ClientsModule],
  controllers: [TorsController, CatalogueController],
  providers: [
    TorsUseCases,
    TorSigningUseCases,
    TorPdfUseCase,
    CatalogueUseCases,
    TorsRepository,
    CatalogueRepository,
  ],
  exports: [TorsRepository, TorsUseCases],
})
export class TorsModule {}
