import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards , Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { CloseReconciliationDto, MatchStatementLineDto, PostStatementLineDto, ReconciliationQueryDto, UnmatchStatementLineDto } from './dto/reconciliation.dto';
import { ReconciliationService } from './reconciliation.service';
import { CashDepositsService } from './cash-deposits.service';
import { CreateCashDepositDto, VoidCashDepositDto } from './dto/cash-deposit.dto';
import { NetworkSettlementsService } from './network-settlements.service';
import { CreateNetworkSettlementDto, OpenNetworkReceiptsQueryDto, VoidNetworkSettlementDto } from './dto/network-settlement.dto';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { SetArchivedDto } from '../common/dto/set-archived.dto';
import { ArchivablePagedQueryDto } from '../common/dto/archivable-paged-query.dto';
import { BanksService } from './banks.service';
import { CreateBankDto } from './dto/create-bank.dto';
import { TransferBankDto } from './dto/transfer-bank.dto';
import { UpdateBankDto } from './dto/update-bank.dto';
import { OwnerOnly } from '../common/tenant/owner-only.decorator';
import { MSG } from '../common/i18n/messages';
import { ApiCreatedResponse, ApiExtraModels, ApiNoContentResponse, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';
import { BankAccountTransferResponse, BankRowResponse, CashBoxTransferResponse, CodeBandStatusResponse, PagedBankRowResponse } from './dto/bank-responses.dto';
import { CashDepositListResponse, CreatedCashDepositResponse, VoidedCashDepositResponse } from './dto/cash-deposit-responses.dto';
import {
  CreatedNetworkSettlementResponse,
  NetworkSettlementListResponse,
  OpenNetworkReceiptsResponse,
  VoidedNetworkSettlementResponse,
} from './dto/network-settlement-responses.dto';
import { BankStatementLineResponse, ReconciliationOverviewResponse, ReconciliationStateResponse } from './dto/reconciliation-responses.dto';

/**
 * ⚖️ **كلُّ مسارٍ يعلن ردَّه صنفاً مسمّىً** (`ق-١٤٥٠` · خطّةُ الأنواع ④ — الوحدةُ الثانية بعد الكاشير) — `dto/*-responses.dto.ts`، ويطابقه
 * حارسُ الصدق الحيّ على التطبيق المبنيّ. والأصنافُ المشار إليها بـ`getSchemaPath` (فرعا النقل وصفُّ القائمة ومغلَّفُها) تُسجَّل هنا
 * كي توجد في الوثيقة.
 */
@Controller('banks')
@ApiExtraModels(BankAccountTransferResponse, CashBoxTransferResponse, BankRowResponse, PagedBankRowResponse)
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('banks')
export class BanksController {
  constructor(
    private readonly banksService: BanksService,
    private readonly reconciliation: ReconciliationService,
    private readonly deposits: CashDepositsService,
    private readonly settlements: NetworkSettlementsService,
  ) {}

  /** تسوياتُ الشبكة `1251` (⑦A2) — القائمةُ مع رصيد الشبكة بالدفتر مقابل السندات المفتوحة. */
  @Get('network-settlements')
  @RequiresAction('view')
  @ApiOkResponse({ type: NetworkSettlementListResponse })
  listNetworkSettlements(@CurrentTenant() tenant: TenantContext, @Query('bankId') bankId?: string) {
    return this.settlements.list(tenant.companyId, tenant.allowedBranchIds, bankId || undefined);
  }

  /** ما ستطالب به تسويةٌ لمدًى — تقرؤه الشاشةُ قبل الإنشاء، والإجماليُّ من الدفتر. */
  @Get('network-settlements/open')
  @RequiresAction('view')
  @ApiOkResponse({ type: OpenNetworkReceiptsResponse })
  openNetworkReceipts(@CurrentTenant() tenant: TenantContext, @Query() query: OpenNetworkReceiptsQueryDto) {
    return this.settlements.open(tenant.companyId, tenant.allowedBranchIds, query);
  }

  @Post('network-settlements')
  @RequiresAction('record')
  @ApiCreatedResponse({ type: CreatedNetworkSettlementResponse })
  createNetworkSettlement(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateNetworkSettlementDto) {
    return this.settlements.create(tenant.companyId, tenant.allowedBranchIds, dto);
  }

  @Post('network-settlements/:settlementId/void')
  @RequiresAction('record')
  @ApiCreatedResponse({ type: VoidedNetworkSettlementResponse })
  voidNetworkSettlement(@CurrentTenant() tenant: TenantContext, @Param('settlementId') settlementId: string, @Body() dto: VoidNetworkSettlementDto) {
    return this.settlements.void(tenant.companyId, tenant.allowedBranchIds, settlementId, dto.reason);
  }

  /** إيداعاتُ الأدراج عبر «نقدٍ في الطريق» (⑦A3) — القائمةُ ومجموعُ الطريق من الدفتر والمستندات معاً. */
  @Get('cash-deposits')
  @RequiresAction('view')
  @ApiOkResponse({ type: CashDepositListResponse })
  listCashDeposits(@CurrentTenant() tenant: TenantContext, @Query('bankId') bankId?: string) {
    return this.deposits.list(tenant.companyId, tenant.allowedBranchIds, bankId || undefined);
  }

  @Post('cash-deposits')
  @RequiresAction('record')
  @ApiCreatedResponse({ type: CreatedCashDepositResponse })
  createCashDeposit(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateCashDepositDto) {
    return this.deposits.create(tenant.companyId, tenant.allowedBranchIds, dto);
  }

  @Post('cash-deposits/:depositId/void')
  @RequiresAction('record')
  // أعمدةُ المستند بلا الدرج والبنك (`update` بلا ضمّ) — صنفٌ غيرُ صنف القائمة.
  @ApiCreatedResponse({ type: VoidedCashDepositResponse })
  voidCashDeposit(@CurrentTenant() tenant: TenantContext, @Param('depositId') depositId: string, @Body() dto: VoidCashDepositDto) {
    return this.deposits.void(tenant.companyId, tenant.allowedBranchIds, depositId, dto.reason);
  }

  /** التسويةُ البنكية (ق-١٢٦١ ج): الكشفُ مقابل الدفتر، بمقترَحاتٍ ومجاميع — كلُّ رقمٍ من الخادم. */
  @Get(':id/reconciliation')
  @RequiresAction('view')
  @ApiOkResponse({ type: ReconciliationOverviewResponse })
  reconciliationOverview(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Query() query: ReconciliationQueryDto) {
    return this.reconciliation.overview(tenant.companyId, tenant.allowedBranchIds, id, query);
  }

  @Post(':id/reconciliation/match')
  @RequiresAction('record')
  @ApiCreatedResponse({ type: BankStatementLineResponse })
  reconciliationMatch(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: MatchStatementLineDto) {
    return this.reconciliation.match(tenant.companyId, tenant.allowedBranchIds, id, dto.transactionId, dto.lineId);
  }

  @Post(':id/reconciliation/unmatch')
  @RequiresAction('record')
  @ApiCreatedResponse({ type: BankStatementLineResponse })
  reconciliationUnmatch(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UnmatchStatementLineDto) {
    return this.reconciliation.unmatch(tenant.companyId, tenant.allowedBranchIds, id, dto.transactionId);
  }

  /** سطرُ كشفٍ بلا دفتر يُرحَّل بطرفٍ يختاره المحاسب ثم يُطابَق — يحلّ ق-٢٨١. */
  @Post(':id/reconciliation/post')
  @RequiresAction('record')
  @ApiCreatedResponse({ type: BankStatementLineResponse })
  reconciliationPost(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: PostStatementLineDto) {
    return this.reconciliation.postFromStatement(tenant.companyId, tenant.allowedBranchIds, id, dto.transactionId, dto.counterpartyAccountId, dto.memo, dto.depositId);
  }

  @Post(':id/reconciliation/close')
  @RequiresAction('review')
  @ApiCreatedResponse({ type: ReconciliationStateResponse })
  reconciliationClose(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: CloseReconciliationDto) {
    return this.reconciliation.close(tenant.companyId, tenant.allowedBranchIds, id, dto.until);
  }

  @Post(':id/reconciliation/reopen')
  @RequiresAction('review')
  @ApiCreatedResponse({ type: ReconciliationStateResponse })
  reconciliationReopen(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.reconciliation.reopen(tenant.companyId, tenant.allowedBranchIds, id);
  }

  // `pagedFindMany`: مصفوفةٌ بلا `?page`، ومغلَّفٌ مرقَّمٌ به — فالردُّ أحدُهما (كقائمة المناوبات).
  @Get()
  @RequiresAction('view')
  @ApiOkResponse({ schema: { oneOf: [{ type: 'array', items: { $ref: getSchemaPath(BankRowResponse) } }, { $ref: getSchemaPath(PagedBankRowResponse) }] } })
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ArchivablePagedQueryDto) {
    return this.banksService.list(tenant.companyId, tenant.allowedBranchIds, query.includeArchived === 'true', query);
  }

  /**
   * سقفُ نطاق رموز البنوك (`ق-٢٩٥`) — **يُنذر قبل الاصطدام لا عنده**.
   *
   * وموضعُه هنا لا في `accounts`: **من يرى البنوك قد لا يرى الدليل**، وإنذارٌ
   * خلف شاشةٍ لا يفتحها صاحبُ الشأن إنذارٌ لا يصل. **ومسارٌ ثابتٌ قبل `:id`**
   * كي لا يبتلعه المُعرِّف.
   */
  @Get('code-band')
  @RequiresAction('view')
  @ApiOkResponse({ type: CodeBandStatusResponse })
  codeBand(@CurrentTenant() tenant: TenantContext) {
    return this.banksService.codeBand(tenant.companyId);
  }

  @Post()
  @RequiresAction('add')
  @ApiCreatedResponse({ type: BankRowResponse })
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateBankDto) {
    return this.banksService.create(tenant.companyId, tenant.allowedBranchIds, dto);
  }

  @Patch(':id')
  @RequiresAction('edit')
  @ApiOkResponse({ type: BankRowResponse })
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateBankDto) {
    return this.banksService.update(tenant.companyId, tenant.allowedBranchIds, id, dto);
  }

  /**
   * نقلُ الصفّ إلى فرعٍ آخر بنوعه المعلَن (`ق-١٤٣١`): الصندوقُ إغلاقٌ وفتحٌ بعدّ نقده وقيدين (`ق-١٤١٣`)، والحسابُ البنكيّ
   * للقادم وحدَه (`ق-١٤١٤`)، و«غيرُ المعلَن» لا يُنقل حتى يُعلَن — **للمالك** (`ق-١٤٣٢`).
   */
  @Post(':id/transfer')
  @OwnerOnly(MSG.bank_transfer_forbidden)
  // اتّحادٌ مميَّزٌ بـ`kind` — صنفان في `oneOf` كتقرير الخصم في الكاشير، لا صنفٌ بحقولٍ اختيارية.
  @ApiCreatedResponse({ schema: { oneOf: [{ $ref: getSchemaPath(BankAccountTransferResponse) }, { $ref: getSchemaPath(CashBoxTransferResponse) }] } })
  transfer(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: TransferBankDto) {
    return this.banksService.transfer(tenant.companyId, tenant.actorType, id, dto);
  }

  /** أرشفة/إلغاء أرشفة — يخفيه من القوائم اليومية ويبقيه في الحسابات. */
  @Patch(':id/archive')
  @RequiresAction('edit')
  @ApiOkResponse({ type: BankRowResponse })
  setArchived(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: SetArchivedDto) {
    return this.banksService.setArchived(tenant.companyId, tenant.allowedBranchIds, id, dto.archived);
  }

  // بلا جسمٍ أصلاً — «بلا محتوى» معلَنٌ صريحاً (والمِسنَنُ وحارسُ الصدق يطابقان رمزَه وفراغَه لا شكلاً).
  @Delete(':id')
  @RequiresAction('delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'نُقل إلى سلّة المحذوفات — بلا جسم.' })
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.banksService.remove(tenant.companyId, tenant.allowedBranchIds, id);
  }
}
