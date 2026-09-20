import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { branchFilter, resolveBranchId } from '../branches/branch-scope.util';
import { resolveCurrency, toBaseAmount } from '../common/currency/base-amount.util';
import { highestSequenceOf, nextDocumentNumber } from '../common/document-sequence.util';
import { MSG } from '../common/i18n/messages';
import { round2 } from '../common/money/rounding';
import { retryOnUniqueConflict } from '../common/retry-on-conflict.util';
import {
  allocatedByDocument,
  assertReversible,
  baseSettledOf,
  lockAndAssertAllocationsFit,
  withRemaining,
} from '../common/settlement/settlement.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { mirrorBankMovement, postSupplierPaymentEntry } from '../journal/auto-posting.util';
import { AllocateSupplierPaymentDto, CreateSupplierPaymentDto, SupplierAllocationDto } from './dto/supplier-payment.dto';
import { outstandingAfterNotes } from '../common/adjustment/adjustment-note.util';
import { creditedByPurchase, purchaseTarget, recomputePurchaseStatus } from './purchase-settlement.util';

const SUPPLIER_PAYMENT_INCLUDE = {
  supplier: { select: { id: true, name: true } },
  allocations: { include: { purchase: { select: { id: true, no: true, total: true, currency: true } } } },
} as const;

/** تخصيصاتُ الطلب بمفردات التسوية المشتركة. */
const toSettlementAllocations = (allocations: SupplierAllocationDto[]) => allocations.map((a) => ({ documentId: a.purchaseId, amount: a.amount }));

/**
 * ⭐ **سنداتُ الصرف للمورّدين وتخصيصُها على فواتير الشراء** (`ق-٨٦٦` · `ق-٨٧١` · `ق-٨٧٢`).
 *
 * كان سدادُ الشراء علَماً على الصفّ (`paid`) بلا حسابٍ ولا مبلغٍ ولا قيد — فبقي `2100` لا
 * ينقص أبداً، ومنشأةٌ تشتري وتسدّد سنةً يقول دفترُها إنها مدينةٌ بكلِّ ما اشترت. **السدادُ
 * الآن مستندٌ يُرحَّل كأخيه في الكاشير**: مدين `2100` · دائن نقد/بنك، بعملة الأساس.
 *
 * **مرآةُ `PaymentsService` بجدولٍ مستقلّ — والمنطقُ مشتركٌ لا منسوخ**: القفلُ والتخصيصُ
 * والذمّةُ بسعر المستند والحالةُ المشتقّة وأثرُ البنك وحرّاسُ العكس كلُّها في
 * `common/settlement`. **وما هنا خاصٌّ بالمورّد وحدَه**: الترقيمُ `PAY-`، والقيدُ على `2100`،
 * وإشارةُ النقد (يخرج)، وغيابُ الدرج (`ق-٨٧٢`: الدرجُ للكاشير لا للمورّد).
 *
 * **لا حذف ولا تعديل لسندٍ مرحَّل** — التصحيحُ بسندٍ عاكس حصراً، كسند القبض.
 *
 * **والفائضُ غيرُ المخصَّص «دفعةٌ على الحساب»**: يمدين `2100` كاملاً، فيحمل المورّدُ
 * رصيداً **مديناً** لنا فيه حتى يُخصَّص على شراءٍ لاحق بـ`allocate` — **لا حسابَ أصلٍ
 * ثانياً** (يظهر في المركز الماليّ نقصاً في الالتزامات لا زيادةً في الأصول، وهو موضعُه
 * الذي أُعلن للمالك).
 */
