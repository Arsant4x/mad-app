import { BadRequestException, ConflictException, ForbiddenException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from '../delegations/permissions.service';
import { checkCreditLimit } from './credit-limit.util';
import { CREDIT_CODE, CREDIT_OVERRIDE_ACTION, CREDIT_OVERRIDE_SCREEN, type CreditContext } from './credit-context';
import { grant } from '../delegations/permission-tree';
import { TenantContext } from '../auth/types';
import { assertBranchAllowed, branchFilter, resolveBranchId } from '../branches/branch-scope.util';
import { buildZatcaQr, ZatcaQrValueTooLongError } from '../zatca/qr.util';
import { dayStartOf, issuedWallClock } from '../common/wall-clock.util';
import { Prisma } from '@mad-app/db';
import {
  assertAdjustableTarget,
  assertReturnLinesBelong,
  assertWithinRemaining,
  linesFromOriginal,
  outstandingAfterNotes,
  type NoteKinds,
} from '../common/adjustment/adjustment-note.util';
import { toBaseAmount, resolveCurrencyWithin } from '../common/currency/base-amount.util';
import { round2 } from '../common/money/rounding';
import { money } from '../common/money/text';
import { computeDocumentTotals, lineDiscount, lineGross, type MoneyLine } from '../common/money/totals';
import { lineTaxFromStored, resolveLineTax, productTaxFor, type LineTax, type ProductTaxProfile } from '../common/vat/line-tax.util';
import { assertSaleNotBlockedByExpiry, fulfilStockedLines, fulfilmentReport, restoredReport, returnStockedLines, ReturnExceedsSoldError, type ReturnResult } from './sale-fulfilment.util';
import { retryOnUniqueConflict } from '../common/retry-on-conflict.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { postPrepaymentApplicationEntry, postPrepaymentInvoiceEntry } from '../journal/auto-posting.util';
import { getOrCreateCustomerPrepaymentsAccount } from '../journal/prepayment-account.util';
import {
  assertAdjustmentNoteIssuable,
  assertSaleIssuable,
  prepaymentDocumentAmounts,
  returnExceedsSoldRefusal,
  type ApplicablePrepayment,
} from './issue-prechecks.util';
import {
  postCogsEntry,
  postCogsReversalEntry,
  postCreditNoteEntry,
  postDebitNoteEntry,
  postInvoiceEntry,
  postReversalEntry,
  unpostIfLinked,
} from '../journal/auto-posting.util';
import { CreateCreditNoteDto } from './dto/create-credit-note.dto';
import { IssueReplacementDto } from './dto/issue-replacement.dto';
import { isReplacedRejected } from './active-documents.util';
import { invoiceTypeFor } from '../zatca/hash-chain.util';
import { readClearedDelivery, withClearedCopyState } from '../zatca/cleared-invoice.util';
import { assertBuyerKindDeclared } from '../customers/buyer-kind.util';
import { localDateOf } from '../common/wall-clock.util';
import { deriveSettlementStatus, lockDocumentRow } from '../common/settlement/settlement.util';
import { documentYear } from '../common/document-year.util';
import { highestSequenceOf, nextDocumentNumber } from '../common/document-sequence.util';
import { CreateDebitNoteDto } from './dto/create-debit-note.dto';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoiceLineDto } from './dto/invoice-line.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { formatMessage, MSG, type MessageKey } from '../common/i18n/messages';
import { withoutCompanyFigures } from '../common/tenant/company-figures.util';
import { unitCodeOf, unitCodesFor } from '../common/units/product-unit-codes.util';
import { NotificationsService } from '../notifications/notifications.service';
import { deadlineView } from './note-deadline.util';
import { events } from '../shared/events/event-bus';
import { INVOICE_ISSUED, type InvoiceIssuedPayload } from '../shared/events/domain-events';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { listOrPage, mapList, searchTerm } from '../common/pagination/paged.util';
import { LINE_ORDER, numberLines } from '../common/document-lines.util';

/** أنواعُ مستند البيع — الأساسُ وإشعاراه؛ نظيرُها في الشراء `PURCHASE_NOTE_KINDS` (المصدرُ الواحد `ق-١٠٠٨`/١). */
const INVOICE_NOTE_KINDS: NoteKinds<'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE'> = { base: 'INVOICE', credit: 'CREDIT_NOTE', debit: 'DEBIT_NOTE' };

/** `relatedInvoice` so a credit note can show which invoice it adjusts
 * without a second round-trip — number only, never the whole document.
 * و`replacesInvoice`/`replacedBy` كذلك: البدلُ يسمّي مردودتَه والمردودةُ بدلَها (`ق-٩٦٣`)،
 * ومنهما تُشتقّ «مغلقة» (`ق-٩٦٤`). */
const INVOICE_INCLUDE = {
  customer: true,
  // بترتيبها المعلَن لا بترتيب القرص (`ق-١٤١٢`).
  lines: LINE_ORDER,
  relatedInvoice: { select: { id: true, no: true } },
  replacesInvoice: { select: { id: true, no: true } },
  replacedBy: { select: { id: true, no: true } },
} as const;


/**
 * Always derive totals from the lines server-side — a client-submitted total is
 * never trusted (a client could otherwise bill an arbitrary amount).
 *
 * **كنسة التدوير (قرار المالك 2026-09-03):** المجاميع تُحسب في `common/money/totals.ts`
 * بالطريقة نفسها التي يبني بها `zatca/ubl/invoice-xml.util.ts` المستندَ المختوم —
 * صافي كل بندٍ مدوَّراً، ثم الوعاء لكل نسبة، ثم ضريبة النسبة مدوَّرةً مرةً واحدة.
 * كانت هذه الدالة تجمع البنود غير مدوَّرة ثم تدوّر المجموع، فاختلفت عن المستند
 * بهللةٍ على بنودٍ ثلاثيةٍ مثل `0.335` — **بنفس سياسة التدوير**. الآن الدفتر
 * والمستند دالةٌ واحدة، و`subtotal + taxTotal === total` بالضبط.
 */
export function computeTotals(lines: readonly MoneyLine[]) {
  const { subtotal, taxTotal, total } = computeDocumentTotals(lines);
  return { subtotal, taxTotal, total };
}

/** ⑧ سطرٌ حُلّت ضريبتُه: الـDTO كما وصل + الفئةُ والسببُ والنسبةُ المشتقّة — وهو ما يُحسب منه ويُكتب. */
export type PricedInvoiceLine = Omit<InvoiceLineDto, 'taxRate' | 'taxCategory' | 'taxExemptionReasonCode' | 'taxExemptionReason'> & LineTax;

/**
 * ⑧ حلُّ ضريبة السطور (`ق-١٢١١` · `ق-١٢١٢`): سطرٌ بصنفٍ يرث بطاقتَه، وسطرٌ بلا صنفٍ يُعلن فئتَه؛
 * و`trusted` للنسخ من سطورٍ مخزَّنة (بدلٌ · إشعارٌ · تحويلُ عرض) — يُوثَق ما كُتب لا ما على البطاقة اليوم،
 * و`LEGACY_ZERO` يُردّ باسمه. وسطرُ مرتجعٍ (`returnsLineId`) يُنسخ من أصله دائماً: الإشعارُ يعكس ما فُوتر.
 */
export async function priceLines(
  tx: Prisma.TransactionClient,
  lines: readonly InvoiceLineDto[],
  opts: { trusted?: boolean; originals?: ReadonlyMap<string, ProductTaxProfile> } = {},
): Promise<PricedInvoiceLine[]> {
  const profiles = opts.trusted ? new Map<string, ProductTaxProfile>() : await productTaxFor(tx, lines.filter((l) => !(l.returnsLineId && opts.originals?.has(l.returnsLineId))));
  // ④B1: خصمُ السطر لا يفوق إجماليَّه (الكمية × السعر) — يُرفض مسمّىً بسطره، لا صافٍ سالب يمرّ إلى الدفتر والمستند.
  lines.forEach((l, i) => {
    const m: MoneyLine = { quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount ?? 0, taxRate: 0 };
    if (lineDiscount(m) > lineGross(m)) throw new BadRequestException(formatMessage(MSG.invoice_line_discount_exceeds, { line: i + 1, gross: money(lineGross(m)), discount: money(lineDiscount(m)) }));
  });
  return lines.map((l) => {
    const original = l.returnsLineId ? opts.originals?.get(l.returnsLineId) : undefined;
    const tax = original
      ? lineTaxFromStored(original)
      : opts.trusted
        ? lineTaxFromStored({ taxCategory: l.taxCategory as ProductTaxProfile['taxCategory'], taxExemptionReasonCode: l.taxExemptionReasonCode ?? null, taxExemptionReason: l.taxExemptionReason ?? null })
        : resolveLineTax(l, profiles);
    return { ...l, ...tax };
  });
}

