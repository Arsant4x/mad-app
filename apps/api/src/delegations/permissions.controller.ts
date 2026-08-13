import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { TenantContext } from '../auth/types';
import { MePermissions, PermissionsService } from './permissions.service';

/**
 * `GET /me/permissions` — ما يملكه الفاعل، محسوباً في الخادم.
 *
 * ## لماذا بلا `@RequiresScreen`
 *
 * كل شاشةٍ في الواجهة تحتاج هذا الجواب قبل أن ترسم زرّاً واحداً. وربطُه
 * بشاشةٍ بعينها يجعل من يُمنع منها **بلا صلاحياتٍ أصلاً** — لا محدود
 * الصلاحية بل معدومها. والنقطة لا تكشف شيئاً زائداً: تعيد صلاحيات السائل
 * نفسه، لا صلاحيات غيره.
 *
 * ⚠️ و`TenantGuard` باقٍ رغم ذلك: هو مَن يتحقّق من حياة الحساب وحالة
 * الاشتراك ويضع `req.tenant`. حذفُه يجعل حساباً موقوفاً يقرأ صلاحياته.
 */
@Controller('me')
@UseGuards(JwtAuthGuard, TenantGuard)
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  @Get('permissions')
  permissionsForMe(@CurrentTenant() tenant: TenantContext): Promise<MePermissions> {
    return this.permissions.forActor(tenant);
  }
}