@Injectable()
export class SupplierPaymentsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string, allowedBranchIds: string[] | 'all', supplierId?: string) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.supplierPayment.findMany({
        where: { ...branchFilter(allowedBranchIds), ...(supplierId ? { supplierId } : {}) },
        include: SUPPLIER_PAYMENT_INCLUDE,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      }),
    );
  }

  async findOne(companyId: string, id: string) {
    const payment = await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.supplierPayment.findUnique({ where: { id }, include: SUPPLIER_PAYMENT_INCLUDE }),
    );
    if (!payment) throw new NotFoundException(MSG.supplier_payment_not_found);
    return payment;
  }

  /**
   * فواتيرُ المورّد المفتوحة بمتبقّيها — **محسوباً من التخصيصات** لا من حقل.
   *
   * **على مستوى المنشأة بحقّها**: ذمّةُ المورّد ذمّةُ المنشأة عليه لا ذمّةُ فرع — وتوزيعُ سنده
   * يقتضي رؤيةَ كلِّ فواتيره المفتوحة، وإلا بقيت فاتورةُ فرعٍ محجوبٍ مفتوحةً لا تُسدَّد أبداً.
   * ⚖️ ويُعرَض للمالك: فهي تُظهر أرقامَ فواتيرِ فرعٍ آخر ومبالغَها لمن يوزّع السند.
   */
  openPurchases(companyId: string, supplierId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // الإشعارُ الدائن من المورّد `PAID` بطبيعته فلا يدخل؛ والمدينُ مستحقٌّ يُسدَّد كالشراء (`ق-١٠٠٦`/②).
      const purchases = await tx.purchase.findMany({
        // والمُلغى بقيد عكسٍ لا ذمّةَ عليه (`ق-٩٩٧`/②).
        where: { supplierId, status: { not: 'PAID' }, voidedAt: null },
        select: { id: true, no: true, date: true, dueDate: true, total: true, currency: true, status: true, docType: true },
        orderBy: { date: 'asc' },
      });
      const ids = purchases.map((p) => p.id);
      // المتبقّي بعد ما ائتمن به المورّد — المصدرُ الواحد ⑥ مع الفاتورة (`ق-١٠٠٨`/١).
      const credited = await creditedByPurchase(tx, ids);
      return withRemaining(purchases, await allocatedByDocument(purchaseTarget(tx), ids)).map((p) => {
        const creditedTotal = credited.get(p.id) ?? 0;
        return { ...p, credited: creditedTotal, remaining: outstandingAfterNotes(p, creditedTotal, p.allocated, 'SUPPLIER_CREDIT_NOTE') };
      });
    });
  }

  /**
   * تسجيلُ سند صرفٍ مع تخصيصه (اختيارياً) في معاملةٍ واحدة — الترتيبُ كسند القبض حرفياً:
   * قفلُ صفوف الفواتير المستهدفة (`6.12`) ثم التحقّقُ من المتبقّي ثم الإنشاءُ والترحيلُ
   * وإعادةُ حساب الحالات.
   */
  create(companyId: string, allowedBranchIds: string[] | 'all', dto: CreateSupplierPaymentDto) {
    const { currency, exchangeRate } = resolveCurrency(dto);
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const supplier = await tx.supplier.findUnique({ where: { id: dto.supplierId }, select: { id: true, name: true } });
        if (!supplier) throw new NotFoundException(MSG.supplier_not_found);

        if (dto.method === 'BANK' && !dto.bankId) throw new BadRequestException(MSG.bank_required);
        const bank = dto.bankId ? await tx.bank.findUnique({ where: { id: dto.bankId } }) : null;
        if (dto.bankId && !bank) throw new NotFoundException(MSG.bank_not_found);

        const branchId = await resolveBranchId(tx, dto.branchId, allowedBranchIds);
        const amount = round2(dto.amount);
        const allocations = (dto.allocations ?? []).map((a) => ({ purchaseId: a.purchaseId, amount: round2(a.amount) }));

        const purchases = await lockAndAssertAllocationsFit(tx, purchaseTarget(tx), {
          amount,
          currency,
          partyId: dto.supplierId,
          allocations: toSettlementAllocations(allocations),
        });

        const no = await this.nextPaymentNumber(tx, companyId, new Date(dto.date));
        const payment = await tx.supplierPayment.create({
          data: {
            companyId,
            no,
            supplierId: dto.supplierId,
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
            allocations: { create: allocations.map((a) => ({ companyId, purchaseId: a.purchaseId, amount: a.amount })) },
          } as unknown as Prisma.SupplierPaymentUncheckedCreateInput,
        });

        await this.postAndSettle(tx, companyId, payment.id, {
          no,
          supplierName: supplier.name,
          supplierId: supplier.id,
          date: new Date(dto.date),
          amount,
          currency,
          exchangeRate,
          branchId,
          bank,
          basePayable: baseSettledOf(amount, exchangeRate, toSettlementAllocations(allocations), purchases),
          description: `سداد لمورّد — سند ${no} — ${supplier.name}`,
        });

        for (const a of allocations) await recomputePurchaseStatus(tx, a.purchaseId);

        return tx.supplierPayment.findUniqueOrThrow({ where: { id: payment.id }, include: SUPPLIER_PAYMENT_INCLUDE });
      }),
    );
  }

  /**
   * إعادةُ توزيع سندٍ قائم: تحلّ المجموعةُ الجديدة محلَّ تخصيصاته كلِّها — ولا يمسّ مبلغَه ولا قيدَه.
   *
   * **على مستوى المنشأة بحقّها**: عكسُ السند يُقرأ برابط الأصل (`reversesId`) لا بقائمة
   * رؤية — رابطُ مستندٍ بمستنده، وحجبُه بفرعٍ يُظهر السندَ المعكوس قابلاً للتوزيع من جديد.
   */
  allocate(companyId: string, id: string, dto: AllocateSupplierPaymentDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const payment = await tx.supplierPayment.findUnique({ where: { id }, include: { allocations: true } });
      if (!payment) throw new NotFoundException(MSG.supplier_payment_not_found);
      // ⚖️ مرآةُ سند القبض (`ق-١١٩٨`/⑤): كان يُمرَّر `null` فيُعاد توزيعُ سندٍ عُكس فعلاً.
      assertReversible(payment, await tx.supplierPayment.findFirst({ where: { reversesId: id }, select: { no: true } }));

      const requested = dto.allocations.map((a) => ({ purchaseId: a.purchaseId, amount: round2(a.amount) }));
      const touched = new Set<string>([...payment.allocations.map((a) => a.purchaseId), ...requested.map((a) => a.purchaseId)]);

      // القديمةُ تُطرح أولاً — وإلا رفضنا إعادةَ توزيعٍ لا تتجاوز شيئاً حقيقةً.
      await tx.supplierPaymentAllocation.deleteMany({ where: { paymentId: id } });
      await lockAndAssertAllocationsFit(tx, purchaseTarget(tx), {
        amount: round2(Number(payment.amount)),
        currency: payment.currency,
        partyId: payment.supplierId,
        allocations: toSettlementAllocations(requested),
      });

      if (requested.length) {
        await tx.supplierPaymentAllocation.createMany({
          data: requested.map((a) => ({ companyId, paymentId: id, purchaseId: a.purchaseId, amount: a.amount })),
        });
      }

      for (const purchaseId of touched) await recomputePurchaseStatus(tx, purchaseId);

      return tx.supplierPayment.findUniqueOrThrow({ where: { id }, include: SUPPLIER_PAYMENT_INCLUDE });
    });
  }

  /**
   * التصحيحُ بسندٍ عاكس — لا حذفَ ولا تعديلَ لمرحَّل: سندٌ بمبلغٍ سالب يشير للأصل، بقيدٍ
   * مضادّ، وتخصيصاتُه سالبةٌ مطابقة — فتعود حالاتُ الفواتير تلقائياً، ويعود النقدُ إلى البنك.
   *
   * **على مستوى المنشأة بحقّها**: عكسُ السند يقرأ عكسَه السابق وفواتيرَ تخصيصاته هو —
   * روابطُ مستندٍ لا قوائمُ رؤية، وحجبُ فاتورةٍ منها يعكس نصفَ السند ويترك الذمّةَ مختلّة.
   */
  reverse(companyId: string, id: string, reason?: string, date?: string) {
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const original = await tx.supplierPayment.findUnique({
          where: { id },
          include: { allocations: true, supplier: { select: { name: true } } },
        });
        if (!original) throw new NotFoundException(MSG.supplier_payment_not_found);
        assertReversible(original, await tx.supplierPayment.findFirst({ where: { reversesId: id }, select: { no: true } }));

        const amount = round2(-Number(original.amount));
        const rate = Number(original.exchangeRate);
        // يومُ التاجر أولاً (`ق-٧٣٦`)، ولحظةٌ واحدة للرقم وللصفّ معاً.
        const reversalDate = date ? new Date(date) : new Date();
        const no = await this.nextPaymentNumber(tx, companyId, reversalDate);
        const bank = original.bankId ? await tx.bank.findUnique({ where: { id: original.bankId } }) : null;

        // الذمّةُ المعكوسة بأسعار فواتيرها هي نفسُها التي سُوّيت — الحسبةُ نفسُها مقلوبةَ الإشارة.
        const purchases = await tx.purchase.findMany({
          where: { id: { in: original.allocations.map((a) => a.purchaseId) } },
          select: { id: true, exchangeRate: true },
        });
        const rateByPurchase = new Map(purchases.map((p) => [p.id, { exchangeRate: Number(p.exchangeRate) }]));
        const basePayable = round2(
          -baseSettledOf(
            round2(Number(original.amount)),
            rate,
            original.allocations.map((a) => ({ documentId: a.purchaseId, amount: round2(Number(a.amount)) })),
            rateByPurchase,
          ),
        );

        const reversal = await tx.supplierPayment.create({
          data: {
            companyId,
            no,
            supplierId: original.supplierId,
            // فرعُ العكس فرعُ الأصل حتماً — لا يُشتقّ من جلسة من يضغط الزرّ.
            branchId: original.branchId,
            date: reversalDate,
            amount,
            method: original.method,
            bankId: original.bankId,
            reference: original.reference,
            notes: reason ?? `عكس السند ${original.no}`,
            currency: original.currency,
            exchangeRate: original.exchangeRate,
            baseAmount: round2(-Number(original.baseAmount)),
            reversesId: original.id,
            allocations: {
              create: original.allocations.map((a) => ({ companyId, purchaseId: a.purchaseId, amount: round2(-Number(a.amount)) })),
            },
          } as unknown as Prisma.SupplierPaymentUncheckedCreateInput,
        });

        await this.postAndSettle(tx, companyId, reversal.id, {
          no,
          supplierName: original.supplier.name,
          supplierId: original.supplierId,
          date: reversalDate,
          amount,
          currency: original.currency,
          exchangeRate: rate,
          branchId: original.branchId,
          bank,
          basePayable,
          description: `عكس سداد لمورّد — سند ${no} (يعكس ${original.no})`,
          reversal: true,
        });

        for (const a of original.allocations) await recomputePurchaseStatus(tx, a.purchaseId);

        return tx.supplierPayment.findUniqueOrThrow({ where: { id: reversal.id }, include: SUPPLIER_PAYMENT_INCLUDE });
      }),
    );
  }

  // ---------------- الداخل ----------------

  /** الترحيلُ + أثرُ الصندوق/البنك — مسارٌ واحد للسند وعكسه. */
  private async postAndSettle(
    tx: Prisma.TransactionClient,
    companyId: string,
    paymentId: string,
    p: {
      no: string;
      supplierName: string;
      /** مورّدُ السند — يُختم على أسطر القيد (ق-٨٧٣). */
      supplierId: string;
      date: Date;
      amount: number;
      currency: string;
      exchangeRate: number;
      branchId: string | null;
      /** `accountId` لازم: هو الطرفُ الدائن في القيد حين يُسدَّد على بنك (`ق-٢٧٧`). */
      bank: { id: string; accountId: string } | null;
      basePayable: number;
      description: string;
      reversal?: boolean;
    },
  ): Promise<void> {
    const entry = await postSupplierPaymentEntry(tx, companyId, {
      supplierId: p.supplierId,
      paymentNo: p.no,
      supplierName: p.supplierName,
      date: p.date,
      baseCash: toBaseAmount(p.amount, p.exchangeRate),
      basePayable: p.basePayable,
      branchId: p.branchId,
      reversal: p.reversal,
      // النقدُ يخرج من حساب البنك حين يُسدَّد على بنك، ومن `1000` نقداً — ولا درج (`ق-٨٧٢`).
      cashAccountId: p.bank?.accountId ?? null,
    });
    if (entry) await tx.supplierPayment.update({ where: { id: paymentId }, data: { journalEntryId: entry.id } });

    // النقدُ **يخرج** من الصندوق/البنك — فالحركةُ بإشارةٍ سالبة، والعكسُ (مبلغُه سالب) يعيدها.
    await mirrorBankMovement(tx, p.bank, {
      date: p.date,
      description: p.description,
      amount: round2(-p.amount),
      source: 'supplier-payment',
      currency: p.currency,
      exchangeRate: p.exchangeRate,
      entryNo: entry?.no ?? null,
    });
  }

  /** تسلسلُ سندات الصرف `PAY-<سنة>-####` — مستقلٌّ عن سندات القبض وعن المشتريات، بعدّادٍ ذرّيّ (`ق-٣٢٨`). */
  private async nextPaymentNumber(tx: Prisma.TransactionClient, companyId: string, paymentDate: Date): Promise<string> {
    return nextDocumentNumber(tx, companyId, paymentDate, { kind: 'PAY', pad: 4 }, (prefix) => highestSequenceOf(tx.supplierPayment, prefix));
  }
}
