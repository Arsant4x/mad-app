import { Module } from '@nestjs/common';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import { DelegationsController } from './delegations.controller';
import { DelegationsService } from './delegations.service';

// `TenantPrismaModule` و`PrismaModule` عامّتان (`@Global`) — لا تُستورَدان.
@Module({
  controllers: [PermissionsController, DelegationsController],
  providers: [PermissionsService, DelegationsService],
  // تُصدَّر لـ`TasksModule`: `canOpenTarget` يُشتقّ من **نفس** المصدر الذي
  // تقرأه الواجهة — لا نسخةَ حسابٍ ثانية تفترق عنه بلا شكوى.
  exports: [PermissionsService],
})
export class PermissionsModule {}
