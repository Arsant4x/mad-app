import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { IntegrationUsageService } from './integration-usage.service';

/**
 * **عامّةٌ عمداً** (`ق-١٢٩١` · ي/⑫A3): `JwtAuthGuard` صار يعتمد على `ApiKeysService`،
 * وهو مذكورٌ في **تسعةٍ وأربعين متحكّماً** في وحداتٍ شتّى — فلولا العموم لوجب استيرادُ
 * الوحدة في كلٍّ منها. والسابقةُ قائمة: `PrismaModule` · `TenantPrismaModule` ·
 * `AuditModule` · `SupportAccessModule` كلُّها `@Global()` للسبب نفسِه.
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService, IntegrationUsageService],
  exports: [ApiKeysService, IntegrationUsageService],
})
export class ApiKeysModule {}
