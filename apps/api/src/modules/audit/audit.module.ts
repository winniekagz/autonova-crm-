import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service.js';

/** Foundational infrastructure: every business module writes audit events through this service. */
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
