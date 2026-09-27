import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Quote, QuoteStatus } from '@prisma/client';
import { branchFilter, resolveBranchId } from '../branches/branch-scope.util';
import { resolveCurrencyWithin, toBaseAmount } from '../common/currency/base-amount.util';
import { computeDocumentTotals, type MoneyLine } from '../common/money/totals';
import { resolveLineTaxes, type LineTax } from '../common/vat/line-tax.util';
import { highestSequenceOf, nextDocumentNumber } from '../common/document-sequence.util';
import { retryOnUniqueConflict } from '../common/retry-on-conflict.util';
import { type CreditContext } from '../invoices/credit-context';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { formatMessage, MSG } from '../common/i18n/messages';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { mapList, pagedFindMany, searchTerm } from '../common/pagination/paged.util';
import { unitCodeOf, unitCodesFor } from '../common/units/product-unit-codes.util';
import { InvoicesService } from '../invoices/invoices.service';
import { CreateInvoiceDto } from '../invoices/dto/create-invoice.dto';
import { CreateQuoteDto, QuoteLineDto, UpdateQuoteDto } from './dto/quote.dto';
import { isQuoteExpired } from './quote-expiry.util';
import { LINE_ORDER, numberLines } from '../common/document-lines.util';

/** السطورُ بترتيبها المعلَن (`ق-١٤١٢`) — والعرضُ مصدرُ ترتيب فاتورته المحوَّلة. */
const QUOTE_INCLUDE = { customer: true, lines: LINE_ORDER } as const;

/** نفس رياضيات الفاتورة حرفياً — **الدالة نفسها** (`common/money/totals.ts`) لا نسخةٌ منها،
 * فما يراه العميل في العرض هو ما سيُفوتَر هللةً بهللة. (كانت هنا نسخةٌ **غير مدوَّرة**
 * تختلف عن الفاتورة عند التحويل — كنسة التدوير 2026-09-03.) */
function computeTotals(lines: readonly MoneyLine[]) {
  const { subtotal, taxTotal, total } = computeDocumentTotals(lines);
  return { subtotal, taxTotal, total };
}

/** ⑧ بندُ عرضٍ حُلّت ضريبتُه — من صنفه لحظةَ الكتابة أو من إعلانه؛ والنسبةُ مشتقّة (كما في الفاتورة). */
type PricedQuoteLine = Omit<QuoteLineDto, 'taxRate' | 'taxCategory' | 'taxExemptionReasonCode' | 'taxExemptionReason'> & LineTax;

async function priceQuoteLines(tx: Prisma.TransactionClient, lines: readonly QuoteLineDto[]): Promise<PricedQuoteLine[]> {
  const taxes = await resolveLineTaxes(tx, lines);
  return lines.map((l, i) => ({ ...l, ...taxes[i] }));
}

function quoteLineRow(companyId: string, unitCodes: ReadonlyMap<string, string | null>, l: PricedQuoteLine) {
  return {
    companyId,
    description: l.description,
    productId: l.productId ?? null,
    unitCode: unitCodeOf(unitCodes, l.productId),
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    discount: l.discount ?? 0,
    taxRate: l.taxRate,
    taxCategory: l.taxCategory,
    taxExemptionReasonCode: l.taxExemptionReasonCode,
    taxExemptionReason: l.taxExemptionReason,
  };
}

/**
 * آخرُ يومِ الصلاحية مشمول: العرض يموت بعد نهاية يومه لا في صبيحته — **ويومُه يُقاس بيومٍ معلَن لا بتوقيت
 * العملية** (`quote-expiry.util.ts` · `ق-١١٨٣`): كان هنا `setHours(23, 59, 59, 999)` بمنطقة الخادم، فانقضى
 * العرضُ على خادم الرياض قبل نهاية يومه المعلَن بثلاث ساعات.
 */
function isExpired(quote: Pick<Quote, 'validUntil' | 'status'>, now = new Date()): boolean {
  return isQuoteExpired(quote, now);
}

/** الحالة المعروضة: EXPIRED مشتقة قراءةً (نمط الحجوزات) — لا cron يلزم. */
export type DerivedQuoteStatus = QuoteStatus | 'EXPIRED';

function deriveStatus(quote: Pick<Quote, 'validUntil' | 'status'>): DerivedQuoteStatus {
  return isExpired(quote) ? 'EXPIRED' : quote.status;
}

