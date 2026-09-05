import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { StartOnboardingDto, SubmitOtpDto } from './dto/onboarding.dto';
import { ZatcaOnboardingService } from './zatca-onboarding.service';
import { ZatcaService } from './zatca.service';

/** No @RequiresScreen: this is the company's own tax registration, gated by
 * actor type (owner only for writes) rather than by a permission template. */
@Controller('zatca')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ZatcaController {
  constructor(
    private readonly zatcaService: ZatcaService,
    private readonly onboarding: ZatcaOnboardingService,
  ) {}

  /** Where this merchant stands in the onboarding process. Never exposes key
   * material — only whether each piece is present. */
  @Get('onboarding')
  getOnboarding(@CurrentTenant() tenant: TenantContext) {
    return this.onboarding.getStatus(tenant.companyId);
  }

  /** Step 1 — the platform generates this merchant's keypair and CSR. */
  @Post('onboarding/start')
  start(@CurrentTenant() tenant: TenantContext, @Body() dto: StartOnboardingDto) {
    return this.onboarding.start(tenant.companyId, tenant.actorType, dto);
  }

  /** Step 2 — the merchant's only manual step: the OTP from Fatoora. */
  @Post('onboarding/otp')
  submitOtp(@CurrentTenant() tenant: TenantContext, @Body() dto: SubmitOtpDto) {
    return this.onboarding.submitOtp(tenant.companyId, tenant.actorType, dto);
  }

  /** Step 3 — swap the compliance certificate for the production one. */
  @Post('onboarding/production')
  requestProduction(@CurrentTenant() tenant: TenantContext) {
    return this.onboarding.requestProductionCertificate(tenant.companyId, tenant.actorType);
  }

  @Post('invoices/:id/submit')
  submit(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.zatcaService.submitInvoice(tenant.companyId, tenant.actorType, id);
  }

  /** «صادرٌ لم يصل» — عدداً وأقدمَ وقائمةً (`ق-١٨٢`/٢). قراءةٌ لكل مستخدمي المنشأة: الكاشير يحتاج التحذير كالمالك. */
  @Get('unreported')
  unreported(@CurrentTenant() tenant: TenantContext) {
    return this.zatcaService.unreported(tenant.companyId);
  }
}
