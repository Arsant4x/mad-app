import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { resolveCurrency, toBaseAmount } from '../common/currency/base-amount.util';
import { highestSequenceOf, nextDocumentNumber } from '../common/document-sequence.util';
import { round2, formatMoney } from '../common/money/rounding';
import { retryOnUniqueConflict } from '../common/retry-on-conflict.util';
import { dayStartOf } from '../common/wall-clock.util';
import {
  allocatedByDocument,
  allocatedFor,
  assertReversible,
  baseSettledOf,
  deriveSettlementStatus,
  lockAndAssertAllocationsFit,
  SETTLEMENT_EPS as EPS,
  SettlementTarget,
  withRemaining,
} from '../common/settlement/settlement.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { formatMessage, MSG } from '../common/i18n/messages';
import { mirrorBankMovement, postCustomerPaymentEntry } from '../journal/auto-posting.util';
import { assertBranchAllowed, branchFilter, resolveBranchId } from '../branches/branch-scope.util';
import { AllocateDto, AllocationDto, CreatePaymentDto, RefundDto } from './dto/payment.dto';

const PAYMENT_INCLUDE = {
  customer: { select: { id: true, name: true } },
  allocations: { include: { invoice: { select: { id: true, no: true, total: true, currency: true } } } },
} as const;

/** هدفُ التسوية: الفواتير بمفتاح العميل — والآليةُ المشتركة في `common/settlement` (`ق-٨٧١`). */
const invoiceTarget = (tx: Prisma.TransactionClient): SettlementTarget => ({
  table: 'invoices',
  partyColumn: 'customerId',
  documentKey: 'invoiceId',
  allocations: tx.paymentAllocation,
  documentNotFound: MSG.invoice_not_found,
  wrongParty: MSG.allocation_wrong_customer,
});

