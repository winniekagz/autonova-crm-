import { Global, Module } from '@nestjs/common';
import { SettingsService } from './application/settings.service.js';
import { NumberSequenceRepository } from './infrastructure/number-sequence.repository.js';
import { SettingsRepository } from './infrastructure/settings.repository.js';

@Global()
@Module({
  providers: [SettingsService, SettingsRepository, NumberSequenceRepository],
  exports: [SettingsService, SettingsRepository, NumberSequenceRepository],
})
export class SettingsModule {}
