import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload, TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { PlatformAdminGuard } from '../common/platform-admin/platform-admin.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { AllowWhileInactive } from '../common/tenant/allow-while-frozen.decorator';
import { DeletionRequestDecisionDto, SubmitDeletionRequestDto } from './dto/deletion-request.dto';
import { DecisionActor, DeletionRequestsService } from './deletion-requests.service';

/**
 * Merchant side: file / follow / withdraw a deletion request.
 *
 * @AllowWhileInactive — a company whose subscription lapsed is exactly the one
 * most likely to want out; locking the exit behind an active subscription would
 * force it to pay to leave.
 */
@Controller('deletion-request')
@UseGuards(JwtAuthGuard, TenantGuard)
@AllowWhileInactive()
export class DeletionRequestsController {
  constructor(private readonly service: DeletionRequestsService) {}

  @Get()
  mine(@CurrentTenant() tenant: TenantContext) {
    return this.service.myRequest(tenant.companyId);
  }

  @Post()
  submit(@CurrentTenant() tenant: TenantContext, @Body() dto: SubmitDeletionRequestDto) {
    return this.service.submit(tenant.companyId, tenant.actorType, dto.reason);
  }

  @Post(':id/cancel')
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

  /** Approve AND execute — the one endpoint that actually deletes a company. */
  @Post(':id/approve')
  approve(@Req() req: Request, @Param('id') id: string, @Body() dto: DeletionRequestDecisionDto) {
    return this.service.approveAndExecute(id, dto.note, decider(req));
  }
}
