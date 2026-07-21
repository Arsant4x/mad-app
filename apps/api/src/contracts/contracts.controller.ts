import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { ContractsService } from './contracts.service';
import { CancelContractDto } from './dto/cancel-contract.dto';
import { CreateContractDto } from './dto/create-contract.dto';
import { RecordPaymentDto } from './dto/record-payment.dto';
import { UpdateContractDto } from './dto/update-contract.dto';

@Controller('contracts')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.contractsService.list(tenant.companyId);
  }

  @Get(':id')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.contractsService.findOne(tenant.companyId, id);
  }

  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateContractDto) {
    return this.contractsService.create(tenant.companyId, dto);
  }

  @Patch(':id')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateContractDto) {
    return this.contractsService.update(tenant.companyId, id, dto);
  }

  @Post(':id/cancel')
  cancel(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: CancelContractDto) {
    return this.contractsService.cancel(tenant.companyId, id, dto);
  }

  @Post(':id/payments')
  recordPayment(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: RecordPaymentDto) {
    return this.contractsService.recordPayment(tenant.companyId, id, dto);
  }
}
