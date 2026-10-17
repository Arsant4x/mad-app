import { Module } from '@nestjs/common';
import { ZatcaController } from './zatca.controller';
import { CertificateExpiryService } from './certificate-expiry.service';
import { ReportingDeadlineService } from './reporting-deadline.service';
import { ZatcaOnboardingService } from './zatca-onboarding.service';
import { ZatcaService } from './zatca.service';

@Module({
  controllers: [ZatcaController],
  providers: [ZatcaService, ZatcaOnboardingService, CertificateExpiryService, ReportingDeadlineService],
  // يُصدَّر ليستهلكه موزّع الطابور — فالإرسال صار حدثاً مؤجَّلاً لا نقرةً يدوية.
  exports: [ZatcaService, CertificateExpiryService],
})
export class ZatcaModule {}
