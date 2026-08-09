import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { resolveCurrency, toBaseAmount } from '../common/currency/base-amount.util';
import { retryOnUniqueConflict } from '../common/retry-on-conflict.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { formatMessage, MSG } from '../common/i18n/messages';
import { postCustomerPaymentEntry } from '../journal/auto-posting.util';
import { branchFilter, resolveBranchId } from '../branches/branch-scope.util';
import { AllocateDto, AllocationDto, CreatePaymentDto } from './dto/payment.dto';

const PAYMENT_INCLUDE = {
  customer: { select: { id: true, name: true } },
  allocations: { include: { invoice: { select: { id: true, no: true, total: true, currency: true } } } },
} as const;

/** فرق أقل من هللة لا يُعتدّ به — المال يُقارن مقرَّباً لخانتين. */
const EPS = 0.005;
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * المقبوضات وتخصيصها على الفواتير (4.5).
 *
 * **قاعدة الوحدة الحاكمة:** «المدفوع» و«المتبقي» يُحسبان من التخصيصات في كل
 * استعلام — لا حقل مبلغ مدفوع على الفاتورة إطلاقاً. أما `Invoice.status` فهي
 * **مشتقّة مُخزَّنة (derived cache)** للفرز والفهرسة وحدهما: `recomputeInvoiceStatus`
 * هي **المدخل الوحيد** لكتابتها، وتُستدعى داخل نفس معاملة أي تغيير تخصيص —
 * فلا تنحرف عن الحقيقة لحظةً واحدة، ولا مهمة مجدولة تصلحها لاحقاً.
 *
 * **لا حذف ولا تعديل لدفعة**: لا مسار في هذه الخدمة ولا في متحكّمها يفعل ذلك؛
 * التصحيح بدفعة عكسية حصراً. حارس `assertNotPosted` شبكة أمان ثانية إن أُضيف
 * مساران يوماً — والقيد `Cascade` في المخطط شبكة ثالثة لا باب.
 */
