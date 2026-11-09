import { Module } from '@nestjs/common';
import { PipelineController } from './pipeline.controller.js';
import { PipelineService } from './pipeline.service.js';

@Module({ controllers: [PipelineController], providers: [PipelineService] })
export class PipelineModule {}
