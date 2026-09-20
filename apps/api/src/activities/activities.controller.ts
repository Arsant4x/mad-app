import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { OwnerOnly } from '../common/tenant/owner-only.decorator';
import { TenantWide } from '../common/tenant/tenant-wide.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { SetPrimaryActivityDto } from './dto/set-primary-activity.dto';
import { PrimaryActivityService } from './primary-activity.service';

/** No @RequiresScreen: the activity list feeds pickers on other screens, so any
 * tenant actor reads it. Writes are owner-only — declared on each write
 * (`@OwnerOnly`, enforced in the guard) and asserted again in the service.
 * ⚠️ وتعيينُ النشاط الرئيسي كان بلا تأكيدٍ في الخدمة (مقيس `ق-١١٩٨`/①): أيُّ موظّفٍ
 * كان يبدّل شاشاتِ المنشأة كلِّها — والواجهةُ تعرضه للمالك وحدَه؛ صار للمالك في الحارس. */
@Controller('activities')
@UseGuards(JwtAuthGuard, TenantGuard)
@TenantWide('قائمةُ الأنشطة ومعاينةُ أثرِ الترشيح تُقرآن لكلّ فاعل (منتقياتُ الفروع والمنتجات) — والكتابةُ للمالك وحدَه')
export class ActivitiesController {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly primaryActivity: PrimaryActivityService,
  ) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext, @Query() query: PagedQueryDto) {
    return this.activitiesService.list(tenant.companyId, query);
  }

  /**
   * ماذا يتغيّر لو صار هذا النشاط رئيسياً — **قراءةٌ خالصة**.
   *
   * ⚠️ ومسارٌ منفصل عن التطبيق عمداً: نقطةٌ واحدة تعرض وتطبّق تجعل «العرض»
   * يغيّر الحالة، ويفقد التأكيد معناه.
   *
   * و`activityId` فارغاً يعني «ماذا لو أطفأتُ الترشيح؟» — أي معاينة
   * التراجع قبل وقوعه.
   */
  @Get('primary/preview')
  previewPrimary(@CurrentTenant() tenant: TenantContext, @Query('activityId') activityId?: string) {
    return this.primaryActivity.preview(tenant, activityId || null);
  }

  /**
   * يعيّن النشاط الرئيسي — **ويُشغّل الترشيح**.
   *
   * و`activityId: null` هو **التراجع الفوري**: الترشيح يُطفأ، وكل الشاشات
   * تعود في الطلب التالي بلا إعادة دخول. والبيانات لم تُمسّ أصلاً.
   */
  @Patch('primary')
  @OwnerOnly()
  setPrimary(@CurrentTenant() tenant: TenantContext, @Body() dto: SetPrimaryActivityDto) {
    return this.primaryActivity.apply(tenant, dto.activityId ?? null, dto.confirmed);
  }

  @Post()
  @OwnerOnly()
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateActivityDto) {
    return this.activitiesService.create(tenant.companyId, tenant.actorType, dto);
  }

  @Patch(':id')
  @OwnerOnly()
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateActivityDto) {
    return this.activitiesService.update(tenant.companyId, tenant.actorType, id, dto);
  }

  @Delete(':id')
  @OwnerOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.activitiesService.remove(tenant.companyId, tenant.actorType, id);
  }
}
