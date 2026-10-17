import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { companyToday } from '../common/company-day.util';
import { companyBaseCurrency, resolveCurrencyWithin, toBaseAmount } from '../common/currency/base-amount.util';
import { highestSequenceOf, nextDocumentNumber } from '../common/document-sequence.util';
import { round2, formatMoney } from '../common/money/rounding';
import { money } from '../common/money/text';
import { retryOnUniqueConflict } from '../common/retry-on-conflict.util';
import { IdempotentReplay, type KeyedRequest, onceForKey, onceForRequest, recordKeyedRequest } from '../common/idempotency/idempotency';
import {
  allocatedByDocument,
  allocatedFor,
  assertReversible,
  baseSettledOf,
  lockAndAssertAllocationsFit,
  lockDocumentRow,
  SETTLEMENT_EPS as EPS,
  withAllocatedTotals,
  withRemaining,
} from '../common/settlement/settlement.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { formatMessage, MSG } from '../common/i18n/messages';
import { FX_DIFFERENCE_ACCOUNT, mirrorBankMovement, postCustomerPaymentEntry } from '../journal/auto-posting.util';
import { getOrCreateAccountByCode, NETWORK_RECEIVABLE_CODE, NETWORK_RECEIVABLE_NAME } from '../journal/pos-settlement.util';
import { assertBoxInBranch, assertBranchAllowed, branchFilter, maskForeignDocument, resolveBranchId } from '../branches/branch-scope.util';
import { listOrPage, mapList, searchTerm } from '../common/pagination/paged.util';
import { ListPaymentsQueryDto } from './dto/list-payments-query.dto';
import { AllocateDto, AllocationDto, CreatePaymentDto, RefundDto, UNALLOCATED_DECLARATION_MIN } from './dto/payment.dto';
import { resolveDeclaredLineTax, type LineTax } from '../common/vat/line-tax.util';
import { InvoicesService } from '../invoices/invoices.service';
import { NOT_REPLACED_REJECTED } from '../invoices/active-documents.util';
import { CREDIT_NOTES_ON_DOCUMENT, creditedTotal, invoiceTarget, RECEIVABLE_INVOICE_KINDS, recomputeInvoiceStatus } from '../invoices/invoice-settlement.util';
import { assertPrepaymentIssuable } from '../invoices/issue-prechecks.util';
import { unallocatedReceivableRate } from './voucher-receivable-rate.util';

const PAYMENT_INCLUDE = {
  customer: { select: { id: true, name: true } },
  // `branchId` ليُحجب مستندُ فرعٍ آخر عن المقيَّد (`maskForeignDocument` · `ق-١٥٨١`).
  allocations: { include: { invoice: { select: { id: true, no: true, total: true, currency: true, branchId: true } } } },
  // ④A1: فاتورةُ الدفعة المقدَّمة التي أصدرها السند — تقرؤها الشاشةُ من هنا لا تستنتجها.
  prepaymentInvoice: { select: { id: true, no: true, total: true } },
} as const;

/** تخصيصاتُ الطلب بمفردات التسوية المشتركة. */
const toSettlementAllocations = (allocations: AllocationDto[]) => allocations.map((a) => ({ documentId: a.invoiceId, amount: a.amount }));

/** تخصيصاتُ السند كما يراها القارئ: فاتورةُ فرعٍ آخر يسقط رقمُها ومبلغُها ويبقى مبلغُ التخصيص (`ق-١٥٨١`). */
function scopeAllocations<P extends { allocations: { invoice: { id: string; branchId: string | null } }[] }>(allowedBranchIds: string[] | 'all', payment: P) {
  if (allowedBranchIds === 'all') return payment;
  return { ...payment, allocations: payment.allocations.map((a) => ({ ...a, invoice: maskForeignDocument(allowedBranchIds, a.invoice) })) };
}

/**
 * ⚖️ **التخصيصُ على فاتورةٍ يراها القارئ** (`ق-١٥٨١`): قائمةُ الفواتير المفتوحة مرشَّحةٌ بفروعه، فتخصيصٌ بمعرّفٍ على فاتورة فرعٍ
 * آخر بابٌ جانبيٌّ إليها — يُردّ كالفاتورة الغائبة (404)، كقراءتها. والمالكُ ومن يرى الفروعَ كلَّها لا يُقاس.
 */
