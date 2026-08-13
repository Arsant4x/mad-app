import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { SetPrimaryActivityDto } from './dto/set-primary-activity.dto';
import { PrimaryActivityService } from './primary-activity.service';

/** No @RequiresScreen: the activity list feeds pickers on other screens, so any
 * tenant actor reads it. Writes are owner-only, enforced in the service. */
@Controller('activities')
@UseGuards(JwtAuthGuard, TenantGuard)
export class ActivitiesController {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly primaryActivity: PrimaryActivityService,
  ) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.activitiesService.list(tenant.companyId);
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
  setPrimary(@CurrentTenant() tenant: TenantContext, @Body() dto: SetPrimaryActivityDto) {
    return this.primaryActivity.apply(tenant, dto.activityId ?? null, dto.confirmed);
  }

  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateActivityDto) {
    return this.activitiesService.create(tenant.companyId, tenant.actorType, dto);
  }

  @Patch(':id')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateActivityDto) {
    return this.activitiesService.update(tenant.companyId, tenant.actorType, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.activitiesService.remove(tenant.companyId, tenant.actorType, id);
  }
}
