import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CompanyWideFigures } from '../common/tenant/company-wide-figures.decorator';
import { AuditService } from './audit.service';
import { ListAuditQueryDto } from './dto/list-audit-query.dto';

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
  @CompanyWideFigures('أثرُ كلِّ تغييرٍ في المنشأة كلِّها بفاعله ومستنده، لا يحمل فرعاً فلا يُقصر على فروع القارئ')
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListAuditQueryDto) {
    return this.auditService.list(tenant.companyId, query);
  }
}
