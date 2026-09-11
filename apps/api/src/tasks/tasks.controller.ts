import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { TenantContext } from '../auth/types';
import { TasksService } from './tasks.service';
import { CommentTaskDto } from './dto/comment-task.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { TransitionTaskDto } from './dto/transition-task.dto';
import { TaskStatus } from './task-model';

/**
 * المهام — **بلا `@RequiresScreen`، وهو قرارٌ لا سهو**.
 *
 * ## لماذا لا شاشة تحرسها
 *
 * «مهامي» يقرأ **ما كُلِّف به الفاعل نفسه** — لا مهام غيره. وربطُه بشاشةٍ
 * يعني أن موظفاً محدود الصلاحية **لا يرى ما كُلِّف به**، وهو نقيض الغرض:
 * المهمة تُسنَد إليه بالضبط لأنه لا يملك الشاشة بعد.
 *
 * ونظيرُه قائم في هذا المشروع: `notifications` بلا حارس شاشة للسبب نفسه —
 * مُرشَّحة إلى صاحبها أصلاً، وحارسٌ ثانٍ يُخفي عنه تنبيهاته.
 *
 * ⚠️ **والحراسة الحقيقية داخل الخدمة**: الاستعلام مقيَّدٌ بـ`assigneeId`،
 * و`canOpenTarget` يُحسب من التقاطع، والانتقال يُفحص بـ`mayTransition`.
 * فالفاعل يرى **وجود** مهمته ولا يقرأ مستنداً لا يملكه.
 *
 * و`TenantGuard` باقٍ: هو مَن يتحقّق من حياة الحساب وحالة الاشتراك ويضع
 * `req.tenant`. حذفُه يجعل حساباً موقوفاً يقرأ مهامه.
 */
@Controller('tasks')
@UseGuards(JwtAuthGuard, TenantGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  /**
   * ⚠️ الزمن يُصنع **هنا** ويُمرَّر — لا `new Date()` داخل المنطق.
   *
   * فالاشتقاق (`currentDueDate` · `isOverdue`) يبقى دالةً نقية يحقن
   * الاختبارُ زمنَها ولا ينتظر مروره. وهو قرار المرحلة الثانية بنصّه.
   */
  @Get('mine')
  mine(@CurrentTenant() tenant: TenantContext) {
    return this.tasks.mine(tenant, new Date());
  }

  /** عدّادا لوحة التحكم — مشتقّان، لا عمود «متأخّرة» في القاعدة. */
  @Get('counters')
  counters(@CurrentTenant() tenant: TenantContext) {
    return this.tasks.counters(tenant, new Date());
  }

  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateTaskDto) {
    return this.tasks.create(tenant, dto, new Date());
  }

  @Patch(':id/status')
  transition(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: TransitionTaskDto) {
    return this.tasks.transition(tenant, id, dto.to as TaskStatus, dto.note ?? null, new Date());
  }

  /** تعليقٌ بلا انتقال (`SPEC 1.11` · `ق-٥٣٢`) — سطرٌ في السجل حالتُه من وإلى سواء، لطرفَي المهمّة. */
  @Post(':id/comments')
  comment(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: CommentTaskDto) {
    return this.tasks.comment(tenant, id, dto.note, new Date());
  }

  /** سجلُّ المهمّة — انتقالاتُها وتعليقاتُها بترتيبها، لطرفيها وحدهما. */
  @Get(':id/log')
  log(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.tasks.log(tenant, id);
  }
}
