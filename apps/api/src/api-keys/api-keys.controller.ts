import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { OwnerOnly } from '../common/tenant/owner-only.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

/**
 * **مفاتيحُ الأنظمة — بيد مالك المنشأة وحدَه** (`ق-١٢٩١` · ي/⑫A3 · قاعدةُ الفاعل `§3.5`).
 *
 * ⛔ **ولا يُدار مفتاحٌ بمفتاح**: `@OwnerOnly` على كلِّ مسار، والفاعلُ `INTEGRATION`
 * ليس `COMPANY` — **فمفتاحٌ مسروق لا يُنشئ لنفسه مفتاحاً أوسع ولا يُبطل أخاه**، وهو
 * أوّلُ ما يفعله من يسرق مفتاحاً في نظامٍ لا يمنعه.
 */
@Controller('api-keys')
@UseGuards(JwtAuthGuard, TenantGuard)
@OwnerOnly()
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Get()
  list(@CurrentTenant() tenant: TenantContext) {
    return this.apiKeys.list(tenant.companyId);
  }

  /** الردُّ يحمل `token` **مرّةً واحدة** — ولا يُقرأ بعدها من أيّ مسار. */
  @Post()
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateApiKeyDto) {
    return this.apiKeys.create(tenant.companyId, dto);
  }

  /** الإبطالُ `POST` لا `DELETE`: **الصفُّ يبقى** ليُقرأ أثرُه — ختمٌ لا محو. */
  @Post(':id/revoke')
  revoke(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.apiKeys.revoke(tenant.companyId, id);
  }

  /** قياسُ الاستعمال والحصّة (`ق-١٢٩١` · ي/㉑A1) — **ما لا يُرى لا يُدار**. */
  @Get('usage')
  usage(@CurrentTenant() tenant: TenantContext) {
    return this.apiKeys.usage(tenant.companyId);
  }
}
