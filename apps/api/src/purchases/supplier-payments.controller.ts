import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { IdempotencyExempt, IdempotencyKey } from '../common/idempotency/idempotency';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { ListSupplierPaymentsQueryDto } from './dto/list-supplier-payments-query.dto';
import { AllocateSupplierPaymentDto, CreateSupplierPaymentDto, ReverseSupplierPaymentDto } from './dto/supplier-payment.dto';
import { SupplierPaymentsService } from './supplier-payments.service';

/**
 * سنداتُ الصرف للمورّدين (`ق-٨٧١`) — خلف شاشة `suppliers` التي يمنحها المالك عبر نماذجه،
 * والتسجيلُ بصلاحية `record` كسند القبض (من يُنشئ السندَ يختار بنكَه — `ق-٨٧٢`).
 *
 * **لا مسارَ حذفٍ ولا تعديل هنا عمداً**: سندٌ مرحَّل لا يُمسّ، والتصحيحُ بـ`POST :id/reverse`
 * وحدَه — بمنطق حراسة المستندات نفسِه في القيود والفواتير وسند القبض.
 */
@Controller('supplier-payments')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('suppliers')
export class SupplierPaymentsController {
  constructor(private readonly supplierPayments: SupplierPaymentsService) {}

  @Get()
  @RequiresAction('view')
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListSupplierPaymentsQueryDto) {
    return this.supplierPayments.list(tenant.companyId, tenant.allowedBranchIds, query);
  }

  /** فواتيرُ المورّد المفتوحة بمتبقّيها المحسوب — شاشةُ توزيع السند. */
  @Get('open-purchases/:supplierId')
  @RequiresAction('view')
  openPurchases(@CurrentTenant() tenant: TenantContext, @Param('supplierId') supplierId: string) {
    return this.supplierPayments.openPurchases(tenant.companyId, tenant.allowedBranchIds, supplierId);
  }

  @Get(':id')
  @RequiresAction('view')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.supplierPayments.findOne(tenant.companyId, tenant.allowedBranchIds, id);
  }

  @Post()
  @RequiresAction('record')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateSupplierPaymentDto, @IdempotencyKey() idempotencyKey: string | undefined) {
    return this.supplierPayments.create(tenant.companyId, tenant.allowedBranchIds, dto, idempotencyKey);
  }

  /** إعادةُ توزيع سندٍ على فواتير أخرى — لا يمسّ مبلغَه ولا قيدَه. */
  @Post(':id/allocate')
  @RequiresAction('edit')
  @IdempotencyExempt('replaces the voucher allocations with the set sent; a repeat sets the same allocations')
  allocate(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: AllocateSupplierPaymentDto) {
    return this.supplierPayments.allocate(tenant.companyId, tenant.allowedBranchIds, id, dto);
  }

  /** التصحيحُ الوحيد المتاح: سندٌ عاكس بقيدٍ مضادّ. */
  @Post(':id/reverse')
  @RequiresAction('record')
  @IdempotencyExempt('a voucher is reversed once; a repeat is refused naming the reversal')
  reverse(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: ReverseSupplierPaymentDto) {
    return this.supplierPayments.reverse(tenant.companyId, tenant.allowedBranchIds, id, dto.reason, dto.date);
  }
}
