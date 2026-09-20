import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { AllowWhileInactive } from '../common/tenant/allow-while-frozen.decorator';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { OwnerOnly } from '../common/tenant/owner-only.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { RenewSubscriptionDto } from './dto/renew-subscription.dto';
import { SubscriptionService } from './subscription.service';

/**
 * The tenant's own subscription. Marked @AllowWhileInactive so a frozen or
 * stopped company can still see its state and renew from inside the platform —
 * the whole point of the requirement (no contacting the provider). The
 * subscription is the owner's (`§3.5`): declared in the guard (`@OwnerOnly` —
 * the shell shows the link to the owner alone) and renewal is asserted again
 * in the service (`ق-١١٩٨`/①).
 */
@Controller('subscription')
@UseGuards(JwtAuthGuard, TenantGuard)
@AllowWhileInactive()
@OwnerOnly()
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get()
  status(@CurrentTenant() tenant: TenantContext) {
    return this.subscriptionService.status(tenant.companyId);
  }

  @Post('renew')
  renew(@CurrentTenant() tenant: TenantContext, @Body() dto: RenewSubscriptionDto) {
    return this.subscriptionService.renew(tenant.companyId, tenant.actorType, dto.months);
  }
}