async function assertInvoicesVisible(tx: Prisma.TransactionClient, allowedBranchIds: string[] | 'all', allocations: AllocationDto[] | undefined): Promise<void> {
  if (allowedBranchIds === 'all' || !allocations?.length) return;
  const ids = [...new Set(allocations.map((a) => a.invoiceId))];
  const visible = await tx.invoice.count({ where: { id: { in: ids }, ...branchFilter(allowedBranchIds) } });
  if (visible !== ids.length) throw new NotFoundException(MSG.invoice_not_found);
}

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
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    // ④A1: فاتورةُ الدفعة المقدَّمة تصدر من مسار الفواتير نفسِه (ترقيمٌ · ترحيلٌ · حدثُ إصدار).
    private readonly invoices: InvoicesService,
  ) {}

  list(companyId: string, allowedBranchIds: string[] | 'all', query?: ListPaymentsQueryDto) {
    const term = searchTerm(query);
    const where: Prisma.PaymentWhereInput = {
      ...(query?.customerId ? { customerId: query.customerId } : {}),
      // مرشِّحُ الفرع وشرطُ البحث كلاهما `OR`، فيُجمعان تحت `AND` لا بنشرٍ يحلّ فيه الثاني محلّ الأوّل (توجيه ٢٧٤ · ج-2).
      AND: [
        branchFilter(allowedBranchIds),
        // حقولُ البحث المُعلَنة (`ق-١٢٣٦`): رقمُ السند والمرجعُ والملاحظاتُ واسمُ العميل — والأخيرُ علاقةٌ
        // فلا يمرّ من `searchWhere` بل يُكتب هنا داخل `OR` نفسِه.
        term
          ? {
              OR: [
                { no: { contains: term, mode: 'insensitive' } },
                { reference: { contains: term, mode: 'insensitive' } },
                { notes: { contains: term, mode: 'insensitive' } },
                { customer: { name: { contains: term, mode: 'insensitive' } } },
              ],
            }
          : {},
      ],
    };
    // المخصَّصُ وغيرُ المخصَّص على كلِّ صفّ — من التخصيصات في الخادم لا في الشاشة (`ق-١٢٤٣`).
    // (`listOrPage` لا `pagedFindMany`: الصفُّ يُقرأ بضمائمه فيُستنتج نوعُه من النداء نفسِه؛ والترتيبُ
    // مختومٌ بـ`id` — `ق-٣٥٦`.)
    const args = { where, include: PAYMENT_INCLUDE, orderBy: [{ date: 'desc' as const }, { createdAt: 'desc' as const }, { id: 'desc' as const }] };
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) =>
      mapList(
        await listOrPage(query, {
          all: () => tx.payment.findMany(args),
          count: () => tx.payment.count({ where }),
          window: (offset, limit) => tx.payment.findMany({ ...args, skip: offset, take: limit }),
        }),
        (p) => withAllocatedTotals(scopeAllocations(allowedBranchIds, p)),
      ),
    );
  }

  async findOne(companyId: string, allowedBranchIds: string[] | 'all', id: string) {
    // سندُ فرعٍ خارج فروع الفاعل غيرُ موجودٍ له — 404 لا 403، فلا يُسرَّب وجودُه (`ق-١٤٤٠`).
    const payment = await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.payment.findFirst({ where: { id, ...branchFilter(allowedBranchIds) }, include: PAYMENT_INCLUDE }),
    );
    if (!payment) throw new NotFoundException(MSG.payment_not_found);
    return withAllocatedTotals(scopeAllocations(allowedBranchIds, payment));
  }

  /**
   * فواتير العميل المفتوحة بمتبقّيها — **محسوباً من التخصيصات** لا من حقل
   * مخزَّن (قاعدة الوحدة). هذه هي الشاشة التي يوزّع منها المحاسب دفعته.
   *
   * **على مستوى المنشأة بحقّها**: الذمّةُ ذمّةُ العميل على المنشأة لا على فرع —
   * وتوزيعُ دفعته يقتضي رؤيةَ كلّ فواتيره المفتوحة، وإلا بقيت فاتورةُ فرعٍ
   * محجوبٍ مفتوحةً لا تُسدَّد أبداً. ⚖️ ويُعرَض للمالك: فهي تُظهر أرقامَ فواتيرِ
   * فرعٍ آخر ومبالغَها لمن يوزّع الدفعة.
   *
   * ⚖️ **وحُكم فيه** (توجيه ٢٧٥ · `ق-١٥٨١`): «القوائمُ تُرشَّح بفروع القارئ». فالمالكُ ومن يرى الفروعَ كلَّها يوزّع على فواتير
   * المنشأة كلِّها، والمقيَّدُ على فواتير فرعه وما بلا فرع؛ وفاتورةُ الفرع الآخر يوزّع عليها من يراها.
   */
  openInvoices(companyId: string, allowedBranchIds: string[] | 'all', customerId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // Only what can take a payment: invoices and debit notes, without a rejected invoice that was replaced.
      // The branch filter and the replacement condition are both OR clauses, so they sit under AND.
      const invoices = await tx.invoice.findMany({
        where: { customerId, docType: { in: [...RECEIVABLE_INVOICE_KINDS] }, status: { not: 'PAID' }, AND: [branchFilter(allowedBranchIds), NOT_REPLACED_REJECTED] },
        select: { id: true, no: true, docType: true, issueDate: true, dueDate: true, total: true, currency: true, status: true, adjustments: CREDIT_NOTES_ON_DOCUMENT },
        orderBy: { issueDate: 'asc' },
      });
      const credited = new Map(invoices.map((i) => [i.id, creditedTotal(i.adjustments)]));
      const open = withRemaining(invoices, await allocatedByDocument(invoiceTarget(tx), invoices.map((i) => i.id)), credited, 'CREDIT_NOTE');
      // ② المسدَّدُ والمتبقّي نصّاً بخانتين على الحدّ (`ق-١٢٣٥`) — والترشيحُ داخل `withRemaining` رقمٌ كما كان.
      return open.map((doc) => ({
        id: doc.id,
        no: doc.no,
        issueDate: doc.issueDate,
        dueDate: doc.dueDate,
        total: doc.total,
        currency: doc.currency,
        status: doc.status,
        allocated: money(doc.allocated),
        remaining: money(doc.remaining),
      }));
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
  create(companyId: string, allowedBranchIds: string[] | 'all', dto: CreatePaymentDto, idempotencyKey?: string) {
    // ⚖️ الإرسالُ المكرّر لا يُنشئ سندين (توجيه ٢٧٦ · ق-١٦٠٩/ب): المفتاحُ نفسُه يعيد السندَ نفسَه — `onceForKey`.
    return onceForKey(
      idempotencyKey,
      () => this.replayByKey(companyId, allowedBranchIds, idempotencyKey!, dto),
      () => this.createOnce(companyId, allowedBranchIds, dto, idempotencyKey),
    );
  }

  /**
   * السندُ المكتوبُ بالمفتاح — أو `null`؛ ويُرفض `409` إن خالف الطلبُ ما كُتب به (طرفاً أو مبلغاً).
   *
   * **على مستوى المنشأة بحقّها**: مفتاحُ الطلب فريدٌ في المنشأة كلِّها بقيد القاعدة، فالبحثُ به لا يُقصر على فروع القارئ — وإلا
   * اصطدم الإنشاءُ بالقيد ثم لم يجد ما اصطدم به. **وما يُعاد للقارئ يُقاس بفروعه بعد البحث**: سندٌ في فرعٍ لا يملكه يُردّ `409`
   * كالمفتاح المعاد لطلبٍ آخر، فلا يُكشف له سندُ فرعٍ آخر ولا وجودُه.
   */
  private replayByKey(companyId: string, allowedBranchIds: string[] | 'all', key: string, dto: CreatePaymentDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.payment.findFirst({ where: { clientRequestId: key }, include: PAYMENT_INCLUDE });
      if (!existing) return null;
      const outsideReader = allowedBranchIds !== 'all' && existing.branchId !== null && !allowedBranchIds.includes(existing.branchId);
      if (outsideReader || existing.customerId !== dto.customerId || round2(Number(existing.amount)) !== round2(dto.amount)) throw new ConflictException(MSG.idempotency_key_reused);
      return withAllocatedTotals(existing);
    });
  }

  /**
   * الكتابةُ مرّةً لكلِّ مفتاح — وبلا مفتاحٍ كما كانت.
   *
   * **على مستوى المنشأة بحقّها**: فحصُ المفتاح داخل المعاملة يرى المنشأةَ كلَّها لأن القيدَ الذي يحميه عليها كلِّها؛ وهو فحصُ
   * وجودٍ يرمي ولا يُعيد شيئاً، والإعادةُ للقارئ في `replayByKey` بفروعه.
   */
  private createOnce(companyId: string, allowedBranchIds: string[] | 'all', dto: CreatePaymentDto, idempotencyKey?: string) {
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        // طلبٌ موازٍ بالمفتاح نفسِه سبق فكتب — لا يُكتب ثانٍ، ويُقرأ ما كُتب (`onceForKey`).
        if (idempotencyKey && (await tx.payment.findFirst({ where: { clientRequestId: idempotencyKey }, select: { id: true } }))) throw new IdempotentReplay();
        // بلا عملةٍ صريحة ⟵ عملةُ أساس المنشأة لا الريال (`ق-١٣٦٨`).
        const { currency, exchangeRate } = await resolveCurrencyWithin(tx, companyId, dto);
        const customer = await tx.customer.findUnique({ where: { id: dto.customerId }, select: { id: true, name: true } });
        if (!customer) throw new NotFoundException(MSG.customer_not_found);

        if (dto.method === 'BANK' && !dto.bankId) throw new BadRequestException(MSG.bank_required);
        // الشبكةُ ذمّةٌ على المستحوذ (`1251` — `ق-٣٢٠`) لا نقدٌ في بنك: بنكٌ معها يُدخل المالَ قبل أن يصل.
        if (dto.method === 'CARD' && dto.bankId) throw new BadRequestException(MSG.payment_card_no_bank);
        const bank = dto.bankId ? await tx.bank.findUnique({ where: { id: dto.bankId } }) : null;
        if (dto.bankId && !bank) throw new NotFoundException(MSG.bank_not_found);
        const networkAccountId =
          dto.method === 'CARD' ? (await getOrCreateAccountByCode(tx, companyId, NETWORK_RECEIVABLE_CODE, NETWORK_RECEIVABLE_NAME, 'asset')).id : null;

        const branchId = await resolveBranchId(tx, dto.branchId, allowedBranchIds);
        // مستندٌ في فرعٍ لا يستعمل صندوقَ فرعٍ آخر (`ق-١٤٣٧`).
        await assertBoxInBranch(tx, branchId, bank);
        const amount = round2(dto.amount);
        const allocations = (dto.allocations ?? []).map((a) => ({ invoiceId: a.invoiceId, amount: round2(a.amount) }));
        await assertInvoicesVisible(tx, allowedBranchIds, allocations);

        const invoices = await lockAndAssertAllocationsFit(tx, invoiceTarget(tx), {
          amount,
          currency,
          partyId: dto.customerId,
          allocations: toSettlementAllocations(allocations),
        });

        // ④A1: ما فوق المخصَّص يُعلَن مصيرُه قبل أيّ كتابة — دفعةٌ مقدَّمة بمستندٍ، أو على الحساب مغطّىً بفواتيرَ مفتوحة.
        const allocatedNow = round2(allocations.reduce((s, a) => s + a.amount, 0));
        const remainder = round2(amount - allocatedNow);
        const declared = remainder > UNALLOCATED_DECLARATION_MIN ? dto.unallocated : undefined;
        if (remainder > UNALLOCATED_DECLARATION_MIN && !declared) {
          throw new BadRequestException(formatMessage(MSG.payment_unallocated_choice_required, { remainder: money(remainder) }));
        }
        // ④A1: فئةُ ما يُدفع مقدَّماً عنه تُعلَن مع الإعلان — ولا `S` مفترضة (`ق-١٢٦٤`/②)؛ تُحلّ هنا قبل أيّ كتابة فيُرفض الناقصُ باسمه.
        let prepaymentTax: LineTax | null = null;
        if (declared === 'PREPAYMENT') {
          if (!dto.prepaymentTax?.taxCategory) throw new BadRequestException(MSG.payment_prepayment_tax_required);
          prepaymentTax = resolveDeclaredLineTax(dto.prepaymentTax);
        }
        if (declared === 'ON_ACCOUNT') {
          // On account is invoiced debt allocated later, so the customer's net receivable must cover it, in base currency.
          // The customer row is locked first so two such receipts cannot both read the same coverage.
          await tx.$queryRaw`SELECT "id" FROM "customers" WHERE "id" = ${dto.customerId} FOR UPDATE`;
          const allocatedNowBase = allocations.reduce((s, a) => s + toBaseAmount(a.amount, invoices.get(a.invoiceId)?.exchangeRate ?? exchangeRate), 0);
          const openBase = round2((await this.onAccountCoverageBaseOf(tx, dto.customerId)) - allocatedNowBase);
          if (openBase + 0.005 < toBaseAmount(remainder, exchangeRate)) {
            throw new BadRequestException(formatMessage(MSG.payment_on_account_uncovered, { remainder: money(remainder), open: money(Math.max(0, round2(openBase / exchangeRate))) }));
          }
        }
        // ⚖️ (`ق-١٤٩٠`) مستندُ الدفعة المقدَّمة (386) رقمٌ ضريبيّ يُحجز بعد سند القبض — فمبلغُه وحساباتُ قيده و`2450` بنوعه
        // تُفحص هنا قبل ترقيم السند، فيُرفض برسالته قبل رقمَي `RCV` و`PP` معاً لا بعدهما.
        if (prepaymentTax) await assertPrepaymentIssuable(tx, companyId, { grossAmount: remainder, exchangeRate, taxRate: prepaymentTax.taxRate });

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
            clientRequestId: idempotencyKey ?? null,
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
          // الشبكةُ تدخل `1251` كما في بيع الكاشير (`recordPosReceipt`) — مسارٌ واحد للطريقة لا مساران.
          drawerAccountId: networkAccountId,
          baseReceivable: baseSettledOf(amount, exchangeRate, toSettlementAllocations(allocations), invoices),
          description: `مقبوض من عميل — سند ${no} — ${customer.name}`,
        });

        for (const a of allocations) await recomputeInvoiceStatus(tx, a.invoiceId);

        // ④A1: الفائضُ المعلَنُ دفعةً مقدَّمة يُصدر مستندَ 386 يومَ القبض — بعد ترحيل السند (فالذمّةُ تُقفل منه إلى الالتزام).
        const prepaymentInvoice =
          declared === 'PREPAYMENT'
            ? await this.invoices.issuePrepaymentWithinTx(tx, companyId, {
                customerId: customer.id,
                customerName: customer.name,
                paymentId: payment.id,
                paymentNo: no,
                branchId,
                date: new Date(dto.date),
                grossAmount: remainder,
                currency,
                exchangeRate,
                tax: prepaymentTax!,
              })
            : null;

        const saved = withAllocatedTotals(await tx.payment.findUniqueOrThrow({ where: { id: payment.id }, include: PAYMENT_INCLUDE }));
        return prepaymentInvoice
          ? { ...saved, prepaymentInvoice: { id: prepaymentInvoice.id, no: prepaymentInvoice.no, total: money(prepaymentInvoice.total), onAccountRemainder: money(prepaymentInvoice.onAccountRemainder) } }
          : saved;
      }),
    );
  }

  /**
   * The customer's net invoiced receivable in base currency, which is what an on-account amount may draw on: each invoice
   * and debit note at its own rate (total less credit notes less allocations, negative where a credit note exceeded what
   * was unpaid), less what the customer's receipts left unallocated at their receivable rate, reversals and refunds with
   * their sign. A prepayment document is not a receivable, so it does not enter.
   *
   * Company wide on purpose: the debt is the customer's to the company, not to a branch.
   */
  private async onAccountCoverageBaseOf(tx: Prisma.TransactionClient, customerId: string): Promise<number> {
    // Only a document that is unpaid or carries a credit note can hold a non zero balance.
    const documents = await tx.invoice.findMany({
      where: {
        customerId,
        docType: { in: [...RECEIVABLE_INVOICE_KINDS] },
        AND: [NOT_REPLACED_REJECTED, { OR: [{ status: { not: 'PAID' } }, { adjustments: { some: { docType: 'CREDIT_NOTE' } } }] }],
      },
      select: { id: true, total: true, exchangeRate: true, adjustments: CREDIT_NOTES_ON_DOCUMENT },
    });
    const allocated = await allocatedByDocument(invoiceTarget(tx), documents.map((d) => d.id));
    const documentsBase = documents.reduce(
      (s, d) => s + toBaseAmount(round2(Number(d.total) - creditedTotal(d.adjustments) - (allocated.get(d.id) ?? 0)), Number(d.exchangeRate)),
      0,
    );
    const receipts = await tx.payment.findMany({
      where: { customerId },
      select: {
        amount: true,
        exchangeRate: true,
        allocations: { select: { amount: true } },
        refundsInvoice: { select: { exchangeRate: true } },
        reverses: { select: { refundsInvoice: { select: { exchangeRate: true } } } },
      },
    });
    const unallocatedBase = receipts.reduce((s, p) => {
      const left = round2(Number(p.amount) - p.allocations.reduce((sum, a) => sum + Number(a.amount), 0));
      return Math.abs(left) > 0.005 ? s + toBaseAmount(left, unallocatedReceivableRate(p)) : s;
    }, 0);
    return round2(documentsBase - unallocatedBase);
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

    await recomputeInvoiceStatus(tx, input.invoiceId);
  }

  /**
   * 🔴 **السندُ بفروع الفاعل لا بمعرّفه وحدَه** (`ق-١٤٤٠`): كان التوزيعُ والعكسُ يقرآن `findUnique({ id })`
   * فموظّفٌ مقيَّدٌ بفرعٍ أعاد توزيعَ سندِ فرعٍ آخر أو عكسه. ⟸ خارجُ فروعه **غيرُ موجودٍ له** (`404` كالقائمة)،
   * ويُقرأ **قبل** أيّ فحصِ حالٍ يكشف وجودَه؛ وما هو للمنشأة كلِّها (`branchId: null`) مرئيٌّ للجميع (`branchFilter`).
   */
  private async findVisible(tx: Prisma.TransactionClient, allowedBranchIds: string[] | 'all', id: string) {
    const payment = await tx.payment.findFirst({
      where: { id, ...branchFilter(allowedBranchIds) },
      // سعرُ إشعار الردّ (`ق-١٤٨٩`): به يُعكس ما لم يُخصَّص من سند الردّ — نقدُه بسعر يومه وذمّتُه بسعر إشعاره.
      include: { allocations: true, customer: { select: { name: true } }, refundsInvoice: { select: { exchangeRate: true } } },
    });
    if (!payment) throw new NotFoundException(MSG.payment_not_found);
    return payment;
  }

  /** ④A1 — سندٌ أصدر فاتورةَ دفعةٍ مقدَّمة لا يُعاد توزيعُه ولا يُعكس: مستندُه صادرٌ بسلسلته، وتصحيحُه إشعارٌ دائن عليه (لم يُبنَ بعد — حدٌّ معلَن). */
  private async assertNoPrepaymentInvoice(tx: Prisma.TransactionClient, paymentId: string): Promise<void> {
    const doc = await tx.invoice.findUnique({ where: { prepaymentPaymentId: paymentId }, select: { no: true } });
    if (doc) throw new ConflictException(formatMessage(MSG.payment_has_prepayment_invoice, { no: doc.no }));
  }

  /**
   * ⚖️ **الذمّةُ المرحَّلة لسند قبضٍ بتخصيصاته الحالية** (`ق-١٤٨٩`/B1): كلُّ تخصيصٍ بسعر **فاتورته**، وما لم يُخصَّص
   * بسعر السند — الحسبةُ نفسُها التي رحّل بها السندُ ذمّتَه يومَ إنشائه (`baseSettledOf`)، وتبقى صادقةً بعد كلِّ إعادة
   * توزيع لأن التوزيعَ يُرحّل فرقَها. **فإعادةُ التوزيع والعكسُ يقرآنها من هنا** — مصدرٌ واحد، فلا يفترق ما يطرحه
   * التوزيعُ عمّا يعكسه العكس.
   *
   * **على مستوى المنشأة بحقّها**: أسعارُ فواتير تخصيصات السند تُقرأ بمعرّفاتها أيّاً كان فرعُها — فالسندُ سوّى ذمّتَها
   * كلَّها بأسعارها، وحجبُ فاتورةِ فرعٍ آخر يُسقط سعرَها إلى سعر السند فيختلّ فرقُ الصرف المرحَّل.
   */
  private async postedSettledBaseOf(
    tx: Prisma.TransactionClient,
    payment: {
      amount: Prisma.Decimal | number;
      exchangeRate: Prisma.Decimal | number;
      allocations: { invoiceId: string; amount: Prisma.Decimal | number }[];
      /** سندُ الردّ: ما لم يُخصَّص منه بسعر إشعاره لا بسعر نقده (B6 — `unallocatedReceivableRate`). */
      refundsInvoice?: { exchangeRate: Prisma.Decimal | number } | null;
    },
  ): Promise<number> {
    const allocations = payment.allocations.map((a) => ({ documentId: a.invoiceId, amount: round2(Number(a.amount)) }));
    const invoices = allocations.length
      ? await tx.invoice.findMany({ where: { id: { in: allocations.map((a) => a.documentId) } }, select: { id: true, exchangeRate: true } })
      : [];
    const rateByInvoice = new Map(invoices.map((i) => [i.id, { exchangeRate: Number(i.exchangeRate) }]));
    return baseSettledOf(round2(Number(payment.amount)), unallocatedReceivableRate(payment), allocations, rateByInvoice);
  }

  /**
   * إعادة توزيع دفعة قائمة: تحلّ المجموعة الجديدة محلّ تخصيصاتها كلها.
   *
   * ⚖️ **وفرقُ الذمّة بين التوزيعَين يُرحَّل** (`ق-١٤٨٩`/B1): الذمّةُ المرحَّلة للسند كلُّ تخصيصٍ بسعر فاتورته وغيرُ المخصَّص
   * بسعر السند — فتخصيصُ ما كان «على الحساب» بسعر السند على فاتورةٍ بسعرٍ آخر، أو نقلُه من فاتورةٍ إلى أخرى بسعرٍ مختلف،
   * يُبدّل الذمّةَ المسوّاة **بلا نقد**. كان التوزيعُ لا يُرحّل شيئاً، فيبقى الربحُ أو الخسارةُ المحقَّقة رصيداً يتيماً في `1200`
   * على العميل وفواتيرُه مسدَّدة — ثم يعكس العكسُ (من التخصيصات الحالية) فرقاً على `5600` لم يُرحَّل أصلُه، شبحاً.
   * **والآن**: قيدٌ بلا نقد بـ`بعد − قبل`، بيوم التوزيع، خاضعٌ لقفل الفترات — فيبقى مرحَّلُ السند مساوياً لذمّته من
   * تخصيصاته الحالية، ويصدق فرضُ العكس بلا تعديلٍ فيه.
   * ⚠️ **حدودٌ معلَنة**: سندٌ أُعيد توزيعُه قبل هذا البناء يبقى فرقُه كما رُحِّل (يُعدّ ولا يُصحَّح)؛ وسندٌ بلا قيدٍ أصلاً
   * (`journalEntryId` فارغ — ما سبق `ق-١٤٦٦`) لا يُرحَّل له فرقٌ على ذمّةٍ لم تُرحَّل؛ ومصدرُ القيد في الأستاذ «آليّ» لا
   * «سند قبض» — مذكّرتُه تسمّي السند، والربطُ بعمودٍ يحتاج هجرةً لم تُبنَ. **وسندُ الصرف للمورّد (B2) خارجُه** بانتظار
   * حكم المالك في الدفعة المقدَّمة لمورّد.
   *
   * **على مستوى المنشأة بحقّها**: عكسُ السند يُقرأ برابط الأصل (`reversesId`) لا بقائمة
   * رؤية — رابطُ مستندٍ بمستنده، وحجبُه بفرعٍ يُظهر السندَ المعكوس قابلاً للتوزيع من جديد.
   */
  allocate(companyId: string, allowedBranchIds: string[] | 'all', id: string, dto: AllocateDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // ⚖️ صفُّ السند يُقفل **قبل** قراءة تخصيصاته (توجيه ٢٧٦ · ٢و): طلبان معاً كانا يحذفان كلٌّ ما رآه ويكتبان، فيبقى التوزيعان
      //    ويزيد المخصَّصُ على مبلغ السند (مقيسٌ بتداخلٍ مفروض في `payment-reallocation-race.e2e-spec.ts`). والثاني الآن ينتظر ثم
      //    يقرأ توزيعَ الأوّل ويحلّ محلَّه.
      await lockDocumentRow(tx, 'payments', id);
      // الفرعُ أوّلاً (`ق-١٤٤٠`): سندُ فرعٍ آخر 404 لا 409 الدفعةِ المقدَّمة التي تسمّي مستندَه — فهو غيرُ موجودٍ له.
      const payment = await this.findVisible(tx, allowedBranchIds, id);
      // ④A1: سندٌ أصدر مستندَ دفعةٍ مقدَّمة يُرفض هنا مسمّىً بمستنده.
      await this.assertNoPrepaymentInvoice(tx, id);
      // ⚖️ سندٌ له عكسٌ لا يُعاد توزيعُه (`ق-١١٩٨`/⑤ — مراجعةٌ خارجية): كان الفحصُ على «هو عكسٌ»
      //    وحدَه، فسندٌ عُكس كان يُعاد توزيعُه على فاتورةٍ أخرى — وعكسُه يحمل مرآةَ التوزيع
      //    القديم، فتُختم فاتورةٌ مسدَّدةً بمالٍ رُدّ. الفحصُ نفسُه الذي يحرس العكسَ الثاني.
      assertReversible(payment, await tx.payment.findFirst({ where: { reversesId: id }, select: { no: true } }));

      const requested = dto.allocations.map((a) => ({ invoiceId: a.invoiceId, amount: round2(a.amount) }));
      await assertInvoicesVisible(tx, allowedBranchIds, requested);
      const touched = new Set<string>([...payment.allocations.map((a) => a.invoiceId), ...requested.map((a) => a.invoiceId)]);

      // ⚖️ (`ق-١٤٨٩`/B1) الذمّةُ المرحَّلة **قبل** طرح القديمة — فبعد الحذف لا يبقى إلا «غيرُ مخصَّصٍ بسعر السند»،
      //    وفرقٌ يُحسب منه يصدق حين كان السندُ كلُّه على الحساب ويكذب حين يُنقل من فاتورةٍ إلى أخرى.
      const settledBefore = await this.postedSettledBaseOf(tx, payment);

      // القديمة تُطرح أولاً — وإلا رفضنا إعادةَ توزيعٍ لا تتجاوز شيئاً حقيقةً.
      await tx.paymentAllocation.deleteMany({ where: { paymentId: id } });
      const rates = await lockAndAssertAllocationsFit(tx, invoiceTarget(tx), {
        amount: round2(Number(payment.amount)),
        currency: payment.currency,
        partyId: payment.customerId,
        allocations: toSettlementAllocations(requested),
      });

      if (requested.length) {
        await tx.paymentAllocation.createMany({ data: requested.map((a) => ({ companyId, paymentId: id, invoiceId: a.invoiceId, amount: a.amount })) });
      }

      // The receivable difference is a cashless entry (positive: credit 1200, debit 5600; negative: the reverse), dated on the
      // requested day or else the company's own day; a closed period refuses it and the old allocation stays.
      // وما لم يُخصَّص بعد التوزيع بسعر ذمّته من المصدر نفسِه الذي قُرئ به `settledBefore` (`unallocatedReceivableRate` — B6):
      // لسند القبض هو سعرُه، ولسند الردّ سعرُ إشعاره — فلا يصنع اختلافُ القارئَين فرقاً لا أصلَ له.
      const settledAfter = baseSettledOf(round2(Number(payment.amount)), unallocatedReceivableRate(payment), toSettlementAllocations(requested), rates);
      const difference = round2(settledAfter - settledBefore);
      if (difference !== 0 && payment.journalEntryId) {
        await postCustomerPaymentEntry(tx, companyId, {
          customerId: payment.customerId,
          paymentNo: payment.no,
          customerName: payment.customer.name,
          date: dto.date ? new Date(dto.date) : await companyToday(tx, companyId),
          baseCash: 0,
          baseReceivable: difference,
          branchId: payment.branchId,
          reallocation: true,
        });
      }

      for (const invoiceId of touched) await recomputeInvoiceStatus(tx, invoiceId);

      return withAllocatedTotals(await tx.payment.findUniqueOrThrow({ where: { id }, include: PAYMENT_INCLUDE }));
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
   *
   * **صندوقُه لا يُقاس هنا**: العكسُ مرآةُ سند القبض بصندوقه وفرعه كما هما، والأصلُ قيس صندوقُه عند إنشائه
   * (`ق-١٤٣٧`) — وقياسُه الآن يمنع تصحيحَ سندٍ نُقل حسابُه البنكيّ بعده للقادم.
   */
  reverse(companyId: string, allowedBranchIds: string[] | 'all', id: string, reason?: string, date?: string) {
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        // 🔴 صفُّ السند يُقفل **قبل** قراءة تخصيصاته (توجيه ٢٧٧ · ٢د · القاعدة ٣٧): إعادةُ التوزيع تقفله (#722) والعكسُ كان يقرأ بلا
        //    قفل، فيعكس فاتورةً نقلت إعادةُ توزيعٍ السندَ عنها في اللحظة نفسِها، ويبقى على الأخرى مالٌ من سندٍ معكوس (مقيسٌ بتداخلٍ
        //    مفروض في `payment-reallocation-race.e2e-spec.ts`). والقفلُ نفسُه يجعل عكسَين معاً عكساً واحداً وثانيهما `409`.
        await lockDocumentRow(tx, 'payments', id);
        // الفرعُ أوّلاً (`ق-١٤٤٠`): سندُ فرعٍ آخر 404 لا 409 الدفعةِ المقدَّمة أو العكسِ السابق — فهو غيرُ موجودٍ له.
        const original = await this.findVisible(tx, allowedBranchIds, id);
        // ④A1: سندٌ أصدر مستندَ دفعةٍ مقدَّمة يُرفض هنا مسمّىً بمستنده.
        await this.assertNoPrepaymentInvoice(tx, id);
        assertReversible(original, await tx.payment.findFirst({ where: { reversesId: id }, select: { no: true } }));

        const amount = round2(-Number(original.amount));
        const rate = Number(original.exchangeRate);
        // The requested day, else the company's own day: one value for the number and the row.
        const reversalDate = date ? new Date(date) : await companyToday(tx, companyId);
        const no = await this.nextPaymentNumber(tx, companyId, reversalDate);
        const bank = original.bankId ? await tx.bank.findUnique({ where: { id: original.bankId } }) : null;
        // The reversal credits the account the receipt debited: a POS cash sale's drawer, 1251 for a card, else 1000.
        const cashAccountId = bank ? null : await this.postedCashAccountOf(tx, companyId, original.journalEntryId, original.method);

        // الذمّة المعكوسة بأسعار فواتيرها هي نفسها التي سُوّيت — فيتطابق
        // القيدان طرفاً بطرف ويعود 5600 إلى ما كان: الحسبةُ نفسُها التي سوّت الأصل، مقلوبةَ الإشارة.
        // ⚖️ (`ق-١٤٨٩`/B1) ومن المصدر الذي تطرح منه إعادةُ التوزيع ذمّتَها القديمة — فما رحّله التوزيعُ فرقاً يعود هنا بعينه.
        //    **وما لم يُخصَّص يُعكس بسعر ذمّته لا بسعر نقده** (B6): لسند القبض السعران واحد؛ وسندُ الردّ نقدُه بسعر يومه
        //    (`rate` — المنسوخ على صفّ العكس) وذمّتُه بسعر إشعاره — والمصدرُ الواحد يقرأه (`unallocatedReceivableRate`).
        const baseReceivable = round2(-(await this.postedSettledBaseOf(tx, original)));

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
          drawerAccountId: cashAccountId,
          baseReceivable,
          description: `عكس مقبوض — سند ${no} (يعكس ${original.no})`,
          reversal: true,
        });

        for (const a of original.allocations) await recomputeInvoiceStatus(tx, a.invoiceId);

        return withAllocatedTotals(await tx.payment.findUniqueOrThrow({ where: { id: reversal.id }, include: PAYMENT_INCLUDE }));
      }),
    );
  }

  /**
   * The cash side of a receipt's posted entry, the line that is neither the receivable nor the exchange difference.
   * Without a posted entry, a card receipt falls back to 1251 and a cash one to 1000.
   *
   * Company wide by design: it reads the lines of one posted entry by that entry's id, a document link and not a list.
   */
  private async postedCashAccountOf(tx: Prisma.TransactionClient, companyId: string, entryId: string | null, method: string): Promise<string | null> {
    if (entryId) {
      const lines = await tx.journalLine.findMany({ where: { journalEntryId: entryId }, select: { accountId: true, account: { select: { code: true } } } });
      const cash = lines.filter((l) => l.account.code !== '1200' && l.account.code !== FX_DIFFERENCE_ACCOUNT);
      if (cash.length === 1) return cash[0].accountId;
    }
    return method === 'CARD' ? (await getOrCreateAccountByCode(tx, companyId, NETWORK_RECEIVABLE_CODE, NETWORK_RECEIVABLE_NAME, 'asset')).id : null;
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
   * **وبعملةٍ أجنبية** (`ق-١٤٨٩` — B6): النقدُ يخرج بسعر يوم الردّ (مطلوبٌ في الطلب، ولا يُفترض)، والذمّةُ تعود
   * إلى `1200` بسعر الإشعار، والفرقُ بينهما على `5600` — لا يُطوى في قيمة حساب النقد/البنك.
   *
   * **على مستوى المنشأة بحقّها**: المناوبةُ تُقرأ بمعرّفها المحفوظ على فاتورة
   * البيع لتحديد الدرج الذي يخرج منه الردّ — مفتاحٌ محفوظٌ لا قائمة، ولو حُجبت
   * لخرج الردُّ من الصندوق العامّ فاتُّهم الكاشير بفرق.
   */
  refund(companyId: string, allowedBranchIds: string[] | 'all', dto: RefundDto, request?: KeyedRequest) {
    const replayed = async (tx: Prisma.TransactionClient, id: string) => {
      const row = await tx.payment.findUnique({ where: { id }, include: PAYMENT_INCLUDE });
      return row ? withAllocatedTotals(row) : null;
    };
    return onceForRequest(this.tenantPrisma, companyId, request, replayed, () =>
    retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, (tx) => recordKeyedRequest(tx, companyId, request, async () => {
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
        // الردُّ مستندٌ في فرع الإشعار — لا يخرج من صندوق فرعٍ آخر (`ق-١٤٣٧`).
        await assertBoxInBranch(tx, note.branchId, bank);

        // ردّان متزامنان على أصلٍ واحد كانا يقرآن «القابلَ للردّ» نفسَه فيمرّان معاً (البند 18): القفلُ على
        // الفاتورة الأصلية قبل الحساب، فالثاني ينتظر ثم يقرأ بعد الأوّل (`ق-١٥٧٥`).
        await lockDocumentRow(tx, 'invoices', note.relatedInvoice.id);
        const refundable = await this.refundableOf(tx, note.relatedInvoice);
        if (refundable <= EPS) throw new BadRequestException(MSG.refund_nothing_refundable);
        const amount = round2(dto.amount ?? refundable);
        if (amount <= 0 || amount > refundable + EPS) {
          throw new BadRequestException(formatMessage(MSG.refund_exceeds_refundable, { refundable: formatMoney(refundable), amount: formatMoney(amount) }));
        }

        // ⚖️ **النقدُ بسعر يوم الردّ، والذمّةُ بسعر الإشعار، والفرقُ على `5600`** (`ق-١٤٨٩` — المسار B6).
        //    كان `currency` و`exchangeRate` يُقبلان من الطلب (`RefundDto extends CurrencyFieldsDto`) **ويُهملان**: النقدُ
        //    والذمّةُ كلاهما بسعر الإشعار التاريخيّ، ففرقُ الصرف يُطوى في قيمة حساب النقد/البنك بلا سطرٍ يسمّيه.
        //    ① عملةُ الردّ عملةُ إشعاره — عملةٌ أخرى مبلغٌ بمقياسٍ آخر، فتُرفض مسمّاةً لا تُحوَّل صامتةً.
        //    ② وإشعارٌ بعملةٍ غير عملة الأساس **يُلزِم بسعر يوم الردّ** — لا يُفترض سعرُ الإشعار ولا التعادل.
        //    ③ وإشعارٌ بعملة الأساس سعرُه سعرُه — فسعرٌ مرسَلٌ يخالفه سعرٌ بين العملة ونفسها، ولو قُبل لصنع على
        //       `5600` فرقاً لا وجود له.
        const requestedCurrency = dto.currency?.trim();
        if (requestedCurrency && requestedCurrency !== note.currency) {
          throw new BadRequestException(formatMessage(MSG.refund_currency_mismatch, { currency: requestedCurrency, no: note.no, noteCurrency: note.currency }));
        }
        const noteRate = Number(note.exchangeRate);
        const requestedRate = dto.exchangeRate ?? null;
        let cashRate = noteRate;
        if (note.currency !== (await companyBaseCurrency(tx, companyId))) {
          if (requestedRate === null) throw new BadRequestException(formatMessage(MSG.refund_rate_required, { no: note.no, currency: note.currency }));
          cashRate = requestedRate;
        } else if (requestedRate !== null && requestedRate !== noteRate) {
          throw new BadRequestException(MSG.exchange_rate_same_currency);
        }
        // الذمّةُ تعود إلى `1200` بسعر إشعارها — من المصدر الواحد الذي تقرؤه مطابقةُ الأعمار ومُرحِّلُ العكس.
        const receivableRate = unallocatedReceivableRate({ exchangeRate: cashRate, refundsInvoice: note });

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
            // سعرُ يوم الردّ لا سعرُ الإشعار: المبلغُ يحمل سعرَه وقتَ العملية (`§6.7`)، والذمّةُ تُقرأ بسعر إشعاره
            // من رابطه (`refundsInvoiceId` ⟵ `unallocatedReceivableRate`) — فلا تنكسر مطابقةُ الأعمار مع `1200`.
            exchangeRate: cashRate,
            baseAmount: round2(-toBaseAmount(amount, cashRate)),
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
          // النقدُ ومرآةُ البنك بسعر يوم الردّ، والذمّةُ بسعر الإشعار — فيُخرج القيدُ الفرقَ على `5600` وحدَه.
          exchangeRate: cashRate,
          branchId: note.branchId,
          bank,
          drawerAccountId: openShift?.drawer?.accountId ?? null,
          baseReceivable: round2(-toBaseAmount(amount, receivableRate)),
          description: `ردّ مرتجع — سند ${no} — إشعار دائن ${note.no} — ${note.customer.name}`,
          refund: true,
        });

        return withAllocatedTotals(await tx.payment.findUniqueOrThrow({ where: { id: payment.id }, include: PAYMENT_INCLUDE }));
      })),
    ));
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
      branchId: p.branchId,
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