/** تخصيصاتُ الطلب بمفردات التسوية المشتركة. */
const toSettlementAllocations = (allocations: AllocationDto[]) => allocations.map((a) => ({ documentId: a.invoiceId, amount: a.amount }));

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
 *
 * **والآليةُ مشتركة مع سند الصرف للمورّد** (`ق-٨٧١`): القفلُ والتخصيصُ والحالةُ المشتقّة
 * والذمّةُ بسعر المستند وأثرُ البنك وحرّاسُ العكس — كلُّها في `common/settlement`، وهنا
 * ما يخصّ العميلَ وحدَه: الردُّ والدرجُ والترقيمُ `RCV`/`RFD`.
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
   *
   * **على مستوى المنشأة بحقّها**: الذمّةُ ذمّةُ العميل على المنشأة لا على فرع —
   * وتوزيعُ دفعته يقتضي رؤيةَ كلّ فواتيره المفتوحة، وإلا بقيت فاتورةُ فرعٍ
   * محجوبٍ مفتوحةً لا تُسدَّد أبداً. ⚖️ ويُعرَض للمالك: فهي تُظهر أرقامَ فواتيرِ
   * فرعٍ آخر ومبالغَها لمن يوزّع الدفعة.
   */
  openInvoices(companyId: string, customerId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const invoices = await tx.invoice.findMany({
        where: { customerId, status: { not: 'PAID' } },
        select: { id: true, no: true, issueDate: true, dueDate: true, total: true, currency: true, status: true },
        orderBy: { issueDate: 'asc' },
      });
      return withRemaining(invoices, await allocatedByDocument(invoiceTarget(tx), invoices.map((i) => i.id)));
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

        const invoices = await lockAndAssertAllocationsFit(tx, invoiceTarget(tx), {
          amount,
          currency,
          partyId: dto.customerId,
          allocations: toSettlementAllocations(allocations),
        });

        const no = await this.nextPaymentNumber(tx, companyId, new Date(dto.date));
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
          customerId: customer.id,
          date: new Date(dto.date),
          amount,
          currency,
          exchangeRate,
          branchId,
          bank,
          baseReceivable: baseSettledOf(amount, exchangeRate, toSettlementAllocations(allocations), invoices),
          description: `مقبوض من عميل — سند ${no} — ${customer.name}`,
        });

        for (const a of allocations) await this.recomputeInvoiceStatus(tx, a.invoiceId);

        return tx.payment.findUniqueOrThrow({ where: { id: payment.id }, include: PAYMENT_INCLUDE });
      }),
    );
  }

  /**
   * ⭐ **سندُ قبضٍ لبيع الكاشير — بالمسار المبنيّ لا بمسارٍ ثانٍ** (`ق-٣١٦`).
   *
   * ── لماذا سندٌ حقيقيّ ─────────────────────────────────────────────────
   *
   * كان بيعُ الكاشير يُنشئ `posPayment` **ولا يُنشئ دفعة**، فيبقى **غيرَ مرئيٍّ
   * لوحدة الدفعات كلِّها**: الأستاذُ لا يرى نقده (`ق-٣٠٩`)، **والأعمارُ تعدّه
   * ديناً**، **والردُّ يرفضه** (`refundableOf` يقيس المسدَّد من صفوف الدفعات،
   * فيعود القابلُ للردّ صفراً). **وثلاثتها تُغلق بسندٍ واحد.**
   *
   * ⚠️ **ويعمل داخل معاملة المستدعي** (`tx` مُمرَّرة): البيعُ والسندُ يقعان
   * معاً أو لا يقع أيّهما — **فبيعٌ بلا سند هو العطلُ الذي أُغلق**.
   *
   * ⚠️ **وسندٌ لكل طريقةٍ لا سندٌ يجمعها**: `Payment.method` واحدةٌ للصفّ،
   * **والبيعُ المختلط دفعتان حقيقيّتان** — نقدٌ إلى حساب الدرج وشبكةٌ إلى
   * `1251`. وهو ما يقوله الواقع: العميلُ دفع مرّتين.
   */
  async recordPosReceipt(
    tx: Prisma.TransactionClient,
    companyId: string,
    input: {
      invoiceId: string;
      invoiceNo: string;
      customerId: string;
      customerName: string;
      date: Date;
      branchId: string | null;
      currency: string;
      exchangeRate: number;
      method: 'CASH' | 'CARD';
      amount: number;
      /** حسابُ درج المناوبة للنقد — و`null` يسقط إلى `1000` بإعلان. */
      drawerAccountId: string | null;
      /** حسابُ `1251` للشبكة. */
      networkAccountId: string;
    },
  ): Promise<void> {
    const amount = round2(input.amount);
    if (amount === 0) return;

    const no = await this.nextPaymentNumber(tx, companyId, input.date);
    const payment = await tx.payment.create({
      data: {
        companyId,
        no,
        customerId: input.customerId,
        branchId: input.branchId,
        date: input.date,
        amount,
        method: input.method,
        notes: `تحصيل بيع كاشير — ${input.invoiceNo}`,
        currency: input.currency,
        exchangeRate: input.exchangeRate,
        baseAmount: toBaseAmount(amount, input.exchangeRate),
        allocations: { create: [{ companyId, invoiceId: input.invoiceId, amount }] },
      } as unknown as Prisma.PaymentUncheckedCreateInput,
    });

    await this.postAndSettle(tx, companyId, payment.id, {
      no,
      customerName: input.customerName,
      customerId: input.customerId,
      date: input.date,
      amount,
      currency: input.currency,
      exchangeRate: input.exchangeRate,
      branchId: input.branchId,
      bank: null,
      drawerAccountId: input.method === 'CARD' ? input.networkAccountId : input.drawerAccountId,
      baseReceivable: toBaseAmount(amount, input.exchangeRate),
      description: `تحصيل بيع كاشير — سند ${no} — ${input.invoiceNo}`,
    });

    await this.recomputeInvoiceStatus(tx, input.invoiceId);
  }

  /**
   * إعادة توزيع دفعة قائمة: تحلّ المجموعة الجديدة محلّ تخصيصاتها كلها.
   *
   * **على مستوى المنشأة بحقّها**: عكسُ السند يُقرأ برابط الأصل (`reversesId`) لا بقائمة
   * رؤية — رابطُ مستندٍ بمستنده، وحجبُه بفرعٍ يُظهر السندَ المعكوس قابلاً للتوزيع من جديد.
   */
  allocate(companyId: string, id: string, dto: AllocateDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id }, include: { allocations: true } });
      if (!payment) throw new NotFoundException(MSG.payment_not_found);
      // ⚖️ سندٌ له عكسٌ لا يُعاد توزيعُه (`ق-١١٩٨`/⑤ — مراجعةٌ خارجية): كان الفحصُ على «هو عكسٌ»
      //    وحدَه، فسندٌ عُكس كان يُعاد توزيعُه على فاتورةٍ أخرى — وعكسُه يحمل مرآةَ التوزيع
      //    القديم، فتُختم فاتورةٌ مسدَّدةً بمالٍ رُدّ. الفحصُ نفسُه الذي يحرس العكسَ الثاني.
      assertReversible(payment, await tx.payment.findFirst({ where: { reversesId: id }, select: { no: true } }));

      const requested = dto.allocations.map((a) => ({ invoiceId: a.invoiceId, amount: round2(a.amount) }));
      const touched = new Set<string>([...payment.allocations.map((a) => a.invoiceId), ...requested.map((a) => a.invoiceId)]);

      // القديمة تُطرح أولاً — وإلا رفضنا إعادةَ توزيعٍ لا تتجاوز شيئاً حقيقةً.
      await tx.paymentAllocation.deleteMany({ where: { paymentId: id } });
      await lockAndAssertAllocationsFit(tx, invoiceTarget(tx), {
        amount: round2(Number(payment.amount)),
        currency: payment.currency,
        partyId: payment.customerId,
        allocations: toSettlementAllocations(requested),
      });

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
   *
   * **على مستوى المنشأة بحقّها**: عكسُ السند يقرأ عكسَه السابق وفواتيرَ
   * تخصيصاته هو — روابطُ مستندٍ لا قوائمُ رؤية، وحجبُ فاتورةٍ منها يعكس نصفَ
   * السند ويترك الذمّةَ مختلّة.
   */
  reverse(companyId: string, id: string, reason?: string, date?: string) {
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const original = await tx.payment.findUnique({ where: { id }, include: { allocations: true, customer: { select: { name: true } } } });
        if (!original) throw new NotFoundException(MSG.payment_not_found);
        assertReversible(original, await tx.payment.findFirst({ where: { reversesId: id }, select: { no: true } }));

        const amount = round2(-Number(original.amount));
        const rate = Number(original.exchangeRate);
        // لحظةٌ واحدة للرقم وللصفّ معاً. ونداءان منفصلان لـ`new Date()` قد
        // يقعان على طرفَي منتصف الليل، فيحمل السند رقم سنةٍ وتاريخَ أخرى.
        // ⚖️ **ويومُ التاجر أوّلاً** (`ق-٧٣٦`): يُقرأ من الطلب (`YYYY-MM-DD` → منتصفُ ليل `UTC` كسائر
        //    المستندات)، ولا يُشتقّ من ساعة الخادم إلا لعميلٍ لم يُرسله — حدٌّ معلَن.
        const reversalDate = date ? new Date(date) : new Date();
        const no = await this.nextPaymentNumber(tx, companyId, reversalDate);
        const bank = original.bankId ? await tx.bank.findUnique({ where: { id: original.bankId } }) : null;

        // الذمّة المعكوسة بأسعار فواتيرها هي نفسها التي سُوّيت — فيتطابق
        // القيدان طرفاً بطرف ويعود 5600 إلى ما كان: الحسبةُ نفسُها التي سوّت الأصل، مقلوبةَ الإشارة.
        const invoices = await tx.invoice.findMany({
          where: { id: { in: original.allocations.map((a) => a.invoiceId) } },
          select: { id: true, exchangeRate: true },
        });
        const rateByInvoice = new Map(invoices.map((i) => [i.id, { exchangeRate: Number(i.exchangeRate) }]));
        const baseReceivable = round2(
          -baseSettledOf(
            round2(Number(original.amount)),
            rate,
            original.allocations.map((a) => ({ documentId: a.invoiceId, amount: round2(Number(a.amount)) })),
            rateByInvoice,
          ),
        );

        const reversal = await tx.payment.create({
          data: {
            companyId,
            no,
            customerId: original.customerId,
            // فرع العكس هو فرع الأصل حتماً — لا يُشتق من جلسة من يضغط الزر.
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
            allocations: { create: original.allocations.map((a) => ({ companyId, invoiceId: a.invoiceId, amount: round2(-Number(a.amount)) })) },
          } as unknown as Prisma.PaymentUncheckedCreateInput,
        });

        await this.postAndSettle(tx, companyId, reversal.id, {
          no,
          customerName: original.customer.name,
          customerId: original.customerId,
          // القيدُ بيوم السند نفسِه — لا `new Date()` ثانيةٌ قد تقع على طرف منتصف الليل الآخر (`ق-٧٣٦`).
          date: reversalDate,
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

  /**
   * سندُ ردٍّ لمرتجع (`SPEC 30.8`، قرار المالك 2026-09-03) — **سندٌ مستقل مربوطٌ بالإشعار الدائن**،
   * لا عكسٌ لسند القبض: العكس يمحو واقعة، والدفتر وقائع لا حالات.
   *
   * **الخصم من غير المسدَّدة إلزاميّ:** القابل للردّ = مجموع إشعارات الفاتورة الأصلية − ما يخصم
   * متبقّيها غير المسدَّد − ما رُدّ سابقاً على إشعاراتها. فإشعارٌ على فاتورةٍ لم تُسدَّد لا يردّ
   * نقداً شيئاً حتى يُستهلك في الخصم. والمبلغ يُخزَّن **سالباً** (كالعكس) كي تصدق كل حسبةٍ تجمع
   * الدفعات، و`kind = REFUND` و`refundsInvoiceId` يُبقيان الواقعة مسمّاةً لا عكساً مجهولاً.
   * ترقيمُه سلسلةٌ مستقلة `RFD-` — فسند القبض والردّ لا يتزاحمان على عدّادٍ واحد.
   *
   * **على مستوى المنشأة بحقّها**: المناوبةُ تُقرأ بمعرّفها المحفوظ على فاتورة
   * البيع لتحديد الدرج الذي يخرج منه الردّ — مفتاحٌ محفوظٌ لا قائمة، ولو حُجبت
   * لخرج الردُّ من الصندوق العامّ فاتُّهم الكاشير بفرق.
   */
  refund(companyId: string, allowedBranchIds: string[] | 'all', dto: RefundDto) {
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const note = await tx.invoice.findUnique({
          where: { id: dto.creditNoteId },
          include: {
            customer: { select: { id: true, name: true } },
            relatedInvoice: { select: { id: true, total: true, posShiftId: true } },
          },
        });
        if (!note || note.docType !== 'CREDIT_NOTE' || !note.relatedInvoice) throw new BadRequestException(MSG.refund_target_invalid);
        assertBranchAllowed(allowedBranchIds, note.branchId);

        if (dto.method === 'BANK' && !dto.bankId) throw new BadRequestException(MSG.bank_required);
        const bank = dto.bankId ? await tx.bank.findUnique({ where: { id: dto.bankId } }) : null;
        if (dto.bankId && !bank) throw new NotFoundException(MSG.bank_not_found);

        const refundable = await this.refundableOf(tx, note.relatedInvoice);
        if (refundable <= EPS) throw new BadRequestException(MSG.refund_nothing_refundable);
        const amount = round2(dto.amount ?? refundable);
        if (amount <= 0 || amount > refundable + EPS) {
          throw new BadRequestException(formatMessage(MSG.refund_exceeds_refundable, { refundable: formatMoney(refundable), amount: formatMoney(amount) }));
        }

        const rate = Number(note.exchangeRate);
        const date = new Date(dto.date);
        const no = await this.nextPaymentNumber(tx, companyId, date, 'RFD');
        const payment = await tx.payment.create({
          data: {
            companyId,
            no,
            kind: 'REFUND',
            refundsInvoiceId: note.id,
            customerId: note.customerId,
            // فرع الردّ فرعُ الإشعار — لا فرعُ من ضغط الزر.
            branchId: note.branchId,
            date,
            amount: -amount,
            method: dto.method,
            bankId: bank?.id,
            reference: dto.reference,
            notes: dto.notes ?? `ردّ مرتجع — إشعار دائن ${note.no}`,
            currency: note.currency,
            exchangeRate: rate,
            baseAmount: round2(-toBaseAmount(amount, rate)),
          } as unknown as Prisma.PaymentUncheckedCreateInput,
        });

        /**
         * ⭐ **الردُّ النقديُّ يخرج من الدرج الذي دخله البيع** (`ق-٣١٠`).
         *
         * **ومن مناوبةٍ ما زالت مفتوحة وحدها**: مناوبةٌ أُقفلت جُرد درجُها
         * ورُحّل فرقُها (`ق-٣٠٨`) — **فمسُّ حسابها بعد الإقفال يفسد عدّاً
         * مُغلقاً**. وما عداه يخرج من `1000` كما كان.
         *
         * ⚠️ **وليس زيادةً على `ق-٣٠٩` بل نصفُه**: البيعُ يدخل الدرج، **فلو
         * خرج الردُّ من `1000` لأظهر الجردُ فائضاً كاذباً واتّهم الكاشيرَ
         * بفرقٍ صنعه النظام**.
         */
        const openShift = note.relatedInvoice.posShiftId
          ? await tx.posShift.findFirst({
              where: { id: note.relatedInvoice.posShiftId, status: 'OPEN' },
              select: { drawer: { select: { accountId: true } } },
            })
          : null;

        await this.postAndSettle(tx, companyId, payment.id, {
          no,
          customerName: note.customer.name,
          customerId: note.customerId,
          date,
          amount: -amount,
          currency: note.currency,
          exchangeRate: rate,
          branchId: note.branchId,
          bank,
          drawerAccountId: openShift?.drawer?.accountId ?? null,
          baseReceivable: round2(-toBaseAmount(amount, rate)),
          description: `ردّ مرتجع — سند ${no} — إشعار دائن ${note.no} — ${note.customer.name}`,
          refund: true,
        });

        return tx.payment.findUniqueOrThrow({ where: { id: payment.id }, include: PAYMENT_INCLUDE });
      }),
    );
  }

  /**
   * القابل للردّ على فاتورةٍ أصلية (`SPEC 30.8`) — **من التخصيصات والإشعارات والردود، لا من حقل**:
   * الإشعارات تخصم أولاً من غير المسدَّد، وما فاض هو ما يجوز ردُّه، ناقص ما رُدّ فعلاً.
   *
   * **على مستوى المنشأة بحقّها**: القابلُ للردّ يُحسب من كلّ إشعارات الفاتورة
   * وردودها أياً كان فرعُها — فردٌّ في فرعٍ محجوبٍ إن غاب عن الحساب رُدّ المبلغُ
   * مرّتين.
   */
  private async refundableOf(tx: Prisma.TransactionClient, invoice: { id: string; total: Prisma.Decimal }): Promise<number> {
    const paid = await allocatedFor(invoiceTarget(tx), invoice.id);
    const credits = await tx.invoice.aggregate({ where: { relatedInvoiceId: invoice.id, docType: 'CREDIT_NOTE' }, _sum: { total: true } });
    const creditsTotal = round2(Number(credits._sum.total ?? 0));
    const unpaidBeforeCredits = round2(Number(invoice.total) - paid);
    const offset = Math.min(creditsTotal, Math.max(0, unpaidBeforeCredits));
    // الردود مخزَّنةٌ سالبة — فمجموعها سالبٌ ويُقلب.
    const refunded = await tx.payment.aggregate({ where: { kind: 'REFUND', refundsInvoice: { relatedInvoiceId: invoice.id } }, _sum: { amount: true } });
    const refundedTotal = round2(-Number(refunded._sum.amount ?? 0));
    return round2(creditsTotal - offset - refundedTotal);
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

  /**
   * إعادة حساب حالة الفاتورة من تخصيصاتها — **المدخل الوحيد** لكتابة الحالة.
   *
   * المدفوع يتقدّم على التأخر: فاتورة مسدَّدة جزئياً ومتأخرة تُقرأ PARTIAL،
   * والأعمار (4.6) هي من يفصل التأخر لاحقاً. **والاشتقاقُ مشترك** (`deriveSettlementStatus`)؛
   * وما يخصّ الفاتورةَ وحدَها هو `OVERDUE` على المستحقّ الذي فات موعدُه.
   */
  private async recomputeInvoiceStatus(tx: Prisma.TransactionClient, invoiceId: string): Promise<void> {
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { id: true, total: true, status: true, dueDate: true } });
    if (!invoice) return;
    const derived = deriveSettlementStatus(await allocatedFor(invoiceTarget(tx), invoiceId), Number(invoice.total));

    // يومُ الآن بإزاحةٍ معلَنة لا بمنطقة العملية (`ق-١١٩٠`) — فحكمُ «متأخّرة» يقرؤه التاجر.
    const today = dayStartOf(new Date());
    const status = derived === 'DUE' && invoice.dueDate < today ? 'OVERDUE' : derived;
    if (status !== invoice.status) await tx.invoice.update({ where: { id: invoiceId }, data: { status } });
  }

  /** الترحيل + أثر الصندوق/البنك — مسار واحد للدفعة وعكسها. */
  private async postAndSettle(
    tx: Prisma.TransactionClient,
    companyId: string,
    paymentId: string,
    p: {
      no: string;
      customerName: string;
      /** عميلُ السند — يُختم على أسطر القيد (ق-٨٧٣). */
      customerId: string;
      date: Date;
      amount: number;
      currency: string;
      exchangeRate: number;
      branchId: string | null;
      /** `accountId` لازمٌ لا تكميلي (`ق-٢٧٧`): هو الطرفُ المدين في القيد. */
      bank: { id: string; accountId: string } | null;
      baseReceivable: number;
      description: string;
      reversal?: boolean;
      /** سندُ ردٍّ لمرتجع (`SPEC 30.8`) — مبلغه سالبٌ كالعكس، ومذكّرته تسمّيه. */
      refund?: boolean;
      /**
       * ⭐ **نقدُ المناوبة يخرج من درجها** (`ق-٣٠٩`/`ق-٣١٠`) — لا من `1000`.
       *
       * ⚠️ **وهو نصفُ الإصلاح لا زيادةٌ عليه**: البيعُ صار يدخل حسابَ الدرج،
       * **فلو خرج الردُّ من `1000` أظهر الجردُ فائضاً كاذباً في الدرج وعجزاً
       * في `1000`** — **واتّهم `ق-٣٠٨` الكاشيرَ بفرقٍ صنعه النظام**.
       */
      drawerAccountId?: string | null;
    },
  ): Promise<void> {
    const entry = await postCustomerPaymentEntry(tx, companyId, {
      customerId: p.customerId,
      paymentNo: p.no,
      customerName: p.customerName,
      date: p.date,
      baseCash: toBaseAmount(p.amount, p.exchangeRate),
      baseReceivable: p.baseReceivable,
      branchId: p.branchId,
      reversal: p.reversal,
      refund: p.refund,
      // (ق-٢٧٧) النقدُ يدخل **حسابَ البنك** حين تُقبض الدفعة على بنك — وقبلَه
      // كان يدخل `1000` دائماً، فيُعدّ نقدُ البنك صندوقاً (ق-٢٧٦).
      // و(ق-٣٠٩) نقداً على مناوبةٍ مفتوحة ⟵ **حسابُ درجها**، وإلا `1000`.
      cashAccountId: p.bank?.accountId ?? p.drawerAccountId ?? null,
    });
    if (entry) await tx.payment.update({ where: { id: paymentId }, data: { journalEntryId: entry.id } });

    // النقد يدخل صندوق فرع الدفعة (صندوق = Bank مربوط بفرع) — نفس نمط
    // مقبوضات الإيجار: رصيد يتحرك وحركة بنكية تُسجَّل. العكس ينقص الرصيد
    // لأن مبلغه سالب.
    await mirrorBankMovement(tx, p.bank, {
      date: p.date,
      description: p.description,
      amount: p.amount,
      source: 'customer-payment',
      currency: p.currency,
      exchangeRate: p.exchangeRate,
      entryNo: entry?.no ?? null,
    });
  }

  /** تسلسل سندات القبض مستقل عن الفواتير — يُشتق من جدول الدفعات وحده.
   * وسندات الردّ سلسلةٌ ثانية `RFD-` (`SPEC 30.8`): لا يتزاحم المقبوض والمردود على عدّادٍ واحد. */
  private async nextPaymentNumber(
    tx: Prisma.TransactionClient,
    companyId: string,
    paymentDate: Date,
    kind: 'RCV' | 'RFD' = 'RCV',
  ): Promise<string> {
    // عدّادٌ ذرّيّ لا مسحُ سنة (ق-٣٢٨) — والبذرُ من أعلى قائمٍ مرّةً واحدة.
    return nextDocumentNumber(tx, companyId, paymentDate, { kind, pad: 4 }, (prefix) => highestSequenceOf(tx.payment, prefix));
  }
}
