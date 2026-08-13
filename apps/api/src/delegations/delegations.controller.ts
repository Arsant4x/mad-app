import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { TenantContext } from '../auth/types';
import { DelegationsService } from './delegations.service';
import { CreateDelegationDto } from './dto/create-delegation.dto';
import { Grant } from './permission-tree';

/**
 * التفويض — منحاً وسحباً وقراءةً.
 *
 * ## لماذا `employees` وليس شاشةً جديدة
 *
 * التفويض **علاقة بين شخصين** لا إعداد نظام، ومدخله من الموظف. فمن يدير
 * الموظفين يدير تفويضهم — ولا صلاحية ثالثة تُخترَع لشيءٍ هو وجهٌ من إدارة
 * الموظفين نفسها.
 *
 * ⚠️ و`@RequiresAction` ليس تجميلاً: **إخفاء الزر ليس منعاً**. الواجهة
 * ترشّح الشجرة بما يملكه المفوِّض، والترشيح عرضٌ يتجاوزه طلبٌ مصنوع بيد.
 * فالسقف يُفحص في `DelegationsService.grant` على كل منحة، وهذا الحارس
 * طبقةٌ فوقه لا بديلٌ عنه.
 */
@Controller('delegations')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('employees')
export class DelegationsController {
  constructor(private readonly delegations: DelegationsService) {}

  /**
   * السجل الشجري للمنشأة — مستقلٌّ عن أي موظف بعينه.
   *
   * ⚠️ **`audit` لا `employees`** — ويَجُبّ شاشة الصنف أعلاه.
   *
   * والفرق ليس تصنيفاً: من يدقّق الامتثال يحتاج **تاريخ الصلاحيات** ولا
   * يحتاج إدارة الموظفين. وربطُ السجل بـ`employees` يعني أن مدقّقاً يملك
   * `audit` لا يرى من فوّض من — وهي المعلومة التي جاء يدقّقها. وموضعُه في
   * الشريط بجانب سجل التدقيق يقول ذلك بنفسه.
   *
   * ولا `@RequiresAction`: المجاوران (`audit.controller` و`trash.controller`)
   * يحرسان بالشاشة وحدها. وفعلٌ أشدّ هنا يجعل قالباً يفتح سجل التدقيق
   * ويُرفض عن سجل التفويض — تفاوتٌ بلا سبب.
   *
   * (قرار المالك 2026-08-13، بعد أن رفعتُه بنداً مفتوحاً.)
   */
  @Get('log')
  @RequiresScreen('audit')
  log(@CurrentTenant() tenant: TenantContext) {
    return this.delegations.logTree(tenant);
  }

  @Get(':granteeId')
  @RequiresAction('view')
  view(@CurrentTenant() tenant: TenantContext, @Param('granteeId') granteeId: string) {
    return this.delegations.viewFor(tenant, granteeId);
  }

  @Post()
  @RequiresAction('edit')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateDelegationDto) {
    return this.delegations.grant(tenant, dto.granteeId, dto.nodeKey, dto.grants as Grant[]);
  }

  /**
   * السحب `PATCH` لا `DELETE` — **والفعل يتبع الأثر لا العنوان**.
   *
   * لا صفّ يُحذف: `ACTIVE ⇒ SEALED ⇒ REVOKED`. و`DELETE` هنا يعِد بما لا
   * يقع، فيقرأه من بعدك على أنه محو.
   */
  @Patch(':id/revoke')
  @RequiresAction('edit')
  revoke(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.delegations.revoke(tenant, id);
  }
}
