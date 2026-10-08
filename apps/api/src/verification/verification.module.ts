import { Module } from '@nestjs/common';
import { OtpChallengesService } from './otp-challenges.service';
import { VerificationGateway } from './verification-gateway.service';

/** ⚖️ رمزُ التحقّق ومزوّدا الرسائل والهويّة (توجيه ٢٨٧) — نواةٌ يستهلكها محرّكُ النماذج، ولا تعرف نموذجاً ولا عقداً. */
@Module({
  providers: [OtpChallengesService, VerificationGateway],
  exports: [OtpChallengesService, VerificationGateway],
})
export class VerificationModule {}
