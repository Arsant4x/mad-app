import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/** شقُّ الصحّة (`ق-١٣١٨` · ⑪A3) — بلا مزوّدين: `PrismaService` عالميّ، والمخزنُ عميلٌ خاصٌّ بالفحص. */
@Module({ controllers: [HealthController] })
export class HealthModule {}
