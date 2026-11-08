import { Module } from '@nestjs/common';
import { LeadsModule } from '../leads/leads.module.js';
import { ActivitiesUseCases } from './application/activities.use-cases.js';
import { AttachmentsUseCases } from './application/attachments.use-cases.js';
import { RetentionUseCases } from './application/retention.use-cases.js';
import { ActivitiesRepository } from './infrastructure/activities.repository.js';
import { AttachmentsRepository } from './infrastructure/attachments.repository.js';
import { RetentionRepository } from './infrastructure/retention.repository.js';
import { ActivitiesController } from './presentation/activities.controller.js';
import { AttachmentUploadInterceptor } from './presentation/upload.interceptor.js';

@Module({
  imports: [LeadsModule],
  controllers: [ActivitiesController],
  providers: [
    AttachmentUploadInterceptor,
    ActivitiesUseCases,
    AttachmentsUseCases,
    RetentionUseCases,
    ActivitiesRepository,
    AttachmentsRepository,
    RetentionRepository,
  ],
  exports: [RetentionUseCases],
})
export class ActivitiesModule {}
