import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JwtPayload } from '../auth/types';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { PlatformAdminGuard } from '../common/platform-admin/platform-admin.guard';
import { PlatformAuditTarget } from '../common/platform-admin/platform-audit-target.decorator';
import { RequiresPlatformRole } from '../common/platform-admin/platform-role.decorator';
import { PlatformRole } from '@mad-app/db';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { OwnerResetLinkResponse } from './dto/owner-reset-link-response.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateCompanySubscriptionDto } from './dto/update-company-subscription.dto';

/**
 * ⛔ **لا مسارَ حذفٍ مباشراً** (`ق-٥٤٨`): إغلاقُ منشأةٍ أو حذفُها واقعةٌ تمسّ التاجر، فلا
 * تقع بضغطةٍ بلا طلبٍ منه وأثرٍ يحمل من قرّر — **المسارُ الوحيد طلبُ الحذف وموافقتُه**
 * (`/admin/deletion-requests`). كان هنا `DELETE /companies/:id` وحُذف.
 */
@Controller('companies')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
// The company account itself is an operations matter: its name and its template. The owner's login
// name and password are the owner's alone; the platform can only have a reset link sent to the owner.
// The subscription is money and has its own route for the finance role. Creating a company sets no
// subscription dates, so both roles keep it. `OWNER` passes by definition.
@RequiresPlatformRole(PlatformRole.OPERATIONS, PlatformRole.FINANCE)
@PlatformAuditTarget('id')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  list(@Query() query: PagedQueryDto) {
    return this.companiesService.list(query);
  }

  @Post()
  create(@Body() dto: CreateCompanyDto) {
    return this.companiesService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCompanyDto) {
    return this.companiesService.update(id, dto);
  }

  /** Sends the owner a password reset link by e-mail. Five a minute for one administrator. */
  @Post(':id/password-reset')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: OwnerResetLinkResponse })
  sendOwnerResetLink(@Param('id') id: string): Promise<OwnerResetLinkResponse> {
    return this.companiesService.sendOwnerResetLink(id);
  }
}

/**
 * **الاشتراكُ للمالية وحدَها** (`ق-١٣١٧` · ⑪A2).
 *
 * **فالاشتراكُ مالٌ يُحصَّل ويُردّ، والتشغيلُ يخصّ الخادمَ والنسخ لا المال** — **وفصلُ من
 * يلمس المالَ عمّن يلمس الخادم هو غرضُ الأدوار أصلاً**.
 *
 * ومتحكّمٌ ثانٍ لا شرطٌ في الخدمة: **الحكمُ يبقى معلَناً في المُزخرِف** فيقرؤه الحارسُ
 * الساكن ومن يفتح الملفّ — وشرطٌ مدفونٌ في دالّةٍ لا يُقرأ ولا يُحرَس.
 */
@Controller('companies')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
@RequiresPlatformRole(PlatformRole.FINANCE)
@PlatformAuditTarget('id')
export class CompanySubscriptionController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Patch(':id/subscription')
  updateSubscription(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateCompanySubscriptionDto) {
    return this.companiesService.updateSubscription(id, dto, (req.user as JwtPayload).profileId);
  }
}
