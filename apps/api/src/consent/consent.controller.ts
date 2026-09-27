import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload, TenantContext } from '../auth/types';
import { PlatformAdminGuard } from '../common/platform-admin/platform-admin.guard';
import { RequiresPlatformRole } from '../common/platform-admin/platform-role.decorator';
import { PlatformRole } from '@mad-app/db';
import { AllowWhileConsentPending } from '../common/tenant/allow-while-consent-pending.decorator';
import { AllowWhileInactive } from '../common/tenant/allow-while-frozen.decorator';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { MSG } from '../common/i18n/messages';
import { OwnerOnly } from '../common/tenant/owner-only.decorator';
import { TenantWide } from '../common/tenant/tenant-wide.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { ConsentService } from './consent.service';
import { AcceptConsentDto, PublishVersionDto, UpsertSubProcessorDto } from './dto/consent.dto';

/**
 * جانبُ التاجر (`ق-٥٨٩`) — **بابان لا باب**: يقرأ الاتفاقيةَ ويقبلها من هنا، ويخرج
 * بالتصدير أو بطلب الإغلاق من مسارَيهما (وكلاهما يعمل وهو ممنوع).
 *
 * `@AllowWhileConsentPending` على الاثنين معاً — **فبوّابةٌ لا يُقرأ سببُها حجزٌ لا اختيار**.
 * والقراءةُ لكلّ فاعل (الحارسُ يحجب الجميع حتى يقبل المالك، فالموظّفُ يقرأ ما ينتظره)،
 * والقبولُ للمالك وحدَه — معلَناً في الحارس ومؤكَّداً في الخدمة (`ق-١١٩٨`/①).
 */
@Controller('processing-agreement')
@UseGuards(JwtAuthGuard, TenantGuard)
@AllowWhileInactive()
@AllowWhileConsentPending()
@TenantWide('حالُ الموافقة تُقرأ لكلّ فاعل: الحارسُ يحجب الجميعَ حتى يقبل المالك، فالموظّفُ يقرأ ما ينتظره — والقبولُ للمالك وحدَه')
export class ConsentController {
  constructor(private readonly service: ConsentService) {}

  @Get()
  mine(@CurrentTenant() tenant: TenantContext) {
    return this.service.forCompany(tenant.companyId);
  }

  @Post('accept')
  @OwnerOnly(MSG.consent_owner_only)
  accept(@Req() req: Request, @CurrentTenant() tenant: TenantContext, @Body() dto: AcceptConsentDto) {
    const payload = req.user as JwtPayload;
    // العنوانُ الشبكيّ يُكتب على القبول كما يُكتب على سطر التدقيق — شاهدٌ لا تتبّع.
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.ip || null;
    return this.service.accept(tenant.companyId, tenant.actorType, dto.version, { id: payload.profileId, username: payload.username }, ip);
  }
}

/** جانبُ المنصّة: القائمةُ ونشرُ نسخها — ومن يقرأ «لماذا مُنع فلان؟» يقرأ العدّ. */
@Controller('admin/processing-agreement')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
// ⑪A2 (`ق-١٣١٢`): قائمةُ المعالجين الفرعيين ونشرُ نسخها **امتثالٌ** — وهي التي يُحاسَب عليها
// أمام سدايا، فلا يمسّها الدعمُ ولا التشغيل.
@RequiresPlatformRole(PlatformRole.COMPLIANCE)
export class AdminConsentController {
  constructor(private readonly service: ConsentService) {}

  @Get()
  async overview() {
    const [subProcessors, versions, acceptances] = await Promise.all([
      this.service.listSubProcessors(),
      this.service.listVersions(),
      this.service.acceptanceCounts(),
    ]);
    return { subProcessors, versions, acceptances, noticeDays: ConsentService.NOTICE_DAYS };
  }

  @Post('sub-processors')
  upsert(@Body() dto: UpsertSubProcessorDto) {
    return this.service.upsertSubProcessor(dto);
  }

  @Post('sub-processors/:id/retire')
  retire(@Param('id') id: string) {
    return this.service.retireSubProcessor(id);
  }

  /** ⛔ والمهلةُ شرطُ قبولٍ لا تنبيه: نشرٌ بمهلةٍ أقصر من الحدّ يُرفض `400`. */
  @Post('versions')
  publish(@Body() dto: PublishVersionDto) {
    return this.service.publishVersion(dto.summary, new Date(dto.effectiveFrom));
  }
}