/** أعمدةُ الضريبة كما تُكتب على سطر المستند. */
function taxColumns(l: LineTax) {
  return { taxRate: l.taxRate, taxCategory: l.taxCategory, taxExemptionReasonCode: l.taxExemptionReasonCode, taxExemptionReason: l.taxExemptionReason };
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
    private readonly permissions: PermissionsService,
  ) {}

  /**
   * What each document still leaves the customer owing.
   *
   * Derived here rather than on each screen because a credit note settles its
   * invoice **in the ledger** (it credits 1200) while deliberately leaving the
   * invoice row alone — so a status-only reading of receivables would keep
   * chasing a debt the books already show as cancelled, and every screen would
   * have to remember that independently.
   *
   * - an invoice owes its total, less whatever has been credited against it;
   * - a credit note owes nothing (it is the reduction, already applied above);
   * - a debit note owes its own total — it IS additional billing.
   *
   * Floored at zero: a fully-credited invoice that was also marked paid must
   * not read as the customer being owed money.
   */
  private outstandingOf(
    inv: { docType: string; status: string; total: Prisma.Decimal; id: string; zatcaStatus: string; replacedBy: { id: string } | null },
    creditedByInvoiceId: Map<string, number>,
    allocatedByInvoiceId: Map<string, number>,
  ): number {
    // المردودةُ التي صدر بدلُها لا ذمّةَ عليها — ذمّتُها انتقلت إلى البدل (`ق-٩٦٧/١`).
    if (isReplacedRejected(inv)) return 0;
    if (inv.status === 'PAID') return 0;
    // الدائنُ يخفّض فاتورتَه — أو الإشعارَ المدينَ الذي يصحّحه (`ق-٩٥٢`)؛ والمقبوض يُطرح كما يُطرح
    // الإشعار الدائن — وإغفاله كان يجعل الفاتورة المسدَّدة جزئياً تُحتسب بكامل قيمتها (قاعدة 4.5).
    // المصدرُ الواحد ⑥ مع متبقّي الشراء (`ق-١٠٠٨`/١).
    const credited = creditedByInvoiceId.get(inv.id) ?? 0;
    const allocated = allocatedByInvoiceId.get(inv.id) ?? 0;
    return outstandingAfterNotes(inv, credited, allocated, 'CREDIT_NOTE');
  }

  list(companyId: string, allowedBranchIds: string[] | 'all', query?: PagedQueryDto) {
    const term = searchTerm(query);
    const where: Prisma.InvoiceWhereInput = {
      // مرشِّحُ الفرع وشرطُ البحث كلاهما `OR`، فيُجمعان تحت `AND`: نشرُهما في الكائن نفسِه كان يجعل الثانيَ يحلّ محلّ
      // الأوّل، فيعود البحثُ بفواتير الفروع كلِّها لموظّفٍ مقيَّد (توجيه ٢٧٤ · مراجعة 3.3 ج-2 · حارسُه `where-or-collision.spec`).
      AND: [
        branchFilter(allowedBranchIds),
        // حقولُ البحث المُعلَنة (`ق-١٢٣٦`): رقمُ المستند والملاحظاتُ واسمُ العميل — والأخيرُ علاقةٌ فيُكتب هنا.
        term
          ? {
              OR: [
                { no: { contains: term, mode: 'insensitive' } },
                { notes: { contains: term, mode: 'insensitive' } },
                { customer: { name: { contains: term, mode: 'insensitive' } } },
              ],
            }
          : {},
      ],
    };
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // بلا `page` القائمةُ كلُّها كما كانت؛ وبه النافذةُ — والإثراءُ أدناه على الصفوف المُعادة وحدَها.
      // (`listOrPage` لا `pagedFindMany`: الصفُّ هنا يُقرأ بضمائمه — `replacedBy` في `outstandingOf` — فيُستنتج نوعُه من النداء نفسِه.)
      // الترتيبُ التامّ (`ق-٣٥٦`): تاريخُ الإصدار ثم `id` — فلا يتبدّل متعادلان بين صفحتين.
      const args = { where, include: INVOICE_INCLUDE, orderBy: [{ issueDate: 'desc' as const }, { id: 'desc' as const }] };
      const result = await listOrPage(query, {
        all: () => tx.invoice.findMany(args),
        count: () => tx.invoice.count({ where }),
        window: (offset, limit) => tx.invoice.findMany({ ...args, skip: offset, take: limit }),
      });

      // Credited amount per original invoice, in one pass — a per-row query
      // would be a request per invoice on a screen that lists all of them.
      const creditTotals = await tx.invoice.groupBy({
        by: ['relatedInvoiceId'],
        where: { docType: 'CREDIT_NOTE', relatedInvoiceId: { not: null } },
        _sum: { total: true },
      });
      const creditedByInvoiceId = new Map(creditTotals.map((row) => [row.relatedInvoiceId!, Number(row._sum.total ?? 0)]));

      // المقبوض لكل فاتورة في استعلام واحد — كما تفعل خريطة الإشعارات أعلاه،
      // فاستعلامٌ لكل صف على شاشة تسردها جميعاً طلبٌ لكل فاتورة.
      const allocationTotals = await tx.paymentAllocation.groupBy({ by: ['invoiceId'], _sum: { amount: true } });
      const allocatedByInvoiceId = new Map(allocationTotals.map((row) => [row.invoiceId, Number(row._sum.amount ?? 0)]));

      // The ZATCA QR is derived, not stored: it must reflect the company's
      // *current* legal name and VAT number, so an invoice issued before the
      // company profile was completed starts showing a valid QR the moment
      // those fields are filled in — rather than being permanently stamped
      // with the blanks it was created with.
      //
      // Company is the tenant identity row (no RLS, not in the tenant-scope
      // extension), so it's read straight by id from the verified context.
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { legalName: true, vatNumber: true },
      });

      // ⚖️ (`ق-١٥٠٦`) الصفُّ بلا النسخة المجازة (نصٌّ كاملٌ لكلّ صفّ — تُنزَّل من طريقها `GET :id/cleared-xml`) وبحالِها
      //    مكانها (`clearedCopy`) — من واجهة الوحدة لا من هنا.
      return mapList(result, (row) => {
        const inv = withClearedCopyState(row);
        // ⚖️ ذمّةُ العميل المحفوظةُ على فاتورة التجاوز رقمُ المنشأة كلِّها، فتسقط لمن لا يرى الفروعَ كلَّها (`ق-١٥٨١`)؛ والحدُّ يبقى.
        return withoutCompanyFigures(allowedBranchIds, {
          ...inv,
          /** نوعُ المستند لدى الهيئة (كاملة/مبسّطة) من صفة المشتري ورقمِه (②A1) — تقرؤه الشاشةُ ولا تحسبه. */
          invoiceType: invoiceTypeFor(inv.customer, inv.lines),
          /** What this document still leaves owing — see outstandingOf. ② مالٌ نصّاً بخانتين على الحدّ (`ق-١٢٣٥`). */
          outstanding: money(this.outstandingOf(inv, creditedByInvoiceId, allocatedByInvoiceId)),
          /** How much of this invoice has been credited back, so a screen can
           * show the invoice as partly reversed without a second request. */
          creditedTotal: money(inv.docType === 'CREDIT_NOTE' ? 0 : (creditedByInvoiceId.get(inv.id) ?? 0)),
          // مستندٌ مختوم يعرض رمزَه التساعي المحفوظ؛ وغيرُه الوسومَ الخمسة المشتقّة (`ق-١٨٧`).
          zatcaQr: inv.zatcaQrPayload ?? buildZatcaQr({
            sellerName: company?.legalName ?? '',
            vatNumber: company?.vatNumber ?? '',
            issued: issuedWallClock(inv),
            // ZATCA wants the figures as billed, in the invoice's own currency.
            total: Number(inv.total),
            vatAmount: Number(inv.taxTotal),
          }),
        }, ['creditOverrideExposure'] as const);
      });
    });
  }

  /**
   * ⚖️ **تسليمُ الفاتورة القياسية: نسختُها المجازة من الهيئة، ملفَّ XML باسمه النظاميّ** (`ق-١٥٠٦`/١ و٤).
   *
   * **بعد الإجازة لا قبلها**: الفاتورةُ القياسية لا تُعدّ صحيحةً قبل ختم الهيئة (الدليلُ الفنيّ التفصيليّ،
   * الإصدار 2، ص50)، فالمسلَّمُ ما أعادته الهيئةُ في `clearedInvoice` — **ولا يُستبدل به `zatcaSignedXml`**
   * (نسختُنا قبل الإجازة) في أيّ حال. وما لا نسخةَ له يُرفض بسببه المسمّى: مبسّطةٌ (خارج البند) · لم تُجَز
   * بعد · أُجيزت قبل حفظ النسخة (`ق-١٥٠٦` — لا تُملأ رجعياً). والفرعُ يُحترم كقراءة القائمة.
   */
  clearedXml(companyId: string, allowedBranchIds: string[] | 'all', id: string): Promise<{ fileName: string; xml: string }> {
    // ما هو من الهيئة يسكن وحدتَها (`ق-١٣٥٠`): الفاتورةُ تسأل بحدّ فرعها، والوحدةُ تقرأ وتسمّي وترفض.
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => readClearedDelivery(tx, id, allowedBranchIds));
  }

  /**
   * ⭐ **يبني سياقَ الائتمان لمسارٍ يفتح ذمّة** — **مصدرٌ واحدٌ للتصريح**.
   *
   * ⚠️ **وصلاحيةُ التجاوز تُقرأ من `PermissionsService.forActor` وحدها** —
   * **وهي عينُ ما تقرؤه الواجهة**، فلا يرى المستخدمُ زرّاً يرفضه الخادم ولا
   * العكس. **ولا حسابَ صلاحياتٍ محلّيّ ثانٍ يفترق عنه عند أول تعديل.**
   *
   * ⚠️ **ولا تُقرأ إلا حين يُصرَّح بالتجاوز**: قراءةُ الصلاحيات ليست مجّانية،
   * **والتصريحُ نادر** — فلا تُدفع كلفتُها على كل فاتورة. **وهي خارج المعاملة
   * عمداً**: `forActor` تفتح معاملتَها، **وقراءتُها داخل معاملة الفاتورة
   * معاملةٌ داخل معاملة** — وهو العطل الذي أوقف الكاشير (`ق-٣٥٩`).
   */
  async creditContextFor(
    tenant: TenantContext,
    actorName: string,
    dto: { creditOverride?: boolean },
    settlement: CreditContext['settlement'],
  ): Promise<CreditContext> {
    const overrideRequested = Boolean(dto.creditOverride);
    // ⚠️ **المفتاحُ يُبنى بـ`grant()` لا يُكتب نصّاً**: صيغةُ `شاشة:فعل` مصدرُها
    //    واحد، **ونصٌّ مكتوبٌ بيدٍ يفترق عنها بصمتٍ فيصير الفحصُ دائمَ الكذب**.
    const canOverride = overrideRequested
      ? (await this.permissions.forActor(tenant)).grants.includes(grant(CREDIT_OVERRIDE_SCREEN, 'review'))
      : false;
    return {
      settlement,
      actor: { id: tenant.profileId, actorType: tenant.actorType, name: actorName },
      overrideRequested,
      canOverride,
    };
  }

  async create(companyId: string, allowedBranchIds: string[] | 'all', dto: CreateInvoiceDto, credit: CreditContext) {
    // Retries the whole transaction (fresh count() each time) on a "no"
    // collision from a concurrent create — see nextInvoiceNumber's comment.
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, (tx) => this.createWithinTx(tx, companyId, allowedBranchIds, dto, credit)),
    );
  }

  /**
   * ⚖️ **بدلٌ عن مردودة — المردودةُ تُغلق ولا تُمسّ ويُصدَر مستندٌ جديد** (`ق-٩٥٨` · `ق-٩٦٣` … `ق-٩٦٧`).
   *
   * الهيئة: تجزئةُ المردود وعدّادُه لا يُغيَّران ولا يُعاد استعمالُهما، والتصحيحُ مستندٌ جديد
   * بعدّادٍ وتجزئةٍ جديدَين، **ولا رابطَ أمامها** — فلا `BillingReference` (الرابطُ عمودٌ مخصَّص
   * `replacesInvoiceId` لا `relatedInvoiceId`). **معاملةٌ واحدة** — إمّا يقع كلُّه أو لا شيء:
   *
   *   ① **المخزون — إعادةٌ إلى الرفّ ثم خصمٌ جديد** (`ق-٩٦٥`): حركةُ `IN` على سطور المردودة
   *      بتكلفتها المستعادة (وقيدُ عكس تكلفتها)، **قبل** البدل كي يجد ما يخصمه؛ ثم البدلُ يخصم
   *      كأيّ بيعٍ جديد. **ولا توريثَ للحركات**.
   *   ② **القيد — عكسٌ لا حذف**: قيدُ المردودة يبقى كما رُحِّل ويُعكَس بقيدٍ مستقلٍّ يُربط بها
   *      (`reversalJournalEntryId`)، **بتاريخ البدل** لا بتاريخ اليوم (قرارُ المالك `ق-٩٧٢` — من يقلبه
   *      بسطرٍ يجد سببَه هناك) — فيستوي الدفترُ في الفترة نفسها (البيعُ مرّةً)، وفترةٌ مقفلة ترفض
   *      العكسَ والبدلَ معاً لا أحدَهما.
   *   ③ **البدل — بالمسار القائم بعينه** (`createWithinTx`): رقمٌ جديد من التسلسل **بلا لاحقة**،
   *      والبنودُ والعميلُ والفرعُ والعملةُ والملاحظاتُ من المردودة. **والتاريخُ بالنوع**: القياسيةُ
   *      يومُ الإصدار الجديد (فالمردودة «ليست فاتورةً ضريبيةً صحيحة» والإجازةُ عليها ولحظةُ
   *      الجهاز تُرسَل كما في الإنشاء)، والمبسَّطةُ يومُ المعاملة الأصليّ ولحظتُها (ولا تُعاد
   *      للعميل). وحدثُ إصداره في الطابور يُبلغ الهيئةَ كأيّ جديد. ولا يُفحص الحدُّ (`REPLACEMENT`):
   *      الذمّةُ تنتقل لا تزيد.
   *   ④ **المقبوض — تخصيصاتُ المردودة تُنقل إلى البدل** (`ق-٩٦٦`): لا سندَ يُلغى ولا يُعاد
   *      قبضُه، وحالةُ السداد تُشتقّ للاثنين، **وأثرٌ في السجلّ باسم الفاعل** (`replace`): من
   *      نقل ومتى ومن أيّ مستندٍ إلى أيّ.
   *
   * و«مغلقة» مشتقّةٌ من `replacedBy` (`ق-٩٦٤`) — والبدلُ الثاني يُرفض بالفحص وبالقيد الفريد معاً؛
   * وما يقرأ المستنداتِ (الإقرار · التعرّض · المتبقّي) يُخرج المردودةَ المغلقة من مصدرٍ واحد
   * (`active-documents.util`) ويُبقي المردودةَ التي لا بدلَ لها.
   */
  async issueReplacement(tenant: TenantContext, actorName: string, invoiceId: string, dto: IssueReplacementDto) {
    const companyId = tenant.companyId;
    const credit: CreditContext = {
      settlement: 'REPLACEMENT',
      actor: { id: tenant.profileId, actorType: tenant.actorType, name: actorName },
      overrideRequested: false,
      canOverride: false,
    };
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const rejected = await tx.invoice.findUnique({
          where: { id: invoiceId },
          include: { customer: { select: { kind: true, vatNumber: true, country: true } }, lines: LINE_ORDER, replacedBy: { select: { no: true } } },
        });
        if (!rejected) throw new NotFoundException(MSG.invoice_not_found);
        assertBranchAllowed(tenant.allowedBranchIds, rejected.branchId);
        if (rejected.docType !== 'INVOICE' || rejected.zatcaStatus !== 'REJECTED') {
          throw new BadRequestException(MSG.invoice_replacement_only_rejected);
        }
        if (rejected.replacedBy) throw new ConflictException(formatMessage(MSG.invoice_already_replaced, { no: rejected.replacedBy.no }));

        // ③ التاريخُ بالنوع — يُحسم أولاً لأن الإعادةَ والعكسَ يؤرَّخان به.
        const standard = invoiceTypeFor(rejected.customer, rejected.lines) === 'standard';
        const now = new Date();
        const clock = standard
          ? { issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : null, issuedOffsetMin: dto.issuedAt ? (dto.issuedOffsetMin ?? null) : null }
          : { issuedAt: rejected.issuedAt, issuedOffsetMin: rejected.issuedOffsetMin };
        const issueDate = standard
          ? clock.issuedAt && clock.issuedOffsetMin !== null
            ? new Date(localDateOf(clock.issuedAt, clock.issuedOffsetMin))
            : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
          : rejected.issueDate;
        const dueDate = rejected.dueDate > issueDate ? rejected.dueDate : issueDate;
        const rate = Number(rejected.exchangeRate);

        // ① الإعادةُ إلى الرفّ — قبل البدل. السطرُ يردّ نفسَه (`returnsLineId = id`) فتعود
        //    الكميةُ إلى طبقاتها الأصلية بتكلفتها، لا بسعر البيع.
        const returned = await returnStockedLines(tx, {
          companyId,
          branchId: rejected.branchId,
          date: issueDate,
          documentNo: rejected.no,
          lines: rejected.lines.map((l) => ({ id: l.id, productId: l.productId, quantity: l.quantity, returnsLineId: l.id, returnCondition: 'GOOD' as const })),
        });
        // ⚖️ ق-١٣٦٤ ومعه ما رُفع على العائد بعد خروجه — بالعملة الأساسية أصلاً (من الطبقة) فلا يُحوَّل.
        const returnedBase = round2(toBaseAmount(returned.totalCost, rate) + returned.raisedAfterExit);
        if (returnedBase > 0) {
          await postCogsReversalEntry(tx, companyId, {
            branchId: rejected.branchId,
            no: rejected.no,
            date: issueDate,
            baseCost: returnedBase,
            memo: `عكس تكلفة مبيعات — إغلاقُ مردودة ${rejected.no}`,
          });
        }

        // ② عكسُ القيد — لا حذفُه.
        let reversalJournalEntryId: string | null = null;
        if (rejected.journalEntryId) {
          const reversal = await postReversalEntry(tx, companyId, {
            entryId: rejected.journalEntryId,
            date: issueDate,
            memo: `عكس فاتورة مبيعات ${rejected.no} — مردودةٌ أُغلقت ببدل`,
          });
          reversalJournalEntryId = reversal?.id ?? null;
          if (reversalJournalEntryId) await tx.invoice.update({ where: { id: rejected.id }, data: { reversalJournalEntryId } });
        }

        // ③ البدلُ — بالمسار القائم بعينه، والرابطُ في كتابة الإنشاء نفسها.
        const replacement = await this.createWithinTx(
          tx,
          companyId,
          tenant.allowedBranchIds,
          {
            customerId: rejected.customerId,
            issueDate: issueDate.toISOString(),
            issuedAt: clock.issuedAt ? clock.issuedAt.toISOString() : undefined,
            issuedOffsetMin: clock.issuedAt ? (clock.issuedOffsetMin ?? undefined) : undefined,
            dueDate: dueDate.toISOString(),
            notes: rejected.notes ?? undefined,
            branchId: rejected.branchId ?? undefined,
            currency: rejected.currency,
            exchangeRate: rate,
            // ⑧ البدلُ يحمل فئةَ المردودة كما كُتبت — لا ما على البطاقة اليوم (`trustLineTax`).
            lines: linesFromOriginal(rejected.lines, () => ({})),
          },
          credit,
          { replacesInvoiceId: rejected.id, trustLineTax: true },
        );

        // ④ المقبوضُ يُنقل — والحالةُ تُشتقّ للاثنين، والأثرُ في السجلّ باسم الفاعل.
        const allocations = await tx.paymentAllocation.findMany({ where: { invoiceId: rejected.id }, select: { paymentId: true, amount: true } });
        const amountMoved = round2(allocations.reduce((s, a) => s + Number(a.amount), 0));
        if (allocations.length > 0) await tx.paymentAllocation.updateMany({ where: { invoiceId: rejected.id }, data: { invoiceId: replacement.id } });
        // ④A1: صفوفُ الدفعات المقدَّمة المطبَّقة تتبع تخصيصاتها إلى البدل — فيحمل مرجعَها (BT-113) كما حملته المردودة.
        await tx.invoicePrepayment.updateMany({ where: { invoiceId: rejected.id }, data: { invoiceId: replacement.id } });
        await this.syncSettlementStatus(tx, rejected.id, now);
        await this.syncSettlementStatus(tx, replacement.id, now);
        await this.audit.recordWithinTx(tx, {
          companyId,
          actorType: tenant.actorType,
          actorId: tenant.profileId,
          actorName,
          screen: 'invoice',
          action: 'replace',
          entity: 'invoices',
          entityId: replacement.id,
          method: 'POST',
          path: `/invoices/${rejected.id}/replacement`,
          details: {
            from: rejected.no,
            to: replacement.no,
            allocationsMoved: allocations.length,
            amountMoved,
            reversalJournalEntryId,
            stockReturnedLines: returned.restored.length,
          },
          ip: null,
        });

        const row = await tx.invoice.findUniqueOrThrow({ where: { id: replacement.id }, include: INVOICE_INCLUDE });
        // ② صورةُ الحدّ نصّاً (`ق-١٢٣٥`): ما عاد إلى الرفّ والمقبوضُ المنقول — والسجلُّ أعلاه يحمل الرقم.
        return {
          ...row,
          stockFulfilment: replacement.stockFulfilment,
          closure: { returned: restoredReport(returned.restored), reversalJournalEntryId, allocationsMoved: allocations.length, amountMoved: money(amountMoved) },
        };
      }),
    );
  }

  /**
   * حالةُ السداد المشتقّة — كما تكتبها `PaymentsService.recomputeInvoiceStatus` حرفاً: من
   * التخصيصات لا من حقل، و`OVERDUE` على المستحقّ الذي فات موعدُه. تُستدعى بعد نقل التخصيصات
   * للطرفين معاً كي لا يفترق المخزَّنُ عن المحسوب (حارسُ الانحراف في `invoice-outstanding`).
   */
  private async syncSettlementStatus(tx: Prisma.TransactionClient, invoiceId: string, now: Date): Promise<void> {
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, select: { total: true, status: true, dueDate: true, docType: true } });
    if (!invoice) return;
    // ④A1: مستندُ الدفعة المقدَّمة مسدَّدٌ بالبناء — سندُ قبضه أصدره، وتخصيصُه ينتقل إلى فاتورة التوريد عند التطبيق.
    if (invoice.docType === 'PREPAYMENT') return;
    const allocated = await tx.paymentAllocation.aggregate({ where: { invoiceId }, _sum: { amount: true } });
    const derived = deriveSettlementStatus(Number(allocated._sum.amount ?? 0), Number(invoice.total));
    // يومُ الآن بإزاحةٍ معلَنة لا بمنطقة العملية (`ق-١١٩٠`) — فحكمُ «متأخّرة» يقرؤه التاجر.
    const today = dayStartOf(now);
    const status = derived === 'DUE' && invoice.dueDate < today ? 'OVERDUE' : derived;
    if (status !== invoice.status) await tx.invoice.update({ where: { id: invoiceId }, data: { status } });
  }

  /**
   * ⭐ **بوّابةُ حدّ الائتمان — على `createWithinTx` وحدها** (`ق-٣٣٦` … `ق-٣٤٠`).
   *
   * **والمدخلُ واحدٌ مقيسٌ لا مفترَض**: الفاتورةُ المباشرة · تحويلُ عرض السعر ·
   * **وبيعُ الكاشير** (عبر `create`) — **ثلاثتُها تمرّ من هنا، فلا مسارَ يفلت**.
   *
   * **والترتيبُ مقصود**: يُفحص **قبل** `tx.invoice.create` — فبوّابةٌ تُفحص بعد
   * الإنشاء **تصير تقريراً لا منعاً**، وتترك رقمَ مستندٍ محروقاً في كل رفض.
   */
  private async gateCreditLimit(
    tx: Prisma.TransactionClient,
    companyId: string,
    args: { customerId: string; issueDate: Date; addingBase: number; allowedBranchIds: string[] | 'all' },
    credit: CreditContext,
  ): Promise<{ by: string; at: Date; exposure: number; limit: number } | null> {
    // ⚠️ **`ق-٣٣٨`**: ما يُسدَّد في الطلب نفسه لا يُفحص — **وحدٌّ يمنع بيعاً
    //    نقدياً عطلٌ يصنعه لا يمنعه**. وحدُّ هذا التصريح مُعلَنٌ في
    //    `credit-context.ts` ولا يُلتفّ عليه.
    if (credit.settlement === 'IMMEDIATE') return null;
    // والبدلُ عن مردودة ذمّةٌ تنتقل لا تزيد (`ق-٩٥٨`) — حدُّه `credit-context.ts`.
    if (credit.settlement === 'REPLACEMENT') return null;

    const check = await checkCreditLimit(tx, {
      customerId: args.customerId,
      asOf: args.issueDate,
      addingBase: args.addingBase,
    });
    if (!check.exceeded) return null;

    const grouped = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const numbers = {
      customer: check.customerName,
      limit: grouped(check.limit),
      exposure: grouped(check.exposure),
      adding: grouped(check.adding),
      after: grouped(check.after),
    };
    // ⚖️ **والمقيَّدُ بفرعٍ لا يُقال له ذمّةُ العميل** (توجيه ٢٧٥ · `ق-١٥٨١`): القياسُ على المنشأة كلِّها كما هو، والرسالةُ تسمّي
    //    حدَّ العميل وهذه الفاتورة بلا الذمّة وما تصير إليه — فتلك أرقامُ المنشأة كلِّها.
    const branchReader = args.allowedBranchIds !== 'all';
    const say = (whole: MessageKey, scoped: MessageKey) =>
      branchReader ? formatMessage(scoped, { customer: numbers.customer, limit: numbers.limit, adding: numbers.adding }) : formatMessage(whole, numbers);

    // ⚖️ **المنعُ الصلب إعدادٌ يختاره التاجر** (`ق-٣٤٠`) — **ولا تجاوزَ معه
    //    لأحد ولو ملك `review`**، وهو معنى «صلب».
    const company = await tx.company.findUnique({ where: { id: companyId }, select: { creditLimitHardBlock: true } });
    if (company?.creditLimitHardBlock) {
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        message: say(MSG.credit_limit_hard_block, MSG.credit_limit_hard_block_branch_reader),
        code: CREDIT_CODE.hardBlock,
      });
    }

    // ⚠️ **والرفضُ يسبق التجاوز**: طلبٌ لم يصرّح **يُردّ برسالةٍ تحمل الأرقام**
    //    — فالواجهة تسأل التاجر، **ولا يمرّ تجاوزٌ لم يقصده أحد**.
    if (!credit.overrideRequested) {
      throw new ConflictException({
        statusCode: HttpStatus.CONFLICT,
        message: say(MSG.credit_limit_exceeded, MSG.credit_limit_exceeded_branch_reader),
        code: CREDIT_CODE.exceeded,
      });
    }
    if (!credit.canOverride || !credit.actor) {
      throw new ForbiddenException({
        statusCode: HttpStatus.FORBIDDEN,
        message: formatMessage(MSG.credit_limit_override_forbidden, {}),
        code: CREDIT_CODE.forbidden,
      });
    }

    return { by: credit.actor.id, at: new Date(), exposure: check.exposure, limit: check.limit };
  }

  /**
   * نقطة الدخول داخل-المعاملة (4.9): يستهلكها تحويل عرض السعر ليجعل إنشاء
   * الفاتورة وختمَ العرض معاملةً واحدة ذرّية. الجسد هو ما كان داخل create
   * حرفياً — لا تغيير سلوك للمسار القائم، واختباراته القديمة حكمُ ذلك.
   * ملاحظة: من يستدعيها مسؤول عن retryOnUniqueConflict حول معاملته كلها.
   */
  async createWithinTx(
    tx: Prisma.TransactionClient,
    companyId: string,
    allowedBranchIds: string[] | 'all',
    dto: CreateInvoiceDto,
    credit: CreditContext,
    /** بدلٌ عن مردودة (`ق-٩٦٣`): الرابطُ يُكتب في كتابة الإنشاء نفسها — لا يُلحق بعدها.
     * و`trustLineTax` للنسخ الداخليّ من سطورٍ مخزَّنة (البدلُ · تحويلُ العرض): تُوثَق فئتُها كما كُتبت. */
    link: { replacesInvoiceId?: string; trustLineTax?: boolean } | null = null,
  ) {
    // ⑧ الفئةُ والنسبةُ تُحلّان قبل أيّ حساب: من الصنف لحظةَ البيع، أو من إعلان السطر، أو من الأصل المنسوخ.
    const lines = await priceLines(tx, dto.lines, { trusted: link?.trustLineTax });
    const { subtotal, taxTotal, total } = computeTotals(lines);
    // بلا عملةٍ صريحة ⟵ عملةُ أساس المنشأة لا الريال (`ق-١٣٦٨`).
    const { currency, exchangeRate } = await resolveCurrencyWithin(tx, companyId, dto);
      /**
       * ⚖️ **الحدُّ يُفحص قبل أي كتابة** (`ق-٣٣٦`) — قبل الترقيم نفسِه:
       * **رفضٌ بعد `nextDocumentNumber` يحرق رقماً في كل محاولة**، والعدّادُ
       * ذرّيٌّ لا يعيد المحروق (`ق-٣٣١`③). فيُفحص أولاً، **ولا فجوةَ من رفض**.
       */
      // ②A1: صفةُ المشتري تقرّر نوعَ المستند، والمختومُ لا يُعدَّل — فعميلٌ لم يُعلن صفتَه يُرفض هنا قبل الحدّ والترقيم.
      await assertBuyerKindDeclared(tx, dto.customerId);
      const override = await this.gateCreditLimit(
        tx,
        companyId,
        { customerId: dto.customerId, issueDate: new Date(dto.issueDate), addingBase: toBaseAmount(total, exchangeRate), allowedBranchIds },
        credit,
      );
      const branchId = await resolveBranchId(tx, dto.branchId, allowedBranchIds);
      // ⚖️ الدفعةُ المقدَّمة المطبَّقة يراها القارئ (`ق-١٥٨١`): قائمتُها مرشَّحةٌ بفروعه، فمعرّفُ دفعةِ فرعٍ آخر يُردّ كالغائب.
      if (allowedBranchIds !== 'all' && dto.prepaymentInvoiceIds?.length) {
        const ids = [...new Set(dto.prepaymentInvoiceIds)];
        if ((await tx.invoice.count({ where: { id: { in: ids }, ...branchFilter(allowedBranchIds) } })) !== ids.length) throw new NotFoundException(MSG.invoice_not_found);
      }
      // ⚖️ (`ق-١٤٦٦` · `ق-١٤٩٠`) وكلُّ ما يُرفض بعد الترقيم يُفحص قبله: حساباتُ القيد (و`5100`/`1300` حين يُخصم من الرفّ)
      // والفترةُ والدفعاتُ المقدَّمة المسمّاة — فالرفضُ برسالةٍ لا يحرق رقماً من سلسلة الفاتورة. والمقروءُ هنا هو ما يقرؤه
      // التنفيذُ بعينه، وفحوصُ التنفيذ باقيةٌ طبقةً ثانية.
      const { prepayments } = await assertSaleIssuable(tx, companyId, {
        issueDate: new Date(dto.issueDate),
        branchId,
        customerId: dto.customerId,
        lines: dto.lines,
        currency,
        total,
        base: { baseTotal: toBaseAmount(total, exchangeRate), baseSubtotal: toBaseAmount(subtotal, exchangeRate), baseTaxTotal: toBaseAmount(taxTotal, exchangeRate) },
        prepaymentInvoiceIds: dto.prepaymentInvoiceIds,
      });
      // ⚖️ (`ق-١٤٩٠` · `INV-①`) والبيعُ من دفعةٍ منتهية يُفحص قبل الترقيم كذلك — بقراءة التسليم نفسِها (مستودعُ الفرع ·
      //    السطورُ المخزنية · الدورةُ الأولى من `consumeFifo` بيوم المستند) وبمجموع الكمّية لكلّ صنف؛ فالرفضُ برسالته
      //    لا يحرق رقماً. ويبقى رفضُ `consumeFifo` بعد الترقيم طبقةَ السباق وحدَها. والكاشيرُ يمرّ من هنا كذلك.
      await assertSaleNotBlockedByExpiry(tx, {
        branchId,
        date: new Date(dto.issueDate),
        lines: lines.map((l) => ({ productId: l.productId ?? null, quantity: l.quantity })),
      });
      const no = await this.nextDocumentNumber(tx, companyId, 'INV', new Date(dto.issueDate));
      // ① وحدةُ كلِّ سطرٍ تُنسخ من صنفه لحظةَ الكتابة — وصنفٌ لم يُعلن وحدتَه يترك السطرَ بلا وحدة، لا برمزٍ مخمَّن.
      const unitCodes = await unitCodesFor(tx, dto.lines);
      const created = await tx.invoice.create({
        // `companyId` (top-level and on each nested line) is set explicitly
        // rather than relying on the tenant-scope extension: nested relation
        // writes like `lines: { create: [...] }` happen inside the query
        // engine and are never seen by the extension's per-operation hook,
        // so it can only auto-inject companyId for the top-level Invoice
        // write, not for InvoiceLine here. Postgres RLS backstops this
        // regardless (see tenant-prisma.service.ts).
        data: {
          companyId,
          no,
          branchId,
          customerId: dto.customerId,
          issueDate: new Date(dto.issueDate),
          // لحظة الجهاز وانحرافه معاً أو لا شيء (`ق-١٨٥`) — الـDTO يضمن الاقتران.
          issuedAt: dto.issuedAt ? new Date(dto.issuedAt) : null,
          issuedOffsetMin: dto.issuedAt ? (dto.issuedOffsetMin ?? null) : null,
          dueDate: new Date(dto.dueDate),
          notes: dto.notes,
          // ⚖️ **التجاوزُ يُخزَّن على الفاتورة** (`ق-٣٣٩`) — الأربعةُ معاً أو
          //    `null` كلُّها. **والحفظُ في نفس الكتابة**: تجاوزٌ يُلحق بعدها
          //    قد لا يُلحق، **ففاتورةٌ متجاوِزةٌ بلا شهادةٍ هي الثغرة بعينها**.
          creditOverrideById: override?.by ?? null,
          creditOverrideAt: override?.at ?? null,
          creditOverrideExposure: override ? new Prisma.Decimal(override.exposure) : null,
          creditOverrideLimit: override ? new Prisma.Decimal(override.limit) : null,
          replacesInvoiceId: link?.replacesInvoiceId ?? null,
          subtotal,
          taxTotal,
          total,
          currency,
          exchangeRate,
          baseSubtotal: toBaseAmount(subtotal, exchangeRate),
          baseTaxTotal: toBaseAmount(taxTotal, exchangeRate),
          baseTotal: toBaseAmount(total, exchangeRate),
          lines: {
            // رقمُ السطر من ترتيب الإدخال (`ق-١٤١٢`).
            create: numberLines(
              lines.map((l) => ({
                companyId,
                description: l.description,
                productId: l.productId ?? null,
                unitCode: unitCodeOf(unitCodes, l.productId),
                quantity: l.quantity,
                unitPrice: l.unitPrice,
                discount: l.discount ?? 0,
                // ⑧ الفئةُ والسببُ والنسبةُ المشتقّة — منسوخةً لحظةَ البيع كما الوحدة.
                ...taxColumns(l),
              })),
            ),
          },
        } as unknown as Prisma.InvoiceUncheckedCreateInput,
        include: INVOICE_INCLUDE,
      });

      /**
       * ⚖️ **وحدثٌ باسمه في سجل التدقيق — بمعاملته** (`ق-٣٣٩`).
       *
       * ⚠️ **داخل المعاملة لا بعدها**، على سابقة `self-review` نصّاً: «**فعلٌ
       * حُفظ بلا شهادة هو الثغرة النظامية بعينها**». فتقع الفاتورةُ وشهادةُ
       * تجاوزها معاً، **أو لا يقع شيء**.
       *
       * **والفعلُ باسمه** (`credit-override`) **لا `add` عامّاً**: فيجده
       * المدقّق بحثاً — `GET /audit-log?action=credit-override` — **لا
       * بمقارنة حقلين يدوياً في كل فاتورة**.
       */
      if (override && credit.actor) {
        await this.audit.recordWithinTx(tx, {
          companyId,
          actorType: credit.actor.actorType,
          actorId: credit.actor.id,
          actorName: credit.actor.name,
          screen: 'invoice',
          action: CREDIT_OVERRIDE_ACTION,
          entity: 'invoices',
          entityId: created.id,
          method: 'POST',
          path: '/invoices',
          details: {
            no: created.no,
            customerId: created.customerId,
            limit: override.limit,
            exposureBefore: override.exposure,
            adding: Number(created.baseTotal),
          },
          ip: null,
        });
      }

      /**
       * ⭐ **التسليم من هنا وحده** — حركة المخزون وتكلفتها من مالكٍ واحد هو
       * سطر الفاتورة. والكاشير يمرّ من هذا المسار نفسه، فلا مسار ثانٍ يخصم.
       *
       * ⚠️ **وقيد التكلفة منفصل عن قيد الفاتورة**: الأول حدثٌ مخزنيّ والثاني
       * إيرادي، وقد يقع أحدهما بلا الآخر (بيع خدمة · بضاعة بلا مستودع).
       */
      const fulfilment = await fulfilStockedLines(tx, {
        companyId,
        branchId: created.branchId,
        date: created.issueDate,
        documentNo: created.no,
        lines: created.lines,
      });
      if (fulfilment.fulfilled) {
        await postCogsEntry(tx, companyId, {
          branchId: created.branchId,
          no: created.no,
          date: created.issueDate,
          baseCost: toBaseAmount(fulfilment.totalCost, exchangeRate),
        });
      }

      // Auto-post to the ledger. ⚖️ (`ق-١٤٦٦`) لا تخطٍّ ناعم: حسابٌ غائب يرمي `409` مسمّىً فتسقط الفاتورةُ كلُّها —
      // وقد فُحص قبل الترقيم أعلاه، فلا يبلغ هنا إلا ما حُذف بين الفحص والترحيل.
      const entry = await postInvoiceEntry(tx, companyId, {
        customerId: created.customerId,
        branchId: created.branchId,
        no: created.no,
        issueDate: created.issueDate,
        customerName: created.customer.name,
        baseSubtotal: Number(created.baseSubtotal),
        baseTaxTotal: Number(created.baseTaxTotal),
        baseTotal: Number(created.baseTotal),
      });
      /**
       * `stockFulfilment` **حقلٌ عابر لا عمود** — لا يُخزَّن ولا يُقرأ لاحقاً:
       * هو تقرير ما وقع في هذه المعاملة بعينها، يستهلكه الكاشير ليعرض للبائع
       * سبب عدم الخصم إن لم يقع. **والحقيقة تبقى في دفتر الحركات وحده.**
       */
      /**
       * ⭐ **حدثُ الإصدار داخل المعاملة نفسها** (`ق-٣٩` · `ق-٤٩`).
       *
       * الطابور يُكتب هنا لا بعد الحفظ: **إن تعذّرت كتابته تُلغى الفاتورة**، فلا
       * تبقى فاتورةٌ تنتظر الهيئة ولا أحد يعلم بها. وكان الإرسال نقرةً يدوية —
       * أي أن فاتورةً تُنشأ **وتُنسى** بلا أثرٍ يقول إنها لم تصل.
       */
      await events.emitCompliance(tx, {
        type: INVOICE_ISSUED,
        companyId,
        payload: { invoiceId: created.id, docType: created.docType, no: created.no } satisfies InvoiceIssuedPayload,
      });

      // ④A1: الدفعاتُ المقدَّمة المسمّاة تُطبَّق على هذه الفاتورة — تخصيصٌ من سند قبضها، وقيدُ إقفالِ الالتزام، وصفُّ الربط للمستند.
      // (`ق-١٤٩٠`) وقد فُحصت قبل الترقيم (`assertSaleIssuable`)، فتصل هنا مقروءةً مرتَّبة.
      if (prepayments.length > 0) await this.applyPrepayments(tx, companyId, created, prepayments);

      // ② التسليمُ يخرج نصّاً بدقّة صنفه (`ق-١٢٣٥`) — والكاشيرُ يقرأ صورةَ الحدّ هذه لا الرقم.
      if (!entry) return { ...created, stockFulfilment: fulfilmentReport(fulfilment) };
      const saved = await tx.invoice.update({ where: { id: created.id }, data: { journalEntryId: entry.id }, include: INVOICE_INCLUDE });
      return { ...saved, stockFulfilment: fulfilmentReport(fulfilment) };
  }

  /**
   * 🔴 **الفاتورةُ بفروع الفاعل لا بمعرّفها وحدَه** (`ق-١٤٤٠`): فاتورةُ فرعٍ آخر غيرُ موجودةٍ له — `404` قبل
   * أيّ فحصٍ يكشف نوعَها أو قفلَها. (وكان هنا إعلانُ قراءةٍ عامّةٍ لبحث الخلَف في سلسلة الهيئة، والبحثُ سقط
   * حين صار الصادرُ كلُّه مقفلاً — `ق-٩٥٠` · `ق-٩٥٨` — فلا قراءةَ جامعةً فيه يُعلَن لها.)
   */
  update(companyId: string, allowedBranchIds: string[] | 'all', id: string, dto: UpdateInvoiceDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // الفرعُ أوّلاً (`ق-١٤٤٠`): فاتورةُ فرعٍ آخر 404 لا 409/400 القفلِ الذي يكشف وجودَها — فهي غيرُ موجودةٍ له.
      const existing = await tx.invoice.findFirst({ where: { id, ...branchFilter(allowedBranchIds) } });
      if (!existing) throw new NotFoundException(MSG.invoice_not_found);

      // What the submitted XML is signed over. Notes are absent on purpose: they
      // never enter the document, so they stay editable at every stage. Payment
      // status is not editable here at all any more (`ق-١١٩٨`/②) — it is derived
      // from allocations, and a cleared invoice becomes PAID through a receipt.
      //
      // The test is presence, not difference: a field that arrives is treated
      // as an attempt to set it, exactly like `affectsPosting` below. Diffing
      // submitted values against stored ones would make the guard depend on
      // Decimal/date normalisation getting it right every time, and a guard
      // that silently lets an edit through when the comparison is wrong is
      // worse than one that refuses a no-op resubmission. It also means the
      // builder screen — which always posts the whole document — is refused
      // as a whole, which is the right answer for a locked invoice.
      const changesSignedContent =
        dto.lines !== undefined ||
        dto.customerId !== undefined ||
        dto.issueDate !== undefined ||
        dto.dueDate !== undefined ||
        // Currency and rate reach the authority through the base* columns:
        // ZATCA is told the VAT figure in SAR, and that is `baseTaxTotal`.
        dto.currency !== undefined ||
        dto.exchangeRate !== undefined;

      // الإشعارُ مستندٌ صادرٌ برقمه يدخل السلسلة — لا يُعدَّل ولا يُحذف، ومخرجُه إشعارٌ
      // مقابل (`ق-٩٥٢`). الدائنُ لا حالةَ سدادٍ له فيُرفض كلُّه؛ والمدينُ ذمّةٌ فتتحرّك حالتُه.
      if (existing.docType === 'CREDIT_NOTE') throw new BadRequestException(MSG.credit_note_immutable);
      if (existing.docType === 'DEBIT_NOTE' && changesSignedContent) throw new BadRequestException(MSG.credit_note_immutable);
      // ④A1: مستندُ الدفعة المقدَّمة صادرٌ من سند قبضه وحالتُه مسدَّدةٌ بالبناء — لا يُعدَّل بحال.
      if (existing.docType === 'PREPAYMENT') throw new BadRequestException(MSG.prepayment_immutable);

      if (changesSignedContent) {
        /**
         * ⚖️ **الفاتورةُ الصادرة لا تُعدَّل — مختومةً كانت أو لا** (`ق-٩٤٣`).
         *
         * لا مسوّدةَ للفاتورة: تصدر لحظةَ إنشائها مرقَّمةً من تسلسل المنشأة، مرحَّلةً،
         * وقد حرّكت مخزونَها، وحدثُها في الطابور إلى الهيئة (`ق-٩٣٥`). والعميلُ يحمل رقمَها
         * ورمزَ المرحلة الأولى منذ الإصدار، وإيصالُ الكاشير للقياسية يخرج قبل الإجازة،
         * ولا نافذةَ ضيّقة حيث لا تسجيل — المنشورُ كلُّه بلا ختمٍ منذ شهر (`ق-٩٤١`).
         * فتعديلُها يجعل ما بيد العميل يخالف ما عندنا **صامتاً**. والمخرجُ الإشعاران.
         *
         * **حارسٌ واحدٌ ورسالةٌ واحدة** (`ق-٩٥٠`): الشروطُ الأربعة التي كانت هنا
         * (`CLEARED` · `SUBMITTING` · `STAMPED` · مردودةٌ لها خَلَف) محتواةٌ فيه —
         * السببُ لا يغيّر الحكمَ ولا المخرج.
         *
         * ⚖️ **والمردودةُ كذلك — بلا استثناء** (`ق-٩٥٨` · `ق-٩٦٤`): كان لها استثناءٌ
         * معلَّقٌ على الكتالوج («تُصحَّح وتُعاد على موقعها»)، والكتالوجُ أسقطه: عدّادُها
         * وتجزئتُها لا يُمسّان، والتصحيحُ مستندٌ جديد — `issueReplacement`.
         */
        throw new ConflictException(MSG.invoice_issued_locked);
      }

      const data: Prisma.InvoiceUncheckedUpdateInput = {};
      if (dto.customerId) data.customerId = dto.customerId;
      if (dto.issueDate) data.issueDate = new Date(dto.issueDate);
      if (dto.dueDate) data.dueDate = new Date(dto.dueDate);
      if (dto.notes !== undefined) data.notes = dto.notes;
      // كان هنا `if (dto.status) data.status = dto.status` — حالةٌ مشتقّةٌ تُكتب من الخارج (`ق-١١٩٨`/②).

      if (dto.lines) {
        // ⑧ (مسارٌ لا يُبلَغ عملياً — الصادرةُ مقفلةٌ أعلاه — ويبقى مطابقاً للإنشاء.)
        const priced = await priceLines(tx, dto.lines);
        const totals = computeTotals(priced);
        // The rate stays whatever the invoice was issued at unless the caller
        // explicitly sends a new one — re-editing lines must not silently
        // reprice the document at today's rate.
        const rate = dto.exchangeRate ?? Number(existing.exchangeRate);
        data.subtotal = totals.subtotal;
        data.taxTotal = totals.taxTotal;
        data.total = totals.total;
        data.baseSubtotal = toBaseAmount(totals.subtotal, rate);
        data.baseTaxTotal = toBaseAmount(totals.taxTotal, rate);
        data.baseTotal = toBaseAmount(totals.total, rate);
        if (dto.currency) data.currency = dto.currency;
        if (dto.exchangeRate !== undefined) data.exchangeRate = dto.exchangeRate;
        // Replace-all rather than diffing line-by-line — simplest correct
        // approach, and invoices are edited as a whole in the UI anyway.
        await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
        const unitCodes = await unitCodesFor(tx, dto.lines);
        data.lines = {
          create: numberLines(
            priced.map((l) => ({
              companyId,
              description: l.description,
              productId: l.productId ?? null,
              unitCode: unitCodeOf(unitCodes, l.productId),
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              discount: l.discount ?? 0,
              ...taxColumns(l),
            })),
          ),
        } as unknown as Prisma.InvoiceUncheckedUpdateInput['lines'];
      }

      // Anything that changes what should be posted (who, when, or the
      // amounts) reverses the old auto-entry and re-posts fresh, rather than
      // trying to patch a posted entry in place — matches the "never edit a
      // posted entry" rule from journal-posting.util.
      const affectsPosting = dto.customerId !== undefined || dto.issueDate !== undefined || dto.lines !== undefined;
      if (affectsPosting && existing.journalEntryId) {
        // Detach first: the old entry can't be deleted while this invoice
        // still references it (onDelete: Restrict).
        data.journalEntryId = null;
      }

      const updated = await tx.invoice.update({ where: { id }, data, include: INVOICE_INCLUDE });
      if (!affectsPosting) return updated;

      if (existing.journalEntryId) await unpostIfLinked(tx, existing.journalEntryId);
      const entry = await postInvoiceEntry(tx, companyId, {
        customerId: updated.customerId,
        branchId: updated.branchId,
        no: updated.no,
        issueDate: updated.issueDate,
        customerName: updated.customer.name,
        baseSubtotal: Number(updated.baseSubtotal),
        baseTaxTotal: Number(updated.baseTaxTotal),
        baseTotal: Number(updated.baseTotal),
      });
      if (!entry) return updated;
      return tx.invoice.update({ where: { id }, data: { journalEntryId: entry.id }, include: INVOICE_INCLUDE });
    });
  }

  /**
   * 🔴 **الفاتورةُ بفروع الفاعل لا بمعرّفها وحدَه** (`ق-١٤٤٠`): فاتورةُ فرعٍ آخر `404` لا `409` القفل الذي
   * يكشف وجودَها ونوعَها. (وكان هنا إعلانُ قراءةٍ عامّةٍ للإشعارات المرتبطة، والفحصُ صار محتوىً في المنع
   * أدناه — فلا قراءةَ جامعةً فيه يُعلَن لها.)
   */
  /**
   * ⚖️ **الصادرُ لا يُزال — الحذفُ كالتعديل** (`ق-٩٤٣` · `ق-٩٤٥/٣`).
   *
   * الإزالةُ تعديلٌ إلى العدم: العميلُ يحمل رقمَ المستند، والتسلسلُ يفقده. وما كان هنا
   * من شروطٍ (موقعٌ في السلسلة · إشعاراتٌ عليه) صار محتوىً في المنع — ومسارُ المفتاح
   * الأجنبيّ الذي فشل به الحذفُ (بندُ ① من المراجعة الخارجية) **لا يُبلَغ أصلاً**.
   * والمخرجُ إشعارٌ: على الفاتورة، وعلى الإشعار إشعارٌ مقابل (`ق-٩٥٢`).
   *
   * ⛔ ولا استثناءَ للاختبار هنا (`ق-٩٥٣`): تنظيفُه بمسارٍ في سياق المستأجر
   * (`test/purge-invoices.ts`) — فاستثناءٌ له يجعله يشهد لِما لا يقع.
   */
  async remove(companyId: string, allowedBranchIds: string[] | 'all', id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // الفرعُ أوّلاً (`ق-١٤٤٠`): فاتورةُ فرعٍ آخر 404 لا 409 القفلِ الذي يسمّي نوعَها — فهي غيرُ موجودةٍ له.
      const existing = await tx.invoice.findFirst({ where: { id, ...branchFilter(allowedBranchIds) }, select: { docType: true } });
      if (!existing) throw new NotFoundException(MSG.invoice_not_found);
      throw new ConflictException(existing.docType === 'INVOICE' ? MSG.invoice_issued_locked : MSG.credit_note_immutable);
    });
  }

  /**
   * Issues a credit note against an existing invoice (ZATCA type 381).
   *
   * The original is never touched — not its lines, not its posted entry (the
   * never-edit rule from journal-posting.util). The note is its own row in
   * the invoice table (docType CREDIT_NOTE) carrying **positive** amounts —
   * direction comes from the docType, exactly as the UBL document ZATCA
   * receives carries positive amounts under type code 381 — and it posts its
   * own reversing journal entry.
   *
   * **على مستوى المنشأة بحقّها**: سقفُ الإشعارات الدائنة يُحسب من كلّ إشعارات
   * الفاتورة — وإشعارٌ في فرعٍ محجوبٍ عن القارئ يبقى مخصوماً من السقف، وإلا
   * جاز أن يُعتمد أكثرُ مما فُوتر. والأصلُ نفسُه يُقاس على فروع القارئ في
   * `adjustableOriginal`.
   */
  issueCreditNote(companyId: string, allowedBranchIds: string[] | 'all', invoiceId: string, dto: CreateCreditNoteDto) {
    return retryOnUniqueConflict(() => this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const original = await this.adjustableOriginal(tx, invoiceId, allowedBranchIds, 'CREDIT_NOTE');
      // دائنٌ على مدينٍ زائد (`ق-٩٥٢`): يعكس فوترةً إضافية لا بيعاً — فلا مرتجعَ فيه ولا رفّ.
      const correctsDebitNote = original.docType === 'DEBIT_NOTE';

      // المصدرُ الواحد ② — والصنفُ يُنقل مع السطر: إشعارٌ دائن يفقد صنفه يعكس الإيراد ولا يستطيع عكس
      // تكلفته. وإشعارٌ كامل = مرتجعٌ كامل سليم (`SPEC 30.4`): كل سطرٍ يشير إلى أصله ويعود إلى الرفّ.
      const draft: InvoiceLineDto[] =
        dto.lines ?? linesFromOriginal(original.lines, (l) => (correctsDebitNote ? {} : { returnsLineId: l.id, returnCondition: 'GOOD' as const }));
      if (correctsDebitNote && draft.some((l) => l.returnsLineId)) throw new BadRequestException(MSG.return_line_not_original);

      // `SPEC 30.2` (المصدرُ الواحد ③): سطرُ مرتجعٍ يشير إلى سطرٍ من **هذه** الفاتورة الأصلية وحدها، وبكميةٍ
      // لا تتجاوز ما فُوتر فيه — والتراكم عبر الإشعارات السابقة يفحصه `returnStockedLines` من الحركات.
      // سطرٌ بلا `returnsLineId` إشعارٌ محاسبيّ لا يمسّ المخزون.
      assertReturnLinesBelong(
        draft.map((l) => ({ returnsId: l.returnsLineId, productId: l.productId, quantity: l.quantity })),
        original.lines,
        { notOriginal: MSG.return_line_not_original, exceeds: MSG.return_exceeds_sold },
      );
      // ⑧ الإشعارُ يعكس **ما فُوتر**: سطرُ مرتجعٍ يرث فئةَ أصله، والإشعارُ الكامل ينسخ سطورَ الأصل كما كُتبت؛
      // وسطرٌ حرٌّ يضيفه التاجر يُحلّ كأيّ سطرٍ جديد (صنفُه أو إعلانُه).
      const originals = new Map(original.lines.map((l) => [l.id, { taxCategory: l.taxCategory, taxExemptionReasonCode: l.taxExemptionReasonCode, taxExemptionReason: l.taxExemptionReason }]));
      const lines = await priceLines(tx, draft, { trusted: dto.lines === undefined, originals });
      const totals = computeTotals(lines);

      // All credit notes on one invoice together must not exceed what it billed — crediting more
      // than was ever invoiced is a bookkeeping error, not a judgment call (المصدرُ الواحد ④). (No
      // such cap exists for debit notes on an invoice: additional billing has no arithmetic ceiling.)
      // والسقفُ يُحسب بعد قفل الأصل: إشعاران متزامنان كانا يقرآن المجموعَ نفسَه فيتجاوزانه معاً، وهو نظيرُ
      // الردّ المزدوج (البند 18 من مراجعة 3.3 · `ق-١٥٧٥`)، والقفلُ نفسُه يسلسل الإشعارَ مع الردّ على الأصل.
      await lockDocumentRow(tx, 'invoices', invoiceId);
      const already = await tx.invoice.aggregate({
        where: { relatedInvoiceId: invoiceId, docType: 'CREDIT_NOTE' },
        _sum: { total: true },
      });
      assertWithinRemaining(totals.total, Number(original.total), Number(already._sum.total ?? 0), MSG.credit_note_exceeds_remaining);

      return this.createAdjustmentNote(tx, companyId, original, {
        docType: 'CREDIT_NOTE',
        numberKind: 'CN',
        reason: dto.reason,
        issueDate: dto.issueDate,
        eventDate: dto.eventDate,
        lines,
        totals,
        // Nothing is receivable on a credit note — PAID keeps it out of
        // every outstanding/aging computation keyed on status.
        status: 'PAID',
        post: postCreditNoteEntry,
      });
    }));
  }

  /**
   * Issues a debit note (ZATCA type 383) — additional billing against an
   * already-issued invoice (an undercharge, extra delivery costs). Same
   * document mechanics as the credit note, opposite economics: it posts in
   * the invoice's own direction and IS receivable, so it starts DUE and its
   * payment status may later move to PAID.
   *
   * **على مستوى المنشأة بحقّها**: سقفُ المدين على الدائن الزائد (`ق-٩٥٢`) يُحسب من كلّ
   * الإشعارات المدينة على ذلك الدائن — وإشعارٌ في فرعٍ محجوبٍ عن القارئ يبقى مخصوماً من
   * السقف، وإلا جاز أن يُصحَّح أكثرُ مما زاد. والهدفُ نفسُه يُقاس على فروع القارئ في
   * `adjustableOriginal`.
   */
  issueDebitNote(companyId: string, allowedBranchIds: string[] | 'all', invoiceId: string, dto: CreateDebitNoteDto) {
    return retryOnUniqueConflict(() => this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const original = await this.adjustableOriginal(tx, invoiceId, allowedBranchIds, 'DEBIT_NOTE');
      // ⑧ فوترةٌ إضافية: سطورُها جديدةٌ تُحلّ كأيّ بيع — من الصنف أو من إعلان السطر.
      const lines = await priceLines(tx, dto.lines);
      const totals = computeTotals(lines);
      // مدينٌ على دائنٍ زائد (`ق-٩٥٢`): يصحّح ما زاد في الإشعار الدائن — فلا يتجاوز ما بقي
      // منه بعد ما صُحِّح قبلَه. (على الفاتورة نفسِها لا سقفَ: فوترةٌ إضافية بلا حدٍّ حسابيّ.)
      if (original.docType === 'CREDIT_NOTE') {
        await lockDocumentRow(tx, 'invoices', invoiceId); // السقفُ بعد القفل، كالإشعار الدائن أعلاه (`ق-١٥٧٥`)
        const already = await tx.invoice.aggregate({ where: { relatedInvoiceId: invoiceId, docType: 'DEBIT_NOTE' }, _sum: { total: true } });
        assertWithinRemaining(totals.total, Number(original.total), Number(already._sum.total ?? 0), MSG.credit_note_exceeds_remaining);
      }
      return this.createAdjustmentNote(tx, companyId, original, {
        docType: 'DEBIT_NOTE',
        numberKind: 'DN',
        reason: dto.reason,
        issueDate: dto.issueDate,
        eventDate: dto.eventDate,
        lines,
        totals,
        status: 'DUE',
        post: postDebitNoteEntry,
      });
    }));
  }

  /**
   * الهدفُ الذي يجوز أن يشير إليه الإشعار: **فاتورةٌ أصلية، أو إشعارٌ مقابل** (`ق-٩٥٢`).
   *
   * الإشعارُ مستندٌ صادرٌ برقمه يدخل السلسلة — لا يُعدَّل ولا يُحذف — فالإشعارُ الخاطئ
   * يُصحَّح بإشعارٍ عليه: **المدينُ يصحّح دائناً زائداً، والدائنُ يصحّح مديناً زائداً**.
   * وهو امتدادُ الآلية القائمة لا محرّكٌ ثانٍ: **القيدُ في نوع الهدف وحدَه** — ولا إشعارَ
   * على إشعارٍ من نوعه (دائنٌ على دائنٍ يعكس مرّتين، ومدينٌ على مدينٍ يفوتر مرّتين).
   * ويسكن الهدفُ في فرعٍ يحقّ للمستدعي الكتابةُ فيه.
   */
  private async adjustableOriginal(
    tx: Prisma.TransactionClient,
    invoiceId: string,
    allowedBranchIds: string[] | 'all',
    noteKind: 'CREDIT_NOTE' | 'DEBIT_NOTE',
  ) {
    const original = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { customer: true, lines: LINE_ORDER } });
    if (!original) throw new NotFoundException(MSG.invoice_not_found);
    // ④A1: الإشعارُ على مستند 386 (ردُّ دفعةٍ مقدَّمة) موجةٌ لاحقة — يُرفض مسمّىً لا يُبنى نصفُه.
    if (original.docType === 'PREPAYMENT') throw new ConflictException(MSG.prepayment_note_unsupported);
    // المصدرُ الواحد مع إشعار المورّد (`ق-١٠٠٨`/١ — ①). ⚖️ ولا إشعارَ على مردودة (`ق-٩٥٨`): ليست فاتورةً
    // صحيحة، ومخرجُها بدلٌ — ثم يُصحَّح البدلُ إن لزم.
    assertAdjustableTarget(
      { docType: original.docType, closed: original.zatcaStatus === 'REJECTED' },
      noteKind === 'CREDIT_NOTE' ? 'credit' : 'debit',
      INVOICE_NOTE_KINDS,
      { invalid: MSG.credit_note_target_invalid, closed: MSG.credit_note_target_rejected },
    );
    assertBranchAllowed(allowedBranchIds, original.branchId);
    return original;
  }

  /** Shared tail of both note kinds: the row, its lines, and its own posted
   * entry. Everything that differs between 381 and 383 arrives decided. */
  private async createAdjustmentNote(
    tx: Prisma.TransactionClient,
    companyId: string,
    original: { id: string; branchId: string | null; customerId: string; currency: string; exchangeRate: Prisma.Decimal },
    note: {
      docType: 'CREDIT_NOTE' | 'DEBIT_NOTE';
      numberKind: 'CN' | 'DN';
      reason: string;
      issueDate?: string;
      /** يوم قبول الإعادة — تُحسب منه المهلة النظامية. راجع `note-deadline.util.ts`. */
      eventDate?: string;
      lines: PricedInvoiceLine[];
      totals: { subtotal: number; taxTotal: number; total: number };
      status: 'PAID' | 'DUE';
      post: typeof postCreditNoteEntry;
    },
  ) {
    // Same currency at the SAME rate as the original: the note adjusts that
    // document, so repricing at today's rate would make the pair
    // irreconcilable in base currency.
    const rate = Number(original.exchangeRate);
    // التاريخ يسبق الرقم — فالبادئة تُشتقّ منه.
    const issueDate = note.issueDate ? new Date(note.issueDate) : new Date();
    const { subtotal, taxTotal, total } = note.totals;
    // ⚖️ (`ق-١٤٩٠`) الإشعارُ مستندٌ ضريبيّ يصل الهيئةَ برقمه — فما يُرفض بعد الترقيم يُفحص قبله: الإرجاعُ فوق المبيع
    // تراكمياً، وحساباتُ قيده وقيدِ عكس تكلفته، والفترةُ. والرفوضُ بعده باقيةٌ طبقةً ثانية.
    await assertAdjustmentNoteIssuable(tx, companyId, {
      docType: note.docType,
      issueDate,
      lines: note.lines,
      base: { baseTotal: toBaseAmount(total, rate), baseTaxTotal: toBaseAmount(taxTotal, rate) },
    });
    const no = await this.nextDocumentNumber(tx, companyId, note.numberKind, issueDate);

    const unitCodes = await unitCodesFor(tx, note.lines);
    const created = await tx.invoice.create({
      data: {
        companyId,
        no,
        docType: note.docType,
        relatedInvoiceId: original.id,
        adjustmentReason: note.reason,
        // فارغٌ ⇒ الواقعة يوم الإصدار. ولا يُملأ رجعياً لما سبق (`ق-٥٣`).
        adjustmentEventDate: note.eventDate ? new Date(note.eventDate) : issueDate,
        branchId: original.branchId,
        customerId: original.customerId,
        issueDate,
        dueDate: issueDate,
        status: note.status,
        subtotal,
        taxTotal,
        total,
        currency: original.currency,
        exchangeRate: rate,
        baseSubtotal: toBaseAmount(subtotal, rate),
        baseTaxTotal: toBaseAmount(taxTotal, rate),
        baseTotal: toBaseAmount(total, rate),
        lines: {
          create: numberLines(
            note.lines.map((l) => ({
              companyId,
              description: l.description,
              productId: l.productId ?? null,
              unitCode: unitCodeOf(unitCodes, l.productId),
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              discount: l.discount ?? 0,
              ...taxColumns(l),
              // رابطُ المرتجع وحالته على سطر الإشعار الدائن وحده (`SPEC 30.2` · `30.4`).
              returnsLineId: note.docType === 'CREDIT_NOTE' ? (l.returnsLineId ?? null) : null,
              returnCondition: note.docType === 'CREDIT_NOTE' ? (l.returnCondition ?? null) : null,
            })),
          ),
        },
      } as unknown as Prisma.InvoiceUncheckedCreateInput,
      include: INVOICE_INCLUDE,
    });

    /**
     * ⭐ **المرتجع السليم يعود إلى الرفّ وتُعكس تكلفته** (`SPEC 30.4`، موجة أ 2026-09-03) — من
     * المالك الواحد نفسه لكتابتَي الحركة والتكلفة (`sale-fulfilment.util`)، لا من مسارٍ ثانٍ.
     * قيدُ عكس التكلفة مستقلٌّ عن قيد الإشعار (الذي يعكس الإيراد والضريبة والذمّة) — كما أن قيد
     * التكلفة مستقلٌّ عن قيد الفاتورة. وما لم يعد إلى الرفّ يُعلَن في `restocking.skipped` بسببه.
     */
    /**
     * ⚠️ **تنبيهُ التأخّر يُرفع ولا يمنع** (قرار المالك 2026-09-04، `م٥٤`).
     *
     * المستند يوجبه النظام، فردُّه بعد انقضاء المهلة **يزيد المخالفة لا يمنعها** —
     * والتاجر المتأخّر ما زال ملزَماً بإصداره. فيصدر، ويُسجَّل التأخّر ليُرى.
     * والمفتاح يحمل رقم المستند، فتكرارُ الحفظ لا يكرّر الجرس.
     */
    /**
     * 🔴 **حدثُ الإصدار للإشعار كما للفاتورة** (`ق-١٠٠٧` — وكان الإشعارُ يبلغ الهيئةَ بالإرسال اليدويّ
     * وحدَه): إشعارٌ دائنٌ أو مدينٌ صادرٌ مستندٌ خاضعٌ للفوترة بنصّها، فحدثُه يُكتب **داخل المعاملة
     * نفسها** (`ق-٤٩`) — إن تعذّرت كتابتُه أُلغي الإشعار، ولا يبقى إشعارٌ لا يعلم به الطابور.
     */
    await events.emitCompliance(tx, {
      type: INVOICE_ISSUED,
      companyId,
      payload: { invoiceId: created.id, docType: created.docType, no: created.no } satisfies InvoiceIssuedPayload,
    });

    const deadline = deadlineView(created.adjustmentEventDate ?? created.issueDate, created.issueDate);
    if (deadline.status === 'LATE') {
      await NotificationsService.raise(tx, companyId, {
        kind: 'NOTE_ISSUED_LATE',
        dedupeKey: `note-late:${created.id}`,
        title: `إشعارٌ صدر بعد مهلته — ${created.no}`,
        body:
          `واقعتُه ${created.adjustmentEventDate?.toISOString().slice(0, 10) ?? '—'} ومهلتُه ` +
          `${deadline.deadline.toISOString().slice(0, 10)}، وصدر بعدها بـ${Math.abs(deadline.daysLeft)} يوماً. ` +
          `والمهلة النظامية ١٥ يوماً من نهاية شهر الواقعة.`,
        linkScreen: 'invoice',
        linkId: created.id,
      });
    }

    let restocking: ReturnResult | null = null;
    if (note.docType === 'CREDIT_NOTE') {
      try {
        restocking = await returnStockedLines(tx, {
          companyId,
          branchId: created.branchId,
          date: created.issueDate,
          documentNo: created.no,
          lines: created.lines,
        });
      } catch (e) {
        // طبقةٌ ثانية (`ق-١٤٩٠`): فُحص قبل الترقيم، ولا يبلغ هنا إلا مرتجعٌ متزامنٌ سبقه إلى الالتزام — بالرسالة نفسِها.
        if (e instanceof ReturnExceedsSoldError) throw returnExceedsSoldRefusal(e);
        throw e;
      }
      // ⚖️ ق-١٣٦٤ «والوحدةُ تعود بالتكلفة التي خرجت بها، وما رُفع عليها بعد خروجها يُعاد من تكلفة المبيعات إلى المخزون» —
      // الثاني بالعملة الأساسية أصلاً (من الطبقة) فلا يُحوَّل.
      const restockedBase = round2(toBaseAmount(restocking.totalCost, rate) + restocking.raisedAfterExit);
      if (restockedBase > 0) {
        await postCogsReversalEntry(tx, companyId, {
          branchId: created.branchId,
          no: created.no,
          date: created.issueDate,
          baseCost: restockedBase,
        });
      }
    }

    const entry = await note.post(tx, companyId, {
      customerId: created.customerId,
      branchId: created.branchId,
      no: created.no,
      issueDate: created.issueDate,
      customerName: created.customer.name,
      baseSubtotal: Number(created.baseSubtotal),
      baseTaxTotal: Number(created.baseTaxTotal),
      baseTotal: Number(created.baseTotal),
    });
    if (!entry) return created;
    return tx.invoice.update({ where: { id: created.id }, data: { journalEntryId: entry.id }, include: INVOICE_INCLUDE });
  }

  /** `INV-<year>-<seq>` for invoices, `CN-`/`DN-` for credit/debit notes,
   * matching the original mockup's numbering. Based on the highest existing
   * sequence for the year, not `count()` — a count-based scheme collides with
   * an already-issued number as soon as any row has ever been deleted
   * (count() drops but the old high number is still taken). Two concurrent
   * creates can still compute the same next number; `@@unique([companyId,
   * no])` turns that into a P2002 instead of a silent duplicate, and the
   * callers retry the whole transaction on that error (see
   * retryOnUniqueConflict). */
  /**
   * ④A1 — **مستندُ الدفعة المقدَّمة (386) من فائض سند القبض** (`ق-١٢٦١` ب).
   *
   * مقبوضٌ قبل التوريد يوجب مستنداً ضريبياً يومَه (م٥٣(١)(أ)(٢) للكاملة · م٥٣(٧)(أ)(٢) للمبسّطة). سطرٌ خدميّ واحد
   * «دفعةٌ مقدَّمة» بالصافي، وضريبتُه من دالّة المجاميع الواحدة — **والصافي يُختار بحيث يساوي إجماليُّ المستند
   * المقبوضَ** (`gross/1.15` مدوَّراً ثم مجاورُه إن اختلّت هللةُ التدوير)؛ فإن تعذّر على هللةٍ (BR-CO-17 يوجب
   * الضريبةَ = الوعاء × النسبة مدوَّراً) بقيت الهللةُ على حساب العميل **وتُعلَن** في الردّ (`onAccountRemainder`).
   * النوعُ (كاملة/مبسّطة) من صفة المشتري كسائر المستندات؛ **والفئةُ فئةُ ما يُدفع مقدَّماً عنه، تُعلَن على السند ولا
   * تُفترض** (`ق-١٢٦٤`/②): إيجارٌ سكنيٌّ معفى (`E` · م٣٠) دفعتُه بلا ضريبة، والمعفى/الصفريّ صافيُه المقبوضُ بعينه.
   * يُرحَّل التزاماً (`2450`) لا إيراداً — وسطرُ `2200` حين تكون ضريبة — ويدخل السلسلةَ بحدث الإصدار نفسِه.
   */
  async issuePrepaymentWithinTx(
    tx: Prisma.TransactionClient,
    companyId: string,
    p: { customerId: string; customerName: string; paymentId: string; paymentNo: string; branchId: string | null; date: Date; grossAmount: number; currency: string; exchangeRate: number; tax: LineTax },
  ): Promise<{ id: string; no: string; total: number; onAccountRemainder: number }> {
    // النسبةُ من الفئة المعلَنة (المعفى والصفريُّ وخارجُ النطاق صفر) — لا من ثابت.
    const rate = p.tax.taxRate;
    // الصافي يُختار بحيث يساوي إجماليُّ المستند المقبوضَ — بالدالّة الواحدة التي فحص بها المستدعي قبل ترقيم سنده
    // (`ق-١٤٩٠` · `assertPrepaymentIssuable`)؛ ورفضُها هنا طبقةٌ ثانية لمستدعٍ لم يفحص.
    const { gross, net: chosen } = prepaymentDocumentAmounts(p.grossAmount, rate);
    const lines = await priceLines(
      tx,
      [
        {
          description: `دفعة مقدَّمة — سند القبض ${p.paymentNo}`,
          quantity: 1,
          unitPrice: chosen,
          taxRate: rate,
          taxCategory: p.tax.taxCategory as 'S' | 'Z' | 'E' | 'O',
          taxExemptionReasonCode: p.tax.taxExemptionReasonCode ?? undefined,
          taxExemptionReason: p.tax.taxExemptionReason ?? undefined,
        },
      ],
      { trusted: true },
    );
    const { subtotal, taxTotal, total } = computeTotals(lines);
    const onAccountRemainder = round2(gross - total);
    const no = await this.nextDocumentNumber(tx, companyId, 'PP', p.date);
    const created = await tx.invoice.create({
      data: {
        companyId,
        no,
        docType: 'PREPAYMENT',
        prepaymentPaymentId: p.paymentId,
        branchId: p.branchId,
        customerId: p.customerId,
        issueDate: p.date,
        dueDate: p.date,
        // مسدَّدةٌ بالبناء — سندُ قبضها هو ما أصدرها.
        status: 'PAID',
        subtotal,
        taxTotal,
        total,
        currency: p.currency,
        exchangeRate: p.exchangeRate,
        baseSubtotal: toBaseAmount(subtotal, p.exchangeRate),
        baseTaxTotal: toBaseAmount(taxTotal, p.exchangeRate),
        baseTotal: toBaseAmount(total, p.exchangeRate),
        lines: { create: numberLines(lines.map((l) => ({ companyId, description: l.description, productId: null, unitCode: null, quantity: l.quantity, unitPrice: l.unitPrice, discount: 0, ...taxColumns(l) }))) },
      } as unknown as Prisma.InvoiceUncheckedCreateInput,
      include: INVOICE_INCLUDE,
    });
    const entry = await postPrepaymentInvoiceEntry(tx, companyId, {
      customerId: created.customerId,
      branchId: created.branchId,
      no: created.no,
      issueDate: created.issueDate,
      customerName: created.customer.name,
      baseSubtotal: Number(created.baseSubtotal),
      baseTaxTotal: Number(created.baseTaxTotal),
      baseTotal: Number(created.baseTotal),
      prepaymentsAccountId: await getOrCreateCustomerPrepaymentsAccount(tx, companyId),
    });
    if (entry) await tx.invoice.update({ where: { id: created.id }, data: { journalEntryId: entry.id } });
    // السندُ يُخصَّص على مستنده بإجماليه — فالمستندُ مسدَّدٌ بالبناء من المصدر الواحد (التخصيصات)، والفائضُ (هللةُ
    // التدوير إن وُجدت) يبقى على الحساب معلَناً؛ وعند التطبيق ينتقل هذا التخصيصُ بعينه إلى فاتورة التوريد.
    await tx.paymentAllocation.create({ data: { companyId, paymentId: p.paymentId, invoiceId: created.id, amount: total } as unknown as Prisma.PaymentAllocationUncheckedCreateInput });
    // مستندٌ ضريبيّ كسائرها: حدثُ الإصدار داخل المعاملة — إن تعذّر أُلغي المستندُ وسندُه معه (`ق-٤٩`).
    await events.emitCompliance(tx, {
      type: INVOICE_ISSUED,
      companyId,
      payload: { invoiceId: created.id, docType: created.docType, no: created.no } satisfies InvoiceIssuedPayload,
    });
    return { id: created.id, no: created.no, total, onAccountRemainder };
  }

  /**
   * ④A1 — مستنداتُ الدفعة المقدَّمة غيرُ المطبَّقة لعميل: ما يُعرض للتطبيق عند إصدار فاتورة التوريد — الشاشةُ تقرأ ولا تحسب.
   *
   * **على مستوى المنشأة بحقّها**: الدفعةُ المقدَّمة التزامٌ للعميل على المنشأة لا على فرع — مستندٌ صدر من سند قبضٍ في فرعٍ
   * يُطبَّق على توريدٍ يُفوتَر من فرعٍ آخر، وحجبُه يترك التزاماً لا يُقفل أبداً.
   *
   * ⚖️ **وحُكم فيه** (توجيه ٢٧٥ · `ق-١٥٨١`): «القوائمُ تُرشَّح بفروع القارئ». فدفعةُ فرعٍ آخر يطبّقها من يراها (المالكُ ومن يرى
   * الفروعَ كلَّها)، والمقيَّدُ يطبّق دفعاتِ فرعه وما بلا فرع — وتطبيقُه بالمعرّف على غيرها يُردّ كالغائب (`create`).
   */
  openPrepayments(companyId: string, allowedBranchIds: string[] | 'all', customerId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const docs = await tx.invoice.findMany({
        where: { customerId, docType: 'PREPAYMENT', appliedAsPrepayment: { none: {} }, ...branchFilter(allowedBranchIds) },
        select: { id: true, no: true, issueDate: true, subtotal: true, taxTotal: true, total: true, currency: true, prepaymentPayment: { select: { no: true } } },
        orderBy: [{ issueDate: 'asc' }, { id: 'asc' }],
      });
      // ② مالٌ نصّاً بخانتين على الحدّ (`ق-١٢٣٥`).
      return docs.map((d) => ({ id: d.id, no: d.no, issueDate: d.issueDate, currency: d.currency, receiptNo: d.prepaymentPayment?.no ?? null, subtotal: money(d.subtotal), taxTotal: money(d.taxTotal), total: money(d.total) }));
    });
  }

  /**
   * ④A1 — **تطبيقُ دفعاتٍ مقدَّمة على فاتورة التوريد**: كلُّ مستند 386 مسمّىً يُطبَّق كاملاً (لا تجزئة — حدٌّ معلَن)
   * على هذه الفاتورة وحدَها: **تخصيصٌ** من سند قبضه إليها (فالحالةُ والأعمارُ والمتبقّي من المصدر الواحد — التخصيصات)،
   * **وقيدٌ** يُقفل الالتزامَ ويعكس ضريبتَه، **وصفُّ ربطٍ** يحمله المستندُ إلى الهيئة (BT-113 · KSA-26…34).
   * يُرفض ما ليس دفعةً مقدَّمة، أو لعميلٍ آخر، أو طُبّق من قبل، أو ما يفوق مجموعُه إجماليَّ الفاتورة — **وذلك كلُّه قبل
   * الترقيم** (`ق-١٤٩٠` · `readApplicablePrepayments`)، فتصل المستنداتُ هنا مفحوصةً؛ ويبقى عدُّ التخصيص المنقول طبقةَ
   * السباق: مستندٌ طبّقته معاملةٌ متزامنة بين الفحص وهنا يُرفض باسمه.
   *
   * **على مستوى المنشأة بحقّها**: مستنداتُ 386 تُقرأ بمعرّفاتها المسمّاة في الطلب، ومستندُ العميل الصادرُ من سند قبضٍ
   * في فرعٍ آخر يُطبَّق على توريده هنا — فالدفعةُ المقدَّمة التزامٌ للعميل على المنشأة لا على فرع.
   */
  private async applyPrepayments(
    tx: Prisma.TransactionClient,
    companyId: string,
    invoice: { id: string; no: string; customerId: string; branchId: string | null; issueDate: Date; total: Prisma.Decimal; customer: { name: string } },
    docs: readonly ApplicablePrepayment[],
  ) {
    const prepaymentsAccountId = await getOrCreateCustomerPrepaymentsAccount(tx, companyId);
    for (const doc of docs) {
      // `readApplicablePrepayments` لا يُعيد مستنداً بلا سند قبضه — والفحصُ هنا يُضيّق النوعَ لا يرفض.
      if (!doc.prepaymentPayment) throw new NotFoundException(MSG.prepayment_not_found);
      await tx.invoicePrepayment.create({
        data: { companyId, invoiceId: invoice.id, prepaymentInvoiceId: doc.id, net: doc.subtotal, vat: doc.taxTotal, gross: doc.total } as unknown as Prisma.InvoicePrepaymentUncheckedCreateInput,
      });
      // تخصيصُ سند القبض ينتقل من مستند 386 إلى فاتورة التوريد — بمبلغه لا بتخصيصٍ ثانٍ (فمجموعُ تخصيصات السند لا يفوق مبلغَه).
      const moved = await tx.paymentAllocation.updateMany({ where: { paymentId: doc.prepaymentPayment.id, invoiceId: doc.id }, data: { invoiceId: invoice.id } });
      if (moved.count !== 1) throw new ConflictException(formatMessage(MSG.prepayment_already_applied, { no: doc.no }));
      await postPrepaymentApplicationEntry(tx, companyId, {
        customerId: invoice.customerId,
        branchId: invoice.branchId,
        invoiceNo: invoice.no,
        prepaymentNo: doc.no,
        date: invoice.issueDate,
        customerName: invoice.customer.name,
        net: Number(doc.baseSubtotal),
        vat: Number(doc.baseTaxTotal),
        gross: Number(doc.baseTotal),
        prepaymentsAccountId,
      });
    }
    await this.syncSettlementStatus(tx, invoice.id, new Date());
  }

  private async nextDocumentNumber(
    tx: Prisma.TransactionClient,
    companyId: string,
    kind: 'INV' | 'CN' | 'DN' | 'PP',
    issueDate: Date,
  ): Promise<string> {
    // عدّادٌ ذرّيّ لا مسحُ سنة (ق-٣٢٨) — والبذرُ من أعلى قائمٍ مرّةً واحدة.
    return nextDocumentNumber(tx, companyId, issueDate, { kind, pad: 4 }, (prefix) => highestSequenceOf(tx.invoice, prefix));
  }

  /**
   * الوسوم الخمسة لمستندٍ واحد — لإيصال الكاشير (`ق-١٨٦`): **البنّاءُ نفسه وساعةُ
   * الحائط نفسها** التي تُصدَر بها قائمة الفواتير، فلا يفترق رمزُ الإيصال عن رمز
   * القائمة يوماً أو حرفاً. مشتقٌّ لا مخزَّن، للسبب المشروح في `list()`.
   */
  async zatcaQrFor(
    companyId: string,
    inv: { issueDate: Date; issuedAt: Date | null; issuedOffsetMin: number | null; total: Prisma.Decimal | number; taxTotal: Prisma.Decimal | number; zatcaQrPayload?: string | null },
    /** معاملةُ المستدعي حين يكون داخل واحدة — فلا تُفتح ثانيةٌ فوقها. */
    tx?: Prisma.TransactionClient,
  ): Promise<string | null> {
    // مستندٌ مختوم: رمزُه التساعي المحفوظ لحظةَ الختم — لا يُبنى ثانيةً (`ق-١٨٧`).
    if (inv.zatcaQrPayload) return inv.zatcaQrPayload;

    /**
     * ⚠️ **معاملةُ المستدعي تُستعمل إن وُجدت — ولا تُفتح ثانيةٌ داخلها**
     * (`ق-٣٦٠`).
     *
     * **العطلُ المقيس**: `PosService.ring` يفتح معاملةً، ثم يُنادي هذه من
     * داخلها، **فكانت تفتح معاملةً ثانية**. ⇒ **كلُّ بيعةٍ طائرة تمسك اتصالاً
     * وتطلب ثانياً** — وثلاثُ بيعاتٍ متزامنة تطلب ستةً وتمسك ثلاثة. **فإن كان
     * مجموعُ الاتصالات دونها وقع تجويعٌ تامّ**: كلٌّ ينتظر ما لن يُفرَج عنه،
     * حتى تنتهي مهلةُ بدء المعاملة ويعود `500`.
     *
     * **ولا يظهر على جهازٍ بأنويةٍ كثيرة** (المجموع يُشتقّ من عددها) — **ظهر
     * على عتاد السير وحده**، وأصاب **ثلاث بيعاتٍ متزامنة: الحالةَ العادية في
     * متجرٍ نشط لا النادرة**.
     */
    const readCompany = (tx: Prisma.TransactionClient) =>
      tx.company.findUnique({ where: { id: companyId }, select: { legalName: true, vatNumber: true } });
    const company = tx ? await readCompany(tx) : await this.tenantPrisma.runInTenantContext(companyId, readCompany);
    try {
      return buildZatcaQr({
        sellerName: company?.legalName ?? '',
        vatNumber: company?.vatNumber ?? '',
        issued: issuedWallClock(inv),
        total: Number(inv.total),
        vatAmount: Number(inv.taxTotal),
      });
    } catch (e) {
      // رفضٌ مسمّى لمن يُصدر المستند — لا رمزٌ فاسدٌ يُطبع ولا `500` بلا اسم (`ق-٧٣٥`).
      if (e instanceof ZatcaQrValueTooLongError) throw new ConflictException(formatMessage(MSG.zatca_qr_value_too_long, { tag: e.tag, bytes: e.bytes }));
      throw e;
    }
  }
}
