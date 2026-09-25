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
import { UpdateBankDto } from './dto/update-bank.dto';

@Controller('banks')
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
  listNetworkSettlements(@CurrentTenant() tenant: TenantContext, @Query('bankId') bankId?: string) {
    return this.settlements.list(tenant.companyId, tenant.allowedBranchIds, bankId || undefined);
  }

  /** ما ستطالب به تسويةٌ لمدًى — تقرؤه الشاشةُ قبل الإنشاء، والإجماليُّ من الدفتر. */
  @Get('network-settlements/open')
  @RequiresAction('view')
  openNetworkReceipts(@CurrentTenant() tenant: TenantContext, @Query() query: OpenNetworkReceiptsQueryDto) {
    return this.settlements.open(tenant.companyId, tenant.allowedBranchIds, query);
  }

  @Post('network-settlements')
  @RequiresAction('record')
  createNetworkSettlement(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateNetworkSettlementDto) {
    return this.settlements.create(tenant.companyId, tenant.allowedBranchIds, dto);
  }

  @Post('network-settlements/:settlementId/void')
  @RequiresAction('record')
  voidNetworkSettlement(@CurrentTenant() tenant: TenantContext, @Param('settlementId') settlementId: string, @Body() dto: VoidNetworkSettlementDto) {
    return this.settlements.void(tenant.companyId, tenant.allowedBranchIds, settlementId, dto.reason);
  }

  /** إيداعاتُ الأدراج عبر «نقدٍ في الطريق» (⑦A3) — القائمةُ ومجموعُ الطريق من الدفتر والمستندات معاً. */
  @Get('cash-deposits')
  @RequiresAction('view')
  listCashDeposits(@CurrentTenant() tenant: TenantContext, @Query('bankId') bankId?: string) {
    return this.deposits.list(tenant.companyId, tenant.allowedBranchIds, bankId || undefined);
  }

  @Post('cash-deposits')
  @RequiresAction('record')
  createCashDeposit(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateCashDepositDto) {
    return this.deposits.create(tenant.companyId, tenant.allowedBranchIds, dto);
  }

  @Post('cash-deposits/:depositId/void')
  @RequiresAction('record')
  voidCashDeposit(@CurrentTenant() tenant: TenantContext, @Param('depositId') depositId: string, @Body() dto: VoidCashDepositDto) {
    return this.deposits.void(tenant.companyId, tenant.allowedBranchIds, depositId, dto.reason);
  }

  /** التسويةُ البنكية (ق-١٢٦١ ج): الكشفُ مقابل الدفتر، بمقترَحاتٍ ومجاميع — كلُّ رقمٍ من الخادم. */
  @Get(':id/reconciliation')
  @RequiresAction('view')
  reconciliationOverview(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Query() query: ReconciliationQueryDto) {
    return this.reconciliation.overview(tenant.companyId, tenant.allowedBranchIds, id, query);
  }

  @Post(':id/reconciliation/match')
  @RequiresAction('record')
  reconciliationMatch(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: MatchStatementLineDto) {
    return this.reconciliation.match(tenant.companyId, tenant.allowedBranchIds, id, dto.transactionId, dto.lineId);
  }

  @Post(':id/reconciliation/unmatch')
  @RequiresAction('record')
  reconciliationUnmatch(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UnmatchStatementLineDto) {
    return this.reconciliation.unmatch(tenant.companyId, tenant.allowedBranchIds, id, dto.transactionId);
  }

  /** سطرُ كشفٍ بلا دفتر يُرحَّل بطرفٍ يختاره المحاسب ثم يُطابَق — يحلّ ق-٢٨١. */
  @Post(':id/reconciliation/post')
  @RequiresAction('record')
  reconciliationPost(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: PostStatementLineDto) {
    return this.reconciliation.postFromStatement(tenant.companyId, tenant.allowedBranchIds, id, dto.transactionId, dto.counterpartyAccountId, dto.memo, dto.depositId);
  }

  @Post(':id/reconciliation/close')
  @RequiresAction('review')
  reconciliationClose(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: CloseReconciliationDto) {
    return this.reconciliation.close(tenant.companyId, tenant.allowedBranchIds, id, dto.until);
  }

  @Post(':id/reconciliation/reopen')
  @RequiresAction('review')
  reconciliationReopen(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.reconciliation.reopen(tenant.companyId, tenant.allowedBranchIds, id);
  }

  @Get()
  @RequiresAction('view')
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
  codeBand(@CurrentTenant() tenant: TenantContext) {
    return this.banksService.codeBand(tenant.companyId);
  }

  @Post()
  @RequiresAction('add')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateBankDto) {
    return this.banksService.create(tenant.companyId, tenant.allowedBranchIds, dto);
  }

  @Patch(':id')
  @RequiresAction('edit')
  update(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: UpdateBankDto) {
    return this.banksService.update(tenant.companyId, tenant.allowedBranchIds, id, dto);
  }

  /** أرشفة/إلغاء أرشفة — يخفيه من القوائم اليومية ويبقيه في الحسابات. */
  @Patch(':id/archive')
  @RequiresAction('edit')
  setArchived(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: SetArchivedDto) {
    return this.banksService.setArchived(tenant.companyId, tenant.allowedBranchIds, id, dto.archived);
  }

  @Delete(':id')
  @RequiresAction('delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.banksService.remove(tenant.companyId, tenant.allowedBranchIds, id);
  }
}
