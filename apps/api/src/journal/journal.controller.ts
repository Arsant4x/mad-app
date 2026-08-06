import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { JournalService } from './journal.service';

@Controller('journal')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('journal')
export class JournalController {
  constructor(private readonly journalService: JournalService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.journalService.list(tenant.companyId, tenant.allowedBranchIds);
  }

  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateJournalEntryDto) {
    return this.journalService.create(tenant.companyId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.journalService.remove(tenant.companyId, id);
  }
}
