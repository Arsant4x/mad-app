import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { ListJournalQueryDto } from './dto/list-journal-query.dto';
import { JournalService } from './journal.service';

@Controller('journal')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('journal')
export class JournalController {
  constructor(private readonly journalService: JournalService) {}

  @Get()
  @RequiresAction('view')
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListJournalQueryDto) {
    return this.journalService.list(tenant.companyId, tenant.allowedBranchIds, query);
  }

  @Post()
  @RequiresAction('record')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateJournalEntryDto) {
    return this.journalService.create(tenant.companyId, tenant.allowedBranchIds, dto);
  }

  @Delete(':id')
  @RequiresAction('delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.journalService.remove(tenant.companyId, id);
  }
}
