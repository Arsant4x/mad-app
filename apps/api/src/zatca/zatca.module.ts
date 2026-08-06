import { Module } from '@nestjs/common';
import { ZatcaController } from './zatca.controller';
import { ZatcaOnboardingService } from './zatca-onboarding.service';
import { ZatcaService } from './zatca.service';

@Module({
  controllers: [ZatcaController],
  providers: [ZatcaService, ZatcaOnboardingService],
})
export class ZatcaModule {}
