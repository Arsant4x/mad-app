import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { PlatformAdminGuard } from '../common/platform-admin/platform-admin.guard';
import { RequiresPlatformRole } from '../common/platform-admin/platform-role.decorator';
import { PlatformRole } from '@prisma/client';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateCompanySubscriptionDto } from './dto/update-company-subscription.dto';

/**
 * ⛔ **لا مسارَ حذفٍ مباشراً** (`ق-٥٤٨`): إغلاقُ منشأةٍ أو حذفُها واقعةٌ تمسّ التاجر، فلا
 * تقع بضغطةٍ بلا طلبٍ منه وأثرٍ يحمل من قرّر — **المسارُ الوحيد طلبُ الحذف وموافقتُه**
 * (`/admin/deletion-requests`). كان هنا `DELETE /companies/:id` وحُذف.
 */
@Controller('companies')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
// ⑪A2 (`ق-١٣١٢`): حسابُ المنشأة نفسُه **تشغيلٌ** — اسمُها وقالبُها واسمُ دخولها.
// ⚠️ **واشتراكُها خرج من هنا** (`ق-١٣١٧`) إلى مسارٍ بدوره: **مالٌ يُحصَّل ويُردّ**.
// **والميلادُ يبقى بالدورين معاً**: الفترةُ الأولى جزءٌ منه، **وتقسيمُه يجعل التسجيلَ
// مستحيلاً على كلٍّ منهما وحدَه**. و`OWNER` يمرّ بتعريفه.
@RequiresPlatformRole(PlatformRole.OPERATIONS, PlatformRole.FINANCE)
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
export class CompanySubscriptionController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Patch(':id/subscription')
  updateSubscription(@Param('id') id: string, @Body() dto: UpdateCompanySubscriptionDto) {
    return this.companiesService.updateSubscription(id, dto);
  }
}
