import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsString, Max, Min, MinLength } from 'class-validator';
import { ALLOWED_SCREENS } from '../templates/screens';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload, TenantContext } from '../auth/types';
import { PlatformAdminGuard } from '../common/platform-admin/platform-admin.guard';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { OwnerOnlyGuard } from '../common/tenant/owner-only.guard';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { SupportAccessService } from './support-access.service';

class RequestSupportAccessDto {
  @IsString()
  companyId!: string;

  /** يظهر للمالك حرفياً — سببٌ فارغ لا يستحق موافقة. */
  @IsString()
  @MinLength(5)
  reason!: string;

  @IsInt()
  @Min(5)
  @Max(1440)
  durationMinutes!: number;

  /**
   * **نطاقُ ما يُرى** (`ق-٥٢٧`) — شاشاتٌ من `ALLOWED_SCREENS` **مقروءةً لا
   * منسوخة**، واحدةٌ على الأقلّ: إذنٌ بلا نطاقٍ ليس تعليمةً (اللائحة م١٧/١/ب).
   */
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(ALLOWED_SCREENS as readonly string[], { each: true })
  screens!: string[];
}

/**
 * جانب مدير المنصة من وضع الدعم (§1.10): يطلب ويرى حالة طلباته —
 * **ولا يدخل** حتى يوافق المالك، وذلك في TenantGuard لا هنا.
 */
@Controller('support-access/admin')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class SupportAccessAdminController {
  constructor(private readonly supportAccessService: SupportAccessService) {}

  @Get()
  list() {
    return this.supportAccessService.adminList();
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
  overview(@CurrentTenant() tenant: TenantContext) {
    return this.supportAccessService.ownerOverview(tenant.companyId);
  }

  @Get('log')
  log(@CurrentTenant() tenant: TenantContext) {
    return this.supportAccessService.ownerLog(tenant.companyId);
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
