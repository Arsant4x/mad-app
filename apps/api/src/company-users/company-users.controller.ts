import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CompanyUsersService } from './company-users.service';
import { CreateCompanyUserDto } from './dto/create-company-user.dto';
import { UpdateCompanyUserDto } from './dto/update-company-user.dto';

@Controller('company-users')
@UseGuards(JwtAuthGuard, TenantGuard)
export class CompanyUsersController {
  constructor(private readonly companyUsersService: CompanyUsersService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.companyUsersService.list(tenant.companyId, tenant.actorType);
  }

  /**
   * ⚠️ **حدٌّ صارم — تخفيفٌ لا علاج** (قرار المالك 2026-08-16).
   *
   * فحص فرادة اسم المستخدم هنا **عالميّ بالضرورة**: `login_identities` بلا RLS
   * (يُقرأ قبل وجود سياق مستأجر) و`username` فريدٌ على المنصّة كلها. فالردّ
   * `409` يُخبر أي مالكٍ موثَّق بوجود اسمٍ **لا يملكه** — لدى منافس، أو موظّفٍ
   * عنده، أو مدير المنصّة.
   *
   * وكان هذا المسار على الحدّ العام `600/دقيقة` — أي **٣٦ ألف اسم في الساعة**.
   * فصار `5/دقيقة` كنظيرَيه في إنشاء الحسابات (`/auth/register` و
   * `forgot-password`).
   *
   * ⛔ **ولا يُقفل به البند**: الحدّ **يُبطئ التعداد ولا يمنعه** — ورمز الحالة
   * نفسه هو القناة، لا نصّ الرسالة. والعلاج المعتمد مبدئياً إزالةُ السبب من
   * جذره (مساحة أسماء لكل منشأة)، **ويُحسم مع مسار التسجيل لا منفصلاً**.
   */
  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateCompanyUserDto) {
    return this.companyUsersService.create(tenant.companyId, tenant.actorType, dto, {
      id: tenant.profileId,
      name: tenant.profileId,
    });
  }

  @Patch(':id')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateCompanyUserDto) {
    return this.companyUsersService.update(tenant.companyId, tenant.actorType, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.companyUsersService.remove(tenant.companyId, tenant.actorType, id);
  }
}
