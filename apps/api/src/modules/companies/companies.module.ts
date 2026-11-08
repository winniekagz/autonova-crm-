import { Module } from '@nestjs/common';
import { CompaniesUseCases } from './application/companies.use-cases.js';
import { CompanyDuplicatesService } from './application/company-duplicates.service.js';
import { ContactsUseCases } from './application/contacts.use-cases.js';
import { CompaniesRepository } from './infrastructure/companies.repository.js';
import { ContactsRepository } from './infrastructure/contacts.repository.js';
import { CompaniesController } from './presentation/companies.controller.js';
import { ContactsController } from './presentation/contacts.controller.js';

@Module({
  controllers: [CompaniesController, ContactsController],
  providers: [
    CompaniesUseCases,
    CompanyDuplicatesService,
    ContactsUseCases,
    CompaniesRepository,
    ContactsRepository,
  ],
  exports: [CompaniesRepository, ContactsRepository],
})
export class CompaniesModule {}
