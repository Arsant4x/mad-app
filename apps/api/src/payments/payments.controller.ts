import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantContext } from '../auth/types';
import { IdempotencyExempt, IdempotencyKey, keyedRequest } from '../common/idempotency/idempotency';
import { CurrentTenant } from '../common/tenant/current-tenant.decorator';
import { RequiresAction } from '../common/tenant/requires-action.decorator';
import { RequiresScreen } from '../common/tenant/requires-screen.decorator';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto';
import { AllocateDto, CreatePaymentDto, RefundDto, ReversePaymentDto } from './dto/payment.dto';
import { PaymentsService } from './payments.service';

/**
 * سندات القبض (4.5) — خلف شاشة `payments` التي يمنحها المالك عبر نماذجه،
 * وقيدُ الفرع للموظف كما هو في كل مكان (branchFilter داخل الخدمة).
 *
 * **لا مسار حذف ولا تعديل هنا عمداً**: دفعة مرحَّلة لا تُمسّ، والتصحيح
 * بـ`POST :id/reverse` وحده — بنفس منطق حراسة المستندات في القيود والفواتير.
 */
@Controller('payments')
@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresScreen('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @RequiresAction('view')
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListPaymentsQueryDto) {
    return this.paymentsService.list(tenant.companyId, tenant.allowedBranchIds, query);
  }

  /** فواتير العميل المفتوحة بمتبقّيها المحسوب — شاشة توزيع الدفعة. */
  @Get('open-invoices/:customerId')
  @RequiresAction('view')
  openInvoices(@CurrentTenant() tenant: TenantContext, @Param('customerId') customerId: string) {
    return this.paymentsService.openInvoices(tenant.companyId, tenant.allowedBranchIds, customerId);
  }

  @Get(':id')
  @RequiresAction('view')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id') id: string) {
    return this.paymentsService.findOne(tenant.companyId, tenant.allowedBranchIds, id);
  }

  @Post()
  @RequiresAction('record')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreatePaymentDto, @IdempotencyKey() idempotencyKey: string | undefined) {
    return this.paymentsService.create(tenant.companyId, tenant.allowedBranchIds, dto, idempotencyKey);
  }

  /** سندُ ردٍّ لمرتجع (`SPEC 30.8`): مستقلٌّ مربوطٌ بالإشعار الدائن — والقابل للردّ يحسبه الخادم. */
  @Post('refund')
  @RequiresAction('record')
  refund(@CurrentTenant() tenant: TenantContext, @Body() dto: RefundDto, @IdempotencyKey() idempotencyKey: string | undefined) {
    return this.paymentsService.refund(tenant.companyId, tenant.allowedBranchIds, dto, keyedRequest(idempotencyKey, 'payments.refund', tenant, dto));
  }

  /** إعادة توزيع دفعة على فواتير أخرى — لا يمسّ مبلغها ولا قيدها. */
  @Post(':id/allocate')
  @RequiresAction('edit')
  @IdempotencyExempt('replaces the voucher allocations with the set sent; a repeat sets the same allocations')
  allocate(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: AllocateDto) {
    return this.paymentsService.allocate(tenant.companyId, tenant.allowedBranchIds, id, dto);
  }

  /** التصحيح الوحيد المتاح: دفعة عكسية بقيدٍ مضاد. */
  @Post(':id/reverse')
  @RequiresAction('record')
  @IdempotencyExempt('a voucher is reversed once; a repeat is refused naming the reversal')
  reverse(@CurrentTenant() tenant: TenantContext, @Param('id') id: string, @Body() dto: ReversePaymentDto) {
    return this.paymentsService.reverse(tenant.companyId, tenant.allowedBranchIds, id, dto.reason, dto.date);
  }
}
