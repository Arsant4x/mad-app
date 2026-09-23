import { Global, Module } from '@nestjs/common';
import { PlatformDecisionsController } from './platform-decisions.controller';
import { PlatformDecisionsService } from './platform-decisions.service';

/**
 * **قراراتُ المنصّة الحرجة** (`ق-١٣١٨` · ⑪A1).
 *
 * `@Global` لأن **المستهلكين موزّعون** — الحذفُ في وحدته والاشتراكُ في وحدته — و**البوّابةُ
 * واحدة**: لو حُقنت بالاستيراد في كلِّ وحدةٍ لصار نسيانُ الاستيراد نسياناً للحراسة.
 */
@Global()
@Module({
  controllers: [PlatformDecisionsController],
  providers: [PlatformDecisionsService],
  exports: [PlatformDecisionsService],
})
export class PlatformModule {}
