import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards , Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { SetArchivedDto } from '../common/dto/set-archived.dto';
import { BanksService } from './banks.service';
import { CreateBankDto } from './dto/create-bank.dto';
import { UpdateBankDto } from './dto/update-bank.dto';

@Controller('banks')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('banks')
export class BanksController {
  constructor(private readonly banksService: BanksService) {}

  @Get()
  @RequiresAction('view')
  list(@CurrentTenant() tenant: TenantContext, @Query('includeArchived') includeArchived?: string) {
    return this.banksService.list(tenant.companyId, tenant.allowedBranchIds, includeArchived === 'true');
  }

  /**
   * سقفُ نطاق رموز البنوك (`ق-٢٩٥`) — **يُنذر قبل الاصطدام لا عنده**.
   *
   * وموضعُه هنا لا في `accounts`: **من يرى البنوك قد لا يرى الدليل**، وإنذارٌ
   * خلف شاشةٍ لا يفتحها صاحبُ الشأن إنذارٌ لا يصل. **ومسارٌ ثابتٌ قبل `:id`**
   * كي لا يبتلعه المُعرِّف.
   */
  @Get('code-band')
  @RequiresAction('view')
  codeBand(@CurrentTenant() tenant: TenantContext) {
    return this.banksService.codeBand(tenant.companyId);
  }

  @Post()
  @RequiresAction('add')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateBankDto) {
    return this.banksService.create(tenant.companyId, tenant.allowedBranchIds, dto);
  }

  @Patch(':id')
  @RequiresAction('edit')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateBankDto) {
    return this.banksService.update(tenant.companyId, id, dto);
  }

  /** أرشفة/إلغاء أرشفة — يخفيه من القوائم اليومية ويبقيه في الحسابات. */
  @Patch(':id/archive')
  @RequiresAction('edit')
  setArchived(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: SetArchivedDto) {
    return this.banksService.setArchived(tenant.companyId, id, dto.archived);
  }

  @Delete(':id')
  @RequiresAction('delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.banksService.remove(tenant.companyId, id);
  }
}
