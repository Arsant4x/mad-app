import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload, TenantContext } from '../auth/types';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { PlatformAdminGuard } from '../common/platform-admin/platform-admin.guard';
import { RequiresPlatformRole } from '../common/platform-admin/platform-role.decorator';
import { PlatformRole } from '@mad-app/db';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { OwnerOnlyGuard } from '../common/tenant/owner-only.guard';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { RequestSupportAccessDto } from './dto/request-support-access.dto';
import { SupportAccessService } from './support-access.service';

/**
 * جانب مدير المنصة من وضع الدعم (§1.10): يطلب ويرى حالة طلباته —
 * **ولا يدخل** حتى يوافق المالك، وذلك في TenantGuard لا هنا.
 */
@Controller('support-access/admin')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
// ⑪A2 (`ق-١٣١٢`): الدخولُ بموافقة التاجر **هو الدعمُ نفسُه** — ولا يمنح شيئاً غيره.
@RequiresPlatformRole(PlatformRole.SUPPORT)
export class SupportAccessAdminController {
  constructor(private readonly supportAccessService: SupportAccessService) {}

  @Get()
  list(@Query() query: PagedQueryDto) {
    return this.supportAccessService.adminList(query);
  }

  @Post()
  request(@Req() req: Request, @Body() dto: RequestSupportAccessDto) {
    const payload = req.user as JwtPayload;
    return this.supportAccessService.request({ id: payload.profileId, username: payload.username }, dto.companyId, dto.reason, dto.durationMinutes, dto.screens);
  }
}

/**
 * جانب المالك: الموافقة والرفض والقطع وسجل الوصول — في إعدادات منشأته
 * (قاعدة الفاعل §3.5)، وللمالك حصراً حتى لو مُنح موظفٌ شاشةَ الإعدادات.
 */
@Controller('support-access')
@UseGuards(JwtAuthGuard, TenantGuard, OwnerOnlyGuard)
@RequiresScreen('settings')
export class SupportAccessOwnerController {
  constructor(private readonly supportAccessService: SupportAccessService) {}

  @Get()
  overview(@CurrentTenant() tenant: TenantContext, @Query() query: PagedQueryDto) {
    return this.supportAccessService.ownerOverview(tenant.companyId, query);
  }

  @Get('log')
  log(@CurrentTenant() tenant: TenantContext, @Query() query: PagedQueryDto) {
    return this.supportAccessService.ownerLog(tenant.companyId, query);
  }

  // (ق-٦٤٦) **الاسمُ يُمرَّر لأن القرارَ يُكتب باسم قائله** — وقتَ الفعل لا يُحلّ لاحقاً،
  // كما في اعتماد الإجازة والشطب.
  @Post(':id/approve')
  approve(@CurrentTenant() tenant: TenantContext, @Req() req: Request, @Param('id') id: string) {
    const payload = req.user as JwtPayload;
    return this.supportAccessService.decide(tenant.companyId, id, true, { id: tenant.profileId, name: payload.username });
  }

  @Post(':id/deny')
  deny(@CurrentTenant() tenant: TenantContext, @Req() req: Request, @Param('id') id: string) {
    const payload = req.user as JwtPayload;
    return this.supportAccessService.decide(tenant.companyId, id, false, { id: tenant.profileId, name: payload.username });
  }

  @Post(':id/revoke')
  revoke(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.supportAccessService.revoke(tenant.companyId, id);
  }
}
