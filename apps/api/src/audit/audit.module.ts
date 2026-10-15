import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditController } from './audit.controller';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';
import { PlatformAuditController } from './platform-audit.controller';
import { PlatformAuditService } from './platform-audit.service';

/**
 * Global so the interceptor covers every controller in the app — the whole
 * point is that no endpoint can quietly escape the trail. PlatformAuditService
 * is exported for the platform admin guard, which every platform route uses.
 */
@Global()
@Module({
  controllers: [AuditController, PlatformAuditController],
  providers: [AuditService, PlatformAuditService, { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
  exports: [AuditService, PlatformAuditService],
})
export class AuditModule {}
