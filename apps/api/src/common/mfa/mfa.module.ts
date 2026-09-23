import { Global, Module } from '@nestjs/common';
import { MfaController } from './mfa.controller';
import { MfaService } from './mfa.service';

/**
 * **المصادقةُ المتعدّدة** (`ق-١٣١٨` · ⑨A1).
 *
 * `@Global` لأن **مسارَ الدخول يستهلكها** (`AuthService`) وشاشتُها تستهلكها — **وبوّابةُ
 * الدخول واحدة**: استيرادٌ يُنسى هنا يعني دخولاً بلا عاملٍ ثانٍ.
 */
@Global()
@Module({
  controllers: [MfaController],
  providers: [MfaService],
  exports: [MfaService],
})
export class MfaModule {}
