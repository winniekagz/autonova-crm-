import { Module } from '@nestjs/common';
import { ClientsRepository } from './infrastructure/clients.repository.js';
import { ClientsController } from './presentation/clients.controller.js';

@Module({
  controllers: [ClientsController],
  providers: [ClientsRepository],
  exports: [ClientsRepository],
})
export class ClientsModule {}
