import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { AllowWhileInactive } from '../common/tenant/allow-while-frozen.decorator';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { ExportService } from './export.service';

/**
 * Data export — the merchant's copy of its own data.
 *
 * @AllowWhileInactive: the grace-period rule is "view and export only", and a
 * stopped merchant deciding whether to renew or leave still owns its data.
 * Owner-only, enforced in the service.
 */
@Controller('export')
@UseGuards(JwtAuthGuard, TenantGuard)
@AllowWhileInactive()
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get()
  exportAll(@CurrentTenant() tenant: TenantContext) {
    return this.exportService.exportAll(tenant.companyId, tenant.actorType);
  }
}
