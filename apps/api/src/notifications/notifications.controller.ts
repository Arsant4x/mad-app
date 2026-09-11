import { Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { AllowWhileConsentPending } from '../common/tenant/allow-while-consent-pending.decorator';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { NoAudit } from '../audit/no-audit.decorator';
import { EscalationService } from './escalation.service';
import { NotificationsService } from './notifications.service';

/**
 * Deliberately **not** behind `@RequiresScreen`. Every screen shows the bell,
 * and a notification is already filtered to what its recipient may see — gating
 * it on some other screen's permission would hide a manager's own escalations
 * from them.
 */
// ⭐ **وبها يعرف لماذا مُنع** (`ق-٥٨٩`): التذكيرُ المتكرّر يصل عبر الإشعارات، فقطعُها عمّن
// ينتظر قبولَه يجعل المنعَ بلا سبب يُقرأ.
@AllowWhileConsentPending()
@Controller('notifications')
@UseGuards(JwtAuthGuard, TenantGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly escalationService: EscalationService,
  ) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext, @Query('unread') unread?: string) {
    return this.notificationsService.list(tenant, unread === 'true');
  }

  /** The badge count on its own — polled far more often than the list. */
  @Get('unread-count')
  unreadCount(@CurrentTenant() tenant: TenantContext) {
    return this.notificationsService.unreadCount(tenant);
  }

  @Patch(':id/read')
  @NoAudit()
  markRead(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.notificationsService.markRead(tenant, id);
  }

  @Post('read-all')
  @NoAudit()
  markAllRead(@CurrentTenant() tenant: TenantContext) {
    return this.notificationsService.markAllRead(tenant);
  }

  /**
   * Runs the escalation check now, for this company only.
   *
   * Exists because a daily job the owner cannot see or trigger is a daily job
   * they have no reason to trust. Idempotent, so pressing it twice changes
   * nothing.
   */
  @Post('run-escalation')
  @NoAudit()
  runEscalation(@CurrentTenant() tenant: TenantContext, @Query('contractId') contractId?: string) {
    return this.escalationService.runForCompany(tenant.companyId, contractId);
  }

  /**
   * Runs the warranty-expiry check now, for this company only.
   *
   * Same rationale as run-escalation: a daily job the owner cannot trigger is
   * one they cannot trust. Idempotent — one warning per warranty, ever.
   */
  @Post('run-warranty-check')
  @NoAudit()
  runWarrantyCheck(@CurrentTenant() tenant: TenantContext) {
    return this.escalationService.warrantyExpiryForCompany(tenant.companyId);
  }
}
