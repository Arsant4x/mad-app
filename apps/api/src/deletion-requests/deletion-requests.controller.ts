import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload, TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { PlatformAdminGuard } from '../common/platform-admin/platform-admin.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { AllowWhileInactive } from '../common/tenant/allow-while-frozen.decorator';
import { AllowWhileClosed } from '../common/tenant/allow-while-closed.decorator';
import { DeletionRequestDecisionDto, SubmitDeletionRequestDto } from './dto/deletion-request.dto';
import { DecisionActor, DeletionRequestsService } from './deletion-requests.service';

/**
 * Merchant side: file / follow / withdraw a deletion request — and, once closed,
 * ask to reopen (`ق-٥٤٨`).
 *
 * @AllowWhileInactive — a company whose subscription lapsed is exactly the one
 * most likely to want out; locking the exit behind an active subscription would
 * force it to pay to leave.
 *
 * @AllowWhileClosed — على أربعةٍ فقط: حالُ الطلب، وحالُ الحساب، وطلبُ إعادة الفتح، وسحبُه.
 * فالمغلقُ لا يقرأ بياناته ولا يجدّد اشتراكه — ويعود بطلبٍ وقرار.
 */
@Controller('deletion-request')
@UseGuards(JwtAuthGuard, TenantGuard)
@AllowWhileInactive()
export class DeletionRequestsController {
  constructor(private readonly service: DeletionRequestsService) {}

  @Get()
  @AllowWhileClosed()
  mine(@CurrentTenant() tenant: TenantContext) {
    return this.service.myRequest(tenant.companyId);
  }

  /** حالُ الحساب: مغلقٌ منذ متى، وحتى متى يبقى أثرُه على الأقلّ (`ق-٥٤٧`). */
  @Get('account')
  @AllowWhileClosed()
  account(@CurrentTenant() tenant: TenantContext) {
    return this.service.account(tenant.companyId);
  }

  /** نسخةُ الإغلاق (`ق-٥٥٤`): ملفّاتُها بروابطَ موقَّعة — للمالك، وهو مغلق. */
  @Get('archive')
  @AllowWhileClosed()
  archive(@CurrentTenant() tenant: TenantContext) {
    return this.service.closureArchive(tenant.companyId, tenant.actorType);
  }

  @Post()
  submit(@CurrentTenant() tenant: TenantContext, @Body() dto: SubmitDeletionRequestDto) {
    return this.service.submit(tenant.companyId, tenant.actorType, dto.reason);
  }

  @Post('reopen')
  @AllowWhileClosed()
  reopen(@CurrentTenant() tenant: TenantContext) {
    return this.service.requestReopening(tenant.companyId, tenant.actorType);
  }

  @Post(':id/cancel')
  @AllowWhileClosed()
  cancel(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.service.cancel(tenant.companyId, tenant.actorType, id);
  }
}

/** من قرّر — يُقرأ من حمولة الدخول كما في إذن الدعم، ويُكتب على القرار (`ق-٥٣٧`). */
const decider = (req: Request): DecisionActor => {
  const payload = req.user as JwtPayload;
  return { id: payload.profileId, username: payload.username };
};

/** Support side: review and execute. Platform-admin only. */
@Controller('admin/deletion-requests')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class AdminDeletionRequestsController {
  constructor(private readonly service: DeletionRequestsService) {}

  @Get()
  list() {
    return this.service.listAll();
  }

  @Post(':id/reject')
  reject(@Req() req: Request, @Param('id') id: string, @Body() dto: DeletionRequestDecisionDto) {
    return this.service.reject(id, dto.note, decider(req));
  }

  /** Approve AND execute — يقيس ثم يقرّر: حذفٌ لبلا حركة، وإغلاقٌ لذات الحركة، وإعادةُ فتحٍ لطلبها. */
  @Post(':id/approve')
  approve(@Req() req: Request, @Param('id') id: string, @Body() dto: DeletionRequestDecisionDto) {
    return this.service.approveAndExecute(id, dto.note, decider(req));
  }
}
