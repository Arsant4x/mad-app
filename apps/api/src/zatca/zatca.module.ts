import { Module } from '@nestjs/common';
import { ZatcaController } from './zatca.controller';
import { ZatcaOnboardingService } from './zatca-onboarding.service';
import { ZatcaService } from './zatca.service';

@Module({
  controllers: [ZatcaController],
  providers: [ZatcaService, ZatcaOnboardingService],
  // يُصدَّر ليستهلكه موزّع الطابور — فالإرسال صار حدثاً مؤجَّلاً لا نقرةً يدوية.
  exports: [ZatcaService],
})
export class ZatcaModule {}
