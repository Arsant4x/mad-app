import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { ReservationsService } from './reservations.service';

@Controller('reservations')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('properties')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.reservationsService.list(tenant.companyId);
  }

  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateReservationDto) {
    return this.reservationsService.create(tenant.companyId, dto);
  }

  @Patch(':id/cancel')
  cancel(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.reservationsService.cancel(tenant.companyId, id);
  }
}