@Injectable()
export class PaymentsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string, allowedBranchIds: string[] | 'all', customerId?: string) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.payment.findMany({
        where: { ...branchFilter(allowedBranchIds), ...(customerId ? { customerId } : {}) },
        include: PAYMENT_INCLUDE,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      }),
    );
  }

  async findOne(companyId: string, id: string) {
    const payment = await this.tenantPrisma.runInTenantContext(companyId, (tx) => tx.payment.findUnique({ where: { id }, include: PAYMENT_INCLUDE }));
    if (!payment) throw new NotFoundException(MSG.payment_not_found);
    return payment;
  }

  /**
   * فواتير العميل المفتوحة بمتبقّيها — **محسوباً من التخصيصات** لا من حقل
   * مخزَّن (قاعدة الوحدة). هذه هي الشاشة التي يوزّع منها المحاسب دفعته.
   */
  openInvoices(companyId: string, customerId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const invoices = await tx.invoice.findMany({
        where: { customerId, status: { not: 'PAID' } },
        select: { id: true, no: true, issueDate: true, dueDate: true, total: true, currency: true, status: true },
        orderBy: { issueDate: 'asc' },
      });
      const allocated = await this.allocatedByInvoice(tx, invoices.map((i) => i.id));
      return invoices
        .map((inv) => {
          const paid = allocated.get(inv.id) ?? 0;
          return { ...inv, allocated: paid, remaining: round2(Number(inv.total) - paid) };
        })
        .filter((i) => i.remaining > EPS);
    });
  }

  /**
   * تسجيل دفعة مع تخصيصها (اختيارياً) في معاملة واحدة.
   *
   * الترتيب مقصود: قفلُ صفوف الفواتير المستهدفة أولاً (قرار 6.12)، ثم التحقق
   * من المتبقي، ثم الإنشاء والترحيل وإعادة حساب الحالات — فدفعتان متزامنتان
   * على فاتورة واحدة تتسلسلان، والثانية ترى المتبقي بعد الأولى فتُرفض مسمّاةً
   * بدل أن تتجاوزه.
   */
  create(companyId: string, allowedBranchIds: string[] | 'all', dto: CreatePaymentDto) {
    const { currency, exchangeRate } = resolveCurrency(dto);
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const customer = await tx.customer.findUnique({ where: { id: dto.customerId }, select: { id: true, name: true } });
        if (!customer) throw new NotFoundException(MSG.customer_not_found);

        if (dto.method === 'BANK' && !dto.bankId) throw new BadRequestException(MSG.bank_required);
        const bank = dto.bankId ? await tx.bank.findUnique({ where: { id: dto.bankId } }) : null;
        if (dto.bankId && !bank) throw new NotFoundException(MSG.bank_not_found);

        const branchId = await resolveBranchId(tx, dto.branchId, allowedBranchIds);
        const amount = round2(dto.amount);
        const allocations = (dto.allocations ?? []).map((a) => ({ invoiceId: a.invoiceId, amount: round2(a.amount) }));

        const invoices = await this.assertAllocationsFit(tx, amount, currency, dto.customerId, allocations);

        const no = await this.nextPaymentNumber(tx);
        const payment = await tx.payment.create({
          data: {
            companyId,
            no,
            customerId: dto.customerId,
            branchId,
            date: new Date(dto.date),
            amount,
            method: dto.method,
            bankId: bank?.id,
            reference: dto.reference,
            notes: dto.notes,
            currency,
            exchangeRate,
            baseAmount: toBaseAmount(amount, exchangeRate),
            allocations: { create: allocations.map((a) => ({ companyId, invoiceId: a.invoiceId, amount: a.amount })) },
          } as unknown as Prisma.PaymentUncheckedCreateInput,
        });

        await this.postAndSettle(tx, companyId, payment.id, {
          no,
          customerName: customer.name,
          date: new Date(dto.date),
          amount,
          currency,
          exchangeRate,
          branchId,
          bank,
          baseReceivable: this.baseReceivableOf(amount, exchangeRate, allocations, invoices),
          description: `مقبوض من عميل — سند ${no} — ${customer.name}`,
        });

        for (const a of allocations) await this.recomputeInvoiceStatus(tx, a.invoiceId);

        return tx.payment.findUniqueOrThrow({ where: { id: payment.id }, include: PAYMENT_INCLUDE });
      }),
    );
  }

  /** إعادة توزيع دفعة قائمة: تحلّ المجموعة الجديدة محلّ تخصيصاتها كلها. */
  allocate(companyId: string, id: string, dto: AllocateDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id }, include: { allocations: true } });
      if (!payment) throw new NotFoundException(MSG.payment_not_found);
      if (payment.reversesId) throw new ConflictException(MSG.payment_reversal_immutable);

      const requested = dto.allocations.map((a) => ({ invoiceId: a.invoiceId, amount: round2(a.amount) }));
      const touched = new Set<string>([...payment.allocations.map((a) => a.invoiceId), ...requested.map((a) => a.invoiceId)]);

      // القديمة تُطرح أولاً — وإلا رفضنا إعادةَ توزيعٍ لا تتجاوز شيئاً حقيقةً.
      await tx.paymentAllocation.deleteMany({ where: { paymentId: id } });
      await this.assertAllocationsFit(tx, round2(Number(payment.amount)), payment.currency, payment.customerId, requested);

      if (requested.length) {
        await tx.paymentAllocation.createMany({ data: requested.map((a) => ({ companyId, paymentId: id, invoiceId: a.invoiceId, amount: a.amount })) });
      }

      for (const invoiceId of touched) await this.recomputeInvoiceStatus(tx, invoiceId);

      return tx.payment.findUniqueOrThrow({ where: { id }, include: PAYMENT_INCLUDE });
    });
  }

  /**
   * التصحيح بدفعة عكسية — لا حذف ولا تعديل لمرحَّل (نمط حراسة المستندات).
   *
   * تُنشأ دفعة بمبلغ سالب تشير للأصل، بقيدٍ مضاد، وتخصيصاتها سالبة مطابقة —
   * فتعود حالات الفواتير تلقائياً لما كانت عليه، وينقص الصندوق فعلياً.
   */
  reverse(companyId: string, id: string, reason?: string) {
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const original = await tx.payment.findUnique({ where: { id }, include: { allocations: true, customer: { select: { name: true } } } });
        if (!original) throw new NotFoundException(MSG.payment_not_found);
        if (original.reversesId) throw new ConflictException(MSG.payment_reversal_immutable);
        const existing = await tx.payment.findFirst({ where: { reversesId: id }, select: { no: true } });
        if (existing) throw new ConflictException(formatMessage(MSG.payment_already_reversed, { no: existing.no }));

        const amount = round2(-Number(original.amount));
        const rate = Number(original.exchangeRate);
        const no = await this.nextPaymentNumber(tx);
        const bank = original.bankId ? await tx.bank.findUnique({ where: { id: original.bankId } }) : null;

        // الذمّة المعكوسة بأسعار فواتيرها هي نفسها التي سُوّيت — فيتطابق
        // القيدان طرفاً بطرف ويعود 5600 إلى ما كان.
        const invoices = await tx.invoice.findMany({
          where: { id: { in: original.allocations.map((a) => a.invoiceId) } },
          select: { id: true, exchangeRate: true },
        });
        const rateByInvoice = new Map(invoices.map((i) => [i.id, Number(i.exchangeRate)]));
        const baseReceivable = round2(
          -original.allocations.reduce((s, a) => s + toBaseAmount(Number(a.amount), rateByInvoice.get(a.invoiceId) ?? rate), 0) -
            toBaseAmount(round2(Number(original.amount) - original.allocations.reduce((s, a) => s + Number(a.amount), 0)), rate),
        );

        const reversal = await tx.payment.create({
          data: {
            companyId,
            no,
            customerId: original.customerId,
            // فرع العكس هو فرع الأصل حتماً — لا يُشتق من جلسة من يضغط الزر.
            branchId: original.branchId,
            date: new Date(),
            amount,
            method: original.method,
            bankId: original.bankId,
            reference: original.reference,
            notes: reason ?? `عكس السند ${original.no}`,
            currency: original.currency,
            exchangeRate: original.exchangeRate,
            baseAmount: round2(-Number(original.baseAmount)),
            reversesId: original.id,
            allocations: { create: original.allocations.map((a) => ({ companyId, invoiceId: a.invoiceId, amount: round2(-Number(a.amount)) })) },
          } as unknown as Prisma.PaymentUncheckedCreateInput,
        });

        await this.postAndSettle(tx, companyId, reversal.id, {
          no,
          customerName: original.customer.name,
          date: new Date(),
          amount,
          currency: original.currency,
          exchangeRate: rate,
          branchId: original.branchId,
          bank,
          baseReceivable,
          description: `عكس مقبوض — سند ${no} (يعكس ${original.no})`,
          reversal: true,
        });

        for (const a of original.allocations) await this.recomputeInvoiceStatus(tx, a.invoiceId);

        return tx.payment.findUniqueOrThrow({ where: { id: reversal.id }, include: PAYMENT_INCLUDE });
      }),
    );
  }

  // ---------------- الداخل ----------------

  /**
   * حارس صريح: دفعة مرحَّلة لا تُعدَّل ولا تُحذف — الرفض يوجّه للدفعة العكسية.
   *
   * لا مسار اليوم يستدعيه (لا endpoint حذف ولا تعديل أصلاً)، وهو مقصود: شبكةُ
   * أمان تلتقط أي مسار يُضاف لاحقاً بغفلة، بنفس نمط حراسة المستندات.
   */
  assertNotPosted(payment: { journalEntryId: string | null; no: string }): void {
    if (payment.journalEntryId) throw new ConflictException(formatMessage(MSG.payment_posted_immutable, { no: payment.no }));
  }

  /** مجموع المخصَّص لكل فاتورة — مصدر الحقيقة الوحيد لـ«المدفوع». */
  private async allocatedByInvoice(tx: Prisma.TransactionClient, invoiceIds: string[]): Promise<Map<string, number>> {
    if (!invoiceIds.length) return new Map();
    const rows = await tx.paymentAllocation.groupBy({ by: ['invoiceId'], where: { invoiceId: { in: invoiceIds } }, _sum: { amount: true } });
    return new Map(rows.map((r) => [r.invoiceId, round2(Number(r._sum.amount ?? 0))]));
  }

  private async allocatedFor(tx: Prisma.TransactionClient, invoiceId: string): Promise<number> {
    const agg = await tx.paymentAllocation.aggregate({ where: { invoiceId }, _sum: { amount: true } });
    return round2(Number(agg._sum.amount ?? 0));
  }

  /**
   * إعادة حساب حالة الفاتورة من تخصيصاتها — **المدخل الوحيد** لكتابة الحالة.
   *
   * المدفوع يتقدّم على التأخر: فاتورة مسدَّدة جزئياً ومتأخرة تُقرأ PARTIAL،
   * والأعمار (4.6) هي من يفصل التأخر لاحقاً.
   */
  private async recomputeInvoiceStatus(tx: Prisma.TransactionClient, invoiceId: string): Promise<void> {
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, total: true, status: true, dueDate: true } });
    if (!invoice) return;
    const allocated = await this.allocatedFor(tx, invoiceId);
    const total = round2(Number(invoice.total));

    let status: 'DUE' | 'PARTIAL' | 'PAID' | 'OVERDUE';
    if (allocated >= total - EPS) status = 'PAID';
    else if (allocated > EPS) status = 'PARTIAL';
    else {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      status = invoice.dueDate < today ? 'OVERDUE' : 'DUE';
    }
    if (status !== invoice.status) await tx.invoice.update({ where: { id: invoiceId }, data: { status } });
  }

  /**
   * يقفل صفوف الفواتير المستهدفة ثم يتحقق من الحدّين:
   * مجموع التخصيصات ≤ مبلغ الدفعة · وكل تخصيص ≤ متبقي فاتورته.
   */
  private async assertAllocationsFit(
    tx: Prisma.TransactionClient,
    paymentAmount: number,
    paymentCurrency: string,
    customerId: string,
    allocations: AllocationDto[],
  ): Promise<Map<string, { exchangeRate: number }>> {
    const rates = new Map<string, { exchangeRate: number }>();
    if (!allocations.length) return rates;

    const sum = round2(allocations.reduce((s, a) => s + a.amount, 0));
    if (sum > Math.abs(paymentAmount) + EPS) {
      throw new BadRequestException(formatMessage(MSG.allocations_exceed_payment, { sum: sum.toFixed(2), amount: Math.abs(paymentAmount).toFixed(2) }));
    }

    for (const a of allocations) {
      // قفل الصف داخل المعاملة (قرار 6.12): المتسابق الثاني ينتظر هنا، ثم
      // يقرأ المتبقي بعد خصم الأول — فيُرفض بدل أن يتجاوزه.
      const locked = await tx.$queryRaw<{ id: string; no: string; total: string; currency: string; customerId: string; exchangeRate: string }[]>`
        SELECT id, no, total::text, currency, "customerId", "exchangeRate"::text
        FROM invoices WHERE id = ${a.invoiceId} FOR UPDATE`;
      if (!locked.length) throw new NotFoundException(MSG.invoice_not_found);
      const invoice = locked[0];

      if (invoice.customerId !== customerId) throw new BadRequestException(formatMessage(MSG.allocation_wrong_customer, { no: invoice.no }));
      // عملتان مختلفتان تجعلان «المتبقي» و«المخصَّص» بمقياسين — رفضٌ صريح
      // خيرٌ من تخصيصٍ صامت خاطئ (التخصيص عبر العملات مرشَّح مسجَّل).
      if (invoice.currency !== paymentCurrency) {
        throw new BadRequestException(formatMessage(MSG.allocation_currency_mismatch, { no: invoice.no, invoiceCurrency: invoice.currency, paymentCurrency }));
      }

      const allocated = await this.allocatedFor(tx, a.invoiceId);
      const remaining = round2(Number(invoice.total) - allocated);
      if (a.amount > remaining + EPS) {
        throw new BadRequestException(formatMessage(MSG.allocation_exceeds_remaining, { no: invoice.no, remaining: remaining.toFixed(2), amount: a.amount.toFixed(2) }));
      }
      rates.set(a.invoiceId, { exchangeRate: Number(invoice.exchangeRate) });
    }
    return rates;
  }

  /**
   * الذمّة المسوّاة بالعملة الأساسية: كل تخصيص بسعر **فاتورته** (فذمّتها
   * قُيّدت بذلك السعر)، وما لم يُخصَّص بسعر الدفعة (لا فاتورة يُنسب إليها).
   */
  private baseReceivableOf(amount: number, paymentRate: number, allocations: AllocationDto[], invoices: Map<string, { exchangeRate: number }>): number {
    const allocatedSum = round2(allocations.reduce((s, a) => s + a.amount, 0));
    const fromAllocations = allocations.reduce((s, a) => s + toBaseAmount(a.amount, invoices.get(a.invoiceId)?.exchangeRate ?? paymentRate), 0);
    const onAccount = toBaseAmount(round2(amount - allocatedSum), paymentRate);
    return round2(fromAllocations + onAccount);
  }

  /** الترحيل + أثر الصندوق/البنك — مسار واحد للدفعة وعكسها. */
  private async postAndSettle(
    tx: Prisma.TransactionClient,
    companyId: string,
    paymentId: string,
    p: {
      no: string;
      customerName: string;
      date: Date;
      amount: number;
      currency: string;
      exchangeRate: number;
      branchId: string | null;
      bank: { id: string } | null;
      baseReceivable: number;
      description: string;
      reversal?: boolean;
    },
  ): Promise<void> {
    const entry = await postCustomerPaymentEntry(tx, companyId, {
      paymentNo: p.no,
      customerName: p.customerName,
      date: p.date,
      baseCash: toBaseAmount(p.amount, p.exchangeRate),
      baseReceivable: p.baseReceivable,
      branchId: p.branchId,
      reversal: p.reversal,
    });
    if (entry) await tx.payment.update({ where: { id: paymentId }, data: { journalEntryId: entry.id } });

    // النقد يدخل صندوق فرع الدفعة (صندوق = Bank مربوط بفرع) — نفس نمط
    // مقبوضات الإيجار: رصيد يتحرك وحركة بنكية تُسجَّل. العكس ينقص الرصيد
    // لأن مبلغه سالب.
    if (p.bank) {
      await tx.bank.update({ where: { id: p.bank.id }, data: { balance: { increment: p.amount } } });
      await tx.bankTransaction.create({
        data: {
          bankId: p.bank.id,
          date: p.date,
          description: p.description,
          amount: p.amount,
          source: 'customer-payment',
          matched: !!entry,
          entryNo: entry?.no ?? null,
          currency: p.currency,
          exchangeRate: p.exchangeRate,
          baseAmount: toBaseAmount(p.amount, p.exchangeRate),
        } as unknown as Prisma.BankTransactionUncheckedCreateInput,
      });
    }
  }

  /** تسلسل سندات القبض مستقل عن الفواتير — يُشتق من جدول الدفعات وحده. */
  private async nextPaymentNumber(tx: Prisma.TransactionClient): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `RCV-${year}-`;
    const rows = await tx.payment.findMany({ where: { no: { startsWith: prefix } }, select: { no: true } });
    const maxSeq = rows.reduce((max, r) => {
      const n = parseInt(r.no.slice(prefix.length), 10);
      return Number.isFinite(n) && n > max ? n : max;
    }, 0);
    return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
  }
}
