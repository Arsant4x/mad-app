import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { AllowWhileInactive } from '../common/tenant/allow-while-frozen.decorator';
import { AllowWhileConsentPending } from '../common/tenant/allow-while-consent-pending.decorator';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { OwnerOnly } from '../common/tenant/owner-only.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { ExportService } from './export.service';

/**
 * Data export — the merchant's copy of its own data.
 *
 * @AllowWhileInactive: the grace-period rule is "view and export only", and a
 * stopped merchant deciding whether to renew or leave still owns its data.
 * Owner-only — declared in the guard (`@OwnerOnly`) and enforced again in the
 * service (`ق-١١٩٨`/①).
 */
/**
 * ⭐ **ومنفذُ الخروج لا يُغلق** (`ق-٥٨٩/④`): «نزّل بياناتك» ليست وعداً في نصٍّ بل مسارٌ
 * **يعمل والتاجرُ ممنوعٌ حتى يقبل قائمةَ المعالجين الفرعيين** — فبلا هذا صار الاختيارُ حجزاً.
 */
@AllowWhileConsentPending()
@Controller('export')
@UseGuards(JwtAuthGuard, TenantGuard)
@AllowWhileInactive()
@OwnerOnly()
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get()
  exportAll(@CurrentTenant() tenant: TenantContext) {
    // `profileId` هوية الفاعل في هذا النظام — تُمرَّر ليحمل أثرُ التدقيق **من**
    // صدّر، لا «تمّ تصدير». وحدثٌ بلا فاعل لا يُجيب السؤال الذي يُسأل عنده.
    return this.exportService.exportAll(tenant.companyId, tenant.actorType, {
      id: tenant.profileId,
      name: tenant.profileId,
    });
  }
}
