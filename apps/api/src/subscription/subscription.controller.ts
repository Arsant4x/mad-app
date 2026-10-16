import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { AllowWhileInactive } from '../common/tenant/allow-while-frozen.decorator';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { MSG } from '../common/i18n/messages';
import { OwnerOnly } from '../common/tenant/owner-only.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { SubscriptionService } from './subscription.service';

/**
 * The tenant's own subscription, read only. Marked @AllowWhileInactive so a frozen or stopped company
 * can still see its state. There is no renewal here: subscription time is never granted without
 * payment. The subscription is the owner's, declared in the guard with `@OwnerOnly`.
 */
@Controller('subscription')
@UseGuards(JwtAuthGuard, TenantGuard)
@AllowWhileInactive()
@OwnerOnly(MSG.sub_owner_only)
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get()
  status(@CurrentTenant() tenant: TenantContext) {
    return this.subscriptionService.status(tenant.companyId);
  }
}
