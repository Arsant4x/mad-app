import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards , Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { SetArchivedDto } from '../common/dto/set-archived.dto';
import { CreateScriptDto } from './dto/create-script.dto';
import { UpdateScriptDto } from './dto/update-script.dto';
import { ScriptsService } from './scripts.service';

@Controller('scripts')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('scripts')
export class ScriptsController {
  constructor(private readonly scriptsService: ScriptsService) {}

  @Get()
  @RequiresAction('view')
  list(@CurrentTenant() tenant: TenantContext, @Query('includeArchived') includeArchived?: string) {
    return this.scriptsService.list(tenant.companyId, includeArchived === 'true');
  }

  @Post()
  @RequiresAction('add')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateScriptDto) {
    return this.scriptsService.create(tenant.companyId, dto);
  }

  @Patch(':id')
  @RequiresAction('edit')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateScriptDto) {
    return this.scriptsService.update(tenant.companyId, id, dto);
  }

  /** أرشفة/إلغاء أرشفة — يخفيه من القوائم اليومية ويبقيه في الحسابات. */
  @Patch(':id/archive')
  @RequiresAction('edit')
  setArchived(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: SetArchivedDto) {
    return this.scriptsService.setArchived(tenant.companyId, id, dto.archived);
  }

  @Delete(':id')
  @RequiresAction('delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.scriptsService.remove(tenant.companyId, id);
  }
}
