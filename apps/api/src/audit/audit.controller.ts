import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { AuditService } from './audit.service';

/**
 * Read-only by design: there is no endpoint to edit or delete an entry, because
 * a trail somebody can rewrite proves nothing.
 *
 * Gated by the `audit` action on the `audit` screen — this is what finally makes
 * that permission mean something concrete rather than sit in a list.
 */
@Controller('audit-log')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequiresAction('audit')
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query('actorId') actorId?: string,
    @Query('screen') screen?: string,
    @Query('action') action?: string,
    @Query('entityId') entityId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.auditService.list(tenant.companyId, {
      actorId,
      screen,
      action,
      entityId,
      from,
      to,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
