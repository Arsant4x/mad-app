import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload, TenantContext } from '../auth/types';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { PlatformAdminGuard } from '../common/platform-admin/platform-admin.guard';
import { RequiresPlatformRole } from '../common/platform-admin/platform-role.decorator';
import { PlatformRole } from '@mad-app/db';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { AllowWhileInactive } from '../common/tenant/allow-while-frozen.decorator';
import { AllowWhileClosed } from '../common/tenant/allow-while-closed.decorator';
import { AllowWhileConsentPending } from '../common/tenant/allow-while-consent-pending.decorator';
import { MSG } from '../common/i18n/messages';
import { OwnerOnly } from '../common/tenant/owner-only.decorator';
import { TenantWide } from '../common/tenant/tenant-wide.decorator';
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
 * @AllowWhileClosed — على ستّةٍ فقط: حالُ الطلب، وحالُ الحساب، ونسختُه، وطلبُ إعادة الفتح، وطلبُ
 * الإتلاف (`ق-٥٥٩`)، وسحبُ الطلب. فالمغلقُ لا يقرأ بياناته ولا يجدّد اشتراكه — ويعود بطلبٍ وقرار.
 *
 * والحالُ (الطلبُ وحالُ الحساب) يُقرأ لكلّ فاعل — فالمغلقُ يعرضه لكلّ من دخل؛ والقراراتُ
 * والنسخةُ للمالك وحدَه، معلَنةً في الحارس ومؤكَّدةً في الخدمة (`ق-١١٩٨`/①).
 */
@Controller('deletion-request')
@UseGuards(JwtAuthGuard, TenantGuard)
@AllowWhileInactive()
// ⭐ **ومنفذُ الخروج لا يُغلق** (`ق-٥٨٩/④`): «أغلق حسابي» يعمل والتاجرُ ممنوعٌ حتى يقبل
// قائمةَ المعالجين الفرعيين — **فمن لم يوافق يخرج بنسخته، ولا يُحبس داخل حسابه**.
@AllowWhileConsentPending()
@TenantWide('حالُ طلب الإغلاق وحالُ الحساب يُقرآن لكلّ فاعل: شاشةُ المغلق تُعرض لكلّ من دخل — والقراراتُ للمالك وحدَه')
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
  @OwnerOnly(MSG.deletion_owner_only)
  archive(@CurrentTenant() tenant: TenantContext) {
    return this.service.closureArchive(tenant.companyId, tenant.actorType);
  }

  @Post()
  @OwnerOnly(MSG.deletion_owner_only)
  submit(@CurrentTenant() tenant: TenantContext, @Body() dto: SubmitDeletionRequestDto) {
    return this.service.submit(tenant.companyId, tenant.actorType, dto.reason);
  }

  @Post('reopen')
  @AllowWhileClosed()
  @OwnerOnly(MSG.deletion_owner_only)
  reopen(@CurrentTenant() tenant: TenantContext) {
    return this.service.requestReopening(tenant.companyId, tenant.actorType);
  }

  /** طلبُ إتلافٍ صريح (`ق-٥٥٩/ب` — م٤/٥): محوُ غير الملزِم الآن لا بعد النافذة — لحسابٍ مغلق. */
  @Post('erase')
  @AllowWhileClosed()
  @OwnerOnly(MSG.deletion_owner_only)
  erase(@CurrentTenant() tenant: TenantContext) {
    return this.service.requestErasure(tenant.companyId, tenant.actorType);
  }

  @Post(':id/cancel')
  @AllowWhileClosed()
  @OwnerOnly(MSG.deletion_owner_only)
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
// ⑪A2 (`ق-١٣١٢`): قرارُ حذف حسابٍ ومحوُ بياناته **امتثالٌ** — وهو **الفعلُ الذي لا يُردّ**،
// فأبعدُ ما يكون عن الدعم.
@RequiresPlatformRole(PlatformRole.COMPLIANCE)
export class AdminDeletionRequestsController {
  constructor(private readonly service: DeletionRequestsService) {}

  @Get()
  list(@Query() query: PagedQueryDto) {
    return this.service.listAll(query);
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
