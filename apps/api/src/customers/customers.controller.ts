import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards , Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CompanyWideFigures } from '../common/tenant/company-wide-figures.decorator';
import { SetArchivedDto } from '../common/dto/set-archived.dto';
import { ArchivablePagedQueryDto } from '../common/dto/archivable-paged-query.dto';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { RecordMarketingConsentDto } from './dto/record-marketing-consent.dto';
import { ApiOkResponse } from '@nestjs/swagger';
import { CustomerDetailResponse } from './dto/customer-responses.dto';

@Controller('customers')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  @RequiresAction('view')
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ArchivablePagedQueryDto) {
    return this.customersService.list(tenant.companyId, tenant.allowedBranchIds, query.includeArchived === 'true', query);
  }

  /** المفوتَرُ والمقبوضُ والرصيد — محسوبةٌ في الخادم من التخصيصات لا في نافذة التفاصيل (`ق-١٢٤٣`). */
  @Get(':id/summary')
  @RequiresAction('view')
  @CompanyWideFigures('ما فُوتر على العميل وما قُبض منه ورصيدُه في المنشأة كلِّها، من كلِّ فروعها')
  summary(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.customersService.summary(tenant.companyId, id);
  }

  /**
   * **الموافقةُ التسويقية — حالةً وسجلّاً** (`ق-١٣٠٣` · ك/⑰A1). واللائحةُ (م٢٨/٣) توجب
   * الاحتفاظَ بالإثبات، **وإثباتٌ لا يُقرأ ليس إثباتاً** — فيُعرض السجلُّ كاملاً لا الحالةُ وحدَها.
   */
  @Get(':id/marketing-consent')
  @RequiresAction('view')
  marketingConsent(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.customersService.marketingConsent(tenant.companyId, id);
  }

  /**
   * **تسجيلُ واقعةِ موافقةٍ أو رجوعٍ عنها** — بفعل `record` لا `edit`: **لا شيء يُعدَّل**،
   * والواقعةُ تُلحَق. ومن يسجّل بيعاً في الفرع هو من يسمع «وافقت» فيسجّلها.
   */
  @Post(':id/marketing-consent')
  @RequiresAction('record')
  recordMarketingConsent(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: RecordMarketingConsentDto) {
    return this.customersService.recordMarketingConsent(tenant, id, dto);
  }

  /**
   * ⚖️ **تفصيلُ العميل — المعرّفُ البديل مفكوكاً** (توجيه ٢٨٦): الرقمُ مشفَّرٌ في القاعدة، والقائمةُ لا تحمله؛ ونافذةُ التعديل
   * تقرؤه من هنا لمن يملك الاطّلاع على الشاشة — كتفصيل الموظف (`ق-١٣٤٥`).
   */
  @Get(':id')
  @RequiresAction('view')
  @ApiOkResponse({ type: CustomerDetailResponse })
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.customersService.findOne(tenant.companyId, id);
  }

  @Post()
  @RequiresAction('add')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(tenant.companyId, dto);
  }

  @Patch(':id')
  @RequiresAction('edit')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateCustomerDto) {
    return this.customersService.update(tenant.companyId, id, dto);
  }

  /** أرشفة/إلغاء أرشفة — يخفيه من القوائم اليومية ويبقيه في الحسابات. */
  @Patch(':id/archive')
  @RequiresAction('edit')
  setArchived(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: SetArchivedDto) {
    return this.customersService.setArchived(tenant.companyId, id, dto.archived);
  }

  @Delete(':id')
  @RequiresAction('delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.customersService.remove(tenant.companyId, id);
  }
}