/**
 * عروض الأسعار (4.9) — وثيقة تفاوض: لا ترحيل ولا ضريبة حتى تصير فاتورة.
 *
 * التحويل هو جوهر الوحدة، وقاعدتاه الصلبتان:
 * 1. **لا مسار فوترة موازٍ:** التحويل يستدعي InvoicesService.createWithinTx —
 *    فيرث الترقيم والضريبة والقيد وحد الائتمان (حين يُفعَّل) تلقائياً وللأبد.
 * 2. **ذرّية 6.12:** فحص الحالة + إنشاء الفاتورة + ختم العرض في معاملةٍ واحدة،
 *    وقيدُ تفرّد يمنع فاتورتين لعرض — الخاسر في السباق يقرأ الفائز ويعيد 409
 *    مسمّىً، لا 500 ولا فاتورة مكررة.
 */
@Injectable()
export class QuotesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly invoicesService: InvoicesService,
  ) {}

  /**
   * ⚠️ **الكتابةُ أُغلقت والقراءةُ بقيت مفتوحة** (`ق-٥١٢`/`ق-٥١٣`): `create`
   * صار يمرّ بـ`resolveBranchId`، و`list` ظلّ يقرأ **كلَّ فروع المنشأة** —
   * فموظّفُ فرعٍ يرى عروضَ الفروع الأخرى وأسعارَها.
   *
   * ⇒ **والمنعُ بلا إخفاء ليس عزلاً**: من يُمنع من الكتابة في فرعٍ ويقرأ بياناته
   * يملك ما يبيعه المنتجُ حجبَه.
   */
  async list(companyId: string, allowedBranchIds: string[] | 'all', query?: PagedQueryDto) {
    const term = searchTerm(query);
    // البحثُ في رقم العرض وملاحظاته واسم عميله — العلاقةُ شرطُ Prisma لا ترشيحٌ في الذاكرة.
    const where: Prisma.QuoteWhereInput = {
      ...branchFilter(allowedBranchIds),
      ...(term ? { OR: [{ no: { contains: term, mode: 'insensitive' } }, { notes: { contains: term, mode: 'insensitive' } }, { customer: { name: { contains: term, mode: 'insensitive' } } }] } : {}),
    };
    const result = await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      pagedFindMany(query, tx.quote, { where, include: QUOTE_INCLUDE, orderBy: { createdAt: 'desc' } }),
    );
    return mapList(result, (q) => ({ ...q, derivedStatus: deriveStatus(q) }));
  }

  async findOne(companyId: string, allowedBranchIds: string[] | 'all', id: string) {
    // عرضُ فرعٍ خارج فروع الفاعل غيرُ موجودٍ له — 404 كالقائمة لا 403، فلا يُسرَّب وجودُه (`ق-١٤٤٠`).
    const quote = await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.quote.findFirst({ where: { id, ...branchFilter(allowedBranchIds) }, include: { ...QUOTE_INCLUDE, convertedInvoice: { select: { id: true, no: true } } } }),
    );
    if (!quote) throw new NotFoundException(MSG.quote_not_found);
    return { ...quote, derivedStatus: deriveStatus(quote) };
  }

  /**
   * 🔴 **`allowedBranchIds` لازمٌ لا اختياريّ** (`ق-٥١٢`).
   *
   * **كان الفرعُ يُكتب من الطلب كما وصل** — **فموظّفٌ مقصورٌ على فرعٍ يُنشئ
   * عرضاً على فرعٍ آخر**. **ولا يُكشَف بالاستعمال**: العرضُ يبدو سليماً، ثم
   * **يتحوّل فاتورةً تحمل الفرعَ نفسَه** فيدخل الدفترَ في غير موضعه.
   *
   * ⇒ **والمصدرُ الواحد `resolveBranchId`** — وجودٌ ثم إذن.
   */
  create(companyId: string, allowedBranchIds: string[] | 'all', dto: CreateQuoteDto) {
    // نفس عقد الترقيم المتسابق للفواتير: قيد (companyId, no) الفريد يحسم،
    // وretry يعيد العدّ — اختبار التصادم المتزامن ضمن الدفعة يثبته.
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        // بلا عملةٍ صريحة ⟵ عملةُ أساس المنشأة لا الريال (`ق-١٣٦٨`).
        const { currency, exchangeRate } = await resolveCurrencyWithin(tx, companyId, dto);
        const customer = await tx.customer.findUnique({ where: { id: dto.customerId }, select: { id: true } });
        if (!customer) throw new NotFoundException(MSG.customer_not_found);

        // ⑧ الفئةُ والنسبةُ تُحلّان قبل الحساب — من الصنف لحظةَ الكتابة أو من إعلان البند.
        const lines = await priceQuoteLines(tx, dto.lines);
        const { subtotal, taxTotal, total } = computeTotals(lines);
        const branchId = await resolveBranchId(tx, dto.branchId, allowedBranchIds);

        const no = await this.nextQuoteNumber(tx, companyId, new Date(dto.issueDate));
        // ① وحدةُ كلِّ سطرٍ تُنسخ من صنفه لحظةَ الكتابة — لا تُخمَّن لصنفٍ لم يُعلنها.
        const unitCodes = await unitCodesFor(tx, dto.lines);
        return tx.quote.create({
          data: {
            companyId,
            no,
            customerId: dto.customerId,
            branchId,
            issueDate: new Date(dto.issueDate),
            validUntil: new Date(dto.validUntil),
            notes: dto.notes,
            subtotal,
            taxTotal,
            total,
            currency,
            exchangeRate,
            baseSubtotal: toBaseAmount(subtotal, exchangeRate),
            baseTaxTotal: toBaseAmount(taxTotal, exchangeRate),
            baseTotal: toBaseAmount(total, exchangeRate),
            // companyId على كل بند صراحةً — الكتابة المتداخلة لا يراها امتداد
            // العزل (نفس تعليل InvoicesService)، وRLS يسند خلفها.
            lines: { create: numberLines(lines.map((l) => quoteLineRow(companyId, unitCodes, l))) },
          } as unknown as Prisma.QuoteUncheckedCreateInput,
          include: QUOTE_INCLUDE,
        });
      }),
    );
  }

  update(companyId: string, allowedBranchIds: string[] | 'all', id: string, dto: UpdateQuoteDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // الفرعُ أوّلاً (`ق-١٤٤٠`): عرضُ فرعٍ آخر 404 لا 409 المحوَّلِ الذي يسمّي فاتورتَه — فهو غيرُ موجودٍ له.
      const existing = await tx.quote.findFirst({ where: { id, ...branchFilter(allowedBranchIds) } });
      if (!existing) throw new NotFoundException(MSG.quote_not_found);
      if (existing.status === 'CONVERTED') {
        throw new ConflictException(formatMessage(MSG.quote_converted_immutable, { invoiceNo: await this.convertedInvoiceNo(tx, existing) }));
      }

      const priced = dto.lines ? await priceQuoteLines(tx, dto.lines) : null;
      const totals = priced ? computeTotals(priced) : null;
      const unitCodes = dto.lines ? await unitCodesFor(tx, dto.lines) : new Map<string, string | null>();
      const updated = await tx.quote.update({
        where: { id },
        data: {
          ...(dto.customerId ? { customerId: dto.customerId } : {}),
          ...(dto.issueDate ? { issueDate: new Date(dto.issueDate) } : {}),
          ...(dto.validUntil ? { validUntil: new Date(dto.validUntil) } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          ...(dto.status ? { status: dto.status } : {}),
          ...(totals
            ? {
                subtotal: totals.subtotal,
                taxTotal: totals.taxTotal,
                total: totals.total,
                baseSubtotal: toBaseAmount(totals.subtotal, Number(existing.exchangeRate)),
                baseTaxTotal: toBaseAmount(totals.taxTotal, Number(existing.exchangeRate)),
                baseTotal: toBaseAmount(totals.total, Number(existing.exchangeRate)),
                lines: {
                  deleteMany: {},
                  create: numberLines(priced!.map((l) => quoteLineRow(companyId, unitCodes, l))),
                },
              }
            : {}),
        } as unknown as Prisma.QuoteUncheckedUpdateInput,
        include: QUOTE_INCLUDE,
      });
      return { ...updated, derivedStatus: deriveStatus(updated) };
    });
  }

  /** حماية الحذف تمتد (قاعدة الموجز 6): المحوَّل لا يُحذف — فاتورته قائمة. */
  async remove(companyId: string, allowedBranchIds: string[] | 'all', id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // الفرعُ أوّلاً (`ق-١٤٤٠`): عرضُ فرعٍ آخر 404 لا حذفٌ ولا 409 يسمّي فاتورتَه — فهو غيرُ موجودٍ له.
      const existing = await tx.quote.findFirst({ where: { id, ...branchFilter(allowedBranchIds) } });
      if (!existing) throw new NotFoundException(MSG.quote_not_found);
      if (existing.status === 'CONVERTED') {
        throw new ConflictException(formatMessage(MSG.quote_converted_undeletable, { invoiceNo: await this.convertedInvoiceNo(tx, existing) }));
      }
      await tx.quote.delete({ where: { id } });
    });
  }

  /**
   * التحويل بنقرة — قلب 4.9.
   *
   * كلّه معاملة واحدة (قاعدة الموجز 4): الفحوص، فالفاتورة عبر نقطة الدخول
   * المشتركة (فيسري الترحيل والضريبة والترقيم تلقائياً — قاعدة 11)، فختم
   * العرض بشرطِ ما-زال-قابلاً — الخاسر في سباق النقرتين ينتظر على قفل صفّ العرض
   * ثم يعيد 409 باسم فاتورة الفائز **قبل أن يُرقَّم** (قرار 6.12 · `ق-١٤٩٠`)؛
   * والختمُ المشروطُ طبقةٌ ثانية تُرجع المعاملةَ كلَّها إن فات القفلَ مسارٌ.
   */
  convert(companyId: string, allowedBranchIds: string[] | 'all', id: string, credit: CreditContext) {
    return retryOnUniqueConflict(async () => {
      try {
        return await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
          // والفرعُ أوّلاً (`ق-١٤٤٠`): عرضُ فرعٍ آخر 404 لا 403 الفرعِ ولا 409 المحوَّلِ/المنقضي التي تكشف رقمَ فاتورته وتاريخَه.
          const visible = await tx.quote.findFirst({ where: { id, ...branchFilter(allowedBranchIds) }, select: { id: true } });
          if (!visible) throw new NotFoundException(MSG.quote_not_found);

          /**
           * ⚖️ **صفُّ العرض يُقفل قبل فحص حاله، وحالُه تُقرأ بعد القفل** (`ق-١٤٩٠` · INV-⑤).
           *
           * كانت القراءةُ بلا قفل: نقرتان متزامنتان تقرآن «مسوّدة» معاً، فتُرقَّم فاتورتان على منفذ العدّاد المستقلّ
           * (والرقمُ لا يرتدّ — `sequence-allocator.ts`)، ثم يسقط الخاسرُ على الختم المشروط أدناه **بعد** ترقيمه ⟸
           * **رقمُ فاتورةٍ ضريبيةٍ محترقٌ في كل نقرةٍ مزدوجة**. والآن ينتظر الخاسرُ هنا حتى يلتزم الفائز، ثم يقرأ
           * «محوَّل» فيُردّ `409` **قبل** الترقيم. والختمُ المشروطُ باقٍ طبقةً ثانية: هذا يسمّي مبكّراً، وذاك يمنع.
           */
          // بترتيبها المعلَن — فالفاتورةُ المحوَّلة تُرقَّم بترتيب العرض لا بترتيب القرص (`ق-١٤١٢`).
          // وعرضٌ حُذف بين قراءة الرؤية والقفل (حذفٌ التزم والقفلُ ينتظره) لا صفَّ له بعد القفل ⟸ `404` مسمّى لا `P2025` خام.
          const quote = await tx.quote.findUnique({ where: { id }, include: { lines: LINE_ORDER } });
          if (!quote) throw new NotFoundException(MSG.quote_not_found);

          if (quote.status === 'CONVERTED') {
            throw new ConflictException(formatMessage(MSG.quote_already_converted, { invoiceNo: await this.convertedInvoiceNo(tx, quote) }));
          }
          if (isExpired(quote)) {
            throw new ConflictException(formatMessage(MSG.quote_expired, { date: quote.validUntil.toISOString().slice(0, 10) }));
          }

          // أسعار الفاتورة = أسعار العرض المتفق عليها (قاعدة الموجز 2) —
          // البنود تُنقل نصاً ورقماً؛ تغيّر سعر الصنف بعد العرض لا أثر له.
          // الفرع والعميل يُورَثان من العرض لا من الجلسة (قاعدة 5).
          const today = new Date().toISOString().slice(0, 10);
          const invoiceDto = {
            customerId: quote.customerId,
            branchId: quote.branchId ?? undefined,
            issueDate: today,
            // استحقاق فوري كسائر الفواتير المباشرة اليوم — سياسة آجال
            // قابلة للتهيئة مرشحٌ مسجَّل، لا يُبنى هنا (حراسة النطاق).
            dueDate: today,
            notes: quote.notes ?? undefined,
            currency: quote.currency,
            exchangeRate: Number(quote.exchangeRate),
            lines: quote.lines.map((l) => ({
              description: l.description,
              // ⚠️ الصنف ينتقل مع السطر — **وهذا هو سبب حمله على العرض
              // أصلاً**. لو سقط هنا لصارت كل فاتورةٍ محوَّلة سطوراً بلا
              // أصناف، فلا تكلفة لها مهما اكتملت الطبقات.
              productId: l.productId ?? undefined,
              quantity: Number(l.quantity),
              unitPrice: Number(l.unitPrice),
              discount: Number(l.discount ?? 0),
              taxRate: Number(l.taxRate),
              // ⑧ والفئةُ تنتقل كما عُرضت — ما وافق عليه العميل لا ما على البطاقة اليوم؛
              // وبندٌ قديم بصفرٍ بلا فئة (`LEGACY_ZERO`) يُردّ باسمه حتى يُعلَن على العرض.
              taxCategory: l.taxCategory as 'S' | 'Z' | 'E' | 'O',
              taxExemptionReasonCode: l.taxExemptionReasonCode ?? undefined,
              taxExemptionReason: l.taxExemptionReason ?? undefined,
            })),
          } as CreateInvoiceDto;

          // ⚖️ **التحويل يفتح ذمّةً كالفاتورة المباشرة** — فيمرّ ببوّابة الحدّ
          //    بتصريح المستدعي نفسِه (`ق-٣٣٨`). **ولا مسارَ فوترةٍ موازٍ**،
          //    فالتكافؤُ يبقى محفوظاً حتى في المنع.
          const invoice = await this.invoicesService.createWithinTx(tx, companyId, allowedBranchIds, invoiceDto, credit, { trustLineTax: true });

          // شرط ما-زال-قابلاً داخل نفس المعاملة: صفر صفوف = سبقنا متسابق —
          // نقرأ فاتورته ونتراجع بإلقاءٍ يفكّ المعاملة كلها (فاتورتنا معها).
          const stamped = await tx.quote.updateMany({
            where: { id, status: { in: ['DRAFT', 'SENT'] }, convertedInvoiceId: null },
            data: { status: 'CONVERTED', convertedInvoiceId: invoice.id, convertedAt: new Date() },
          });
          if (stamped.count === 0) {
            const winner = await tx.quote.findUnique({ where: { id }, select: { convertedInvoice: { select: { no: true } } } });
            throw new ConflictException(formatMessage(MSG.quote_already_converted, { invoiceNo: winner?.convertedInvoice?.no ?? '—' }));
          }

          return { quote: await tx.quote.findUniqueOrThrow({ where: { id }, include: { ...QUOTE_INCLUDE, convertedInvoice: { select: { id: true, no: true } } } }), invoice };
        });
      } catch (e) {
        // سباقٌ وصل حدَّ قاعدة البيانات (قيد @unique على convertedInvoiceId
        // أو تصادم ترقيم متزامن): الترقيم يعيد المحاولة عبر retry الخارجي،
        // وتفرّد التحويل يُقرأ فائزُه ويُسمّى.
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && String(e.meta?.target ?? '').includes('convertedInvoiceId')) {
          const winner = await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
            tx.quote.findUnique({ where: { id }, select: { convertedInvoice: { select: { no: true } } } }),
          );
          throw new ConflictException(formatMessage(MSG.quote_already_converted, { invoiceNo: winner?.convertedInvoice?.no ?? '—' }));
        }
        throw e;
      }
    });
  }

  /**
   * تسلسل Q- مستقل تماماً عن INV/CN: يُشتق من جدول العروض وحده (شرط صاحب
   * المشروع) — إصدار عرض لا يستهلك رقم فاتورة أبداً.
   *
   * ⚠️ **وهذا الموضعُ السابع** (ق-٣٢٨): القياسُ الذي عُرض على المالك قال ستة،
   * **فوجده الحارسُ المشتقُّ سابعاً** — وهو عينُ حجّة القرار: «تركُ اثنين
   * للاحقٍ يترك مسارين». **ومفتاحُه `Q` مستقلٌّ في العدّاد** فلا يمسّ `INV`.
   */
  private async nextQuoteNumber(tx: Prisma.TransactionClient, companyId: string, issueDate: Date): Promise<string> {
    return nextDocumentNumber(tx, companyId, issueDate, { kind: 'Q', pad: 4 }, (prefix) => highestSequenceOf(tx.quote, prefix));
  }

  private async convertedInvoiceNo(tx: Prisma.TransactionClient, quote: Pick<Quote, 'convertedInvoiceId'>): Promise<string> {
    if (!quote.convertedInvoiceId) return '—';
    const inv = await tx.invoice.findUnique({ where: { id: quote.convertedInvoiceId }, select: { no: true } });
    return inv?.no ?? '—';
  }
}
