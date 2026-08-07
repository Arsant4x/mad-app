import { Global, Module } from '@nestjs/common';
import { SupportAccessAdminController, SupportAccessOwnerController } from './support-access.controller';
import { SupportAccessService } from './support-access.service';

/**
 * Global لأن TenantGuard — المعلن في كل متحكم مستأجر — يحتاج الخدمة ليتحقق
 * من نافذة الدعم ويسجّل كل طلب؛ جعلها عالمية يجنّب استيرادها في ٣٠ وحدة.
 */
@Global()
@Module({
  controllers: [SupportAccessAdminController, SupportAccessOwnerController],
  providers: [SupportAccessService],
  exports: [SupportAccessService],
})
export class SupportAccessModule {}
