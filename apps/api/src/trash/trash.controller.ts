import { Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { TrashService } from './trash.service';

/**
 * سلة المحذوفات. Gated by the `audit` screen: seeing and undoing other
 * people's deletions is oversight, not day-to-day work.
 */
@Controller('trash')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('audit')
export class TrashController {
  constructor(private readonly trashService: TrashService) {}

  @Get()
  @RequiresAction('view')
  list(@CurrentTenant() tenant: TenantContext) {
    return this.trashService.list(tenant.companyId);
  }

  @Post(':entity/:id/restore')
  @RequiresAction('review')
  restore(@CurrentTenant() tenant: TenantContext, @Param('entity') entity: string, @Param('id') id: string) {
    return this.trashService.restore(tenant.companyId, entity, id);
  }

  /** Permanent, on explicit instruction — the one delete with no way back. */
  @Delete(':entity/:id')
  @HttpCode(204)
  @RequiresAction('delete')
  purge(@CurrentTenant() tenant: TenantContext, @Param('entity') entity: string, @Param('id') id: string) {
    return this.trashService.purge(tenant.companyId, entity, id);
  }
}
