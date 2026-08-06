import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { SendReminderDto, UpdateReminderPolicyDto } from './dto/reminder.dto';
import { RemindersService } from './reminders.service';

/** Gated by the contracts screen: chasing rent is part of managing the lease,
 * not a separate permission a landlord would think to grant. */
@Controller('reminders')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('contracts')
export class RemindersController {
  constructor(private readonly remindersService: RemindersService) {}

  @Get('policy')
  getPolicy(@CurrentTenant() tenant: TenantContext) {
    return this.remindersService.getPolicy(tenant.companyId);
  }

  @Patch('policy')
  updatePolicy(@CurrentTenant() tenant: TenantContext, @Body() dto: UpdateReminderPolicyDto) {
    return this.remindersService.updatePolicy(tenant.companyId, dto);
  }

  /** The queue for today, with each message already rendered. */
  @Get('due')
  dueToday(@CurrentTenant() tenant: TenantContext, @Query('contractId') contractId?: string) {
    return this.remindersService.dueToday(tenant.companyId, contractId);
  }

  @Post('installments/:installmentId/send')
  send(@CurrentTenant() tenant: TenantContext, @Param('installmentId') installmentId: string, @Body() dto: SendReminderDto) {
    return this.remindersService.send(tenant.companyId, installmentId, dto);
  }

  @Get('installments/:installmentId/history')
  history(@CurrentTenant() tenant: TenantContext, @Param('installmentId') installmentId: string) {
    return this.remindersService.history(tenant.companyId, installmentId);
  }
}
