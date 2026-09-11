import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Quote, QuoteStatus } from '@prisma/client';
import { branchFilter, resolveBranchId } from '../branches/branch-scope.util';
import { resolveCurrency, toBaseAmount } from '../common/currency/base-amount.util';
import { computeDocumentTotals } from '../common/money/totals';
import { highestSequenceOf, nextDocumentNumber } from '../common/document-sequence.util';
import { retryOnUniqueConflict } from '../common/retry-on-conflict.util';
import { type CreditContext } from '../invoices/credit-context';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { formatMessage, MSG } from '../common/i18n/messages';
import { InvoicesService } from '../invoices/invoices.service';
import { CreateInvoiceDto } from '../invoices/dto/create-invoice.dto';
import { CreateQuoteDto, QuoteLineDto, UpdateQuoteDto } from './dto/quote.dto';

const QUOTE_INCLUDE = { customer: true, lines: true } as const;

/** نفس رياضيات الفاتورة حرفياً — **الدالة نفسها** (`common/money/totals.ts`) لا نسخةٌ منها،
 * فما يراه العميل في العرض هو ما سيُفوتَر هللةً بهللة. (كانت هنا نسخةٌ **غير مدوَّرة**
 * تختلف عن الفاتورة عند التحويل — كنسة التدوير 2026-09-03.) */
function computeTotals(lines: QuoteLineDto[]) {
  const { subtotal, taxTotal, total } = computeDocumentTotals(lines);
  return { subtotal, taxTotal, total };
}

/** آخرُ يومِ الصلاحية مشمول: العرض يموت بعد نهاية يومه لا في صبيحته. */
function isExpired(quote: Pick<Quote, 'validUntil' | 'status'>, now = new Date()): boolean {
  if (quote.status === 'CONVERTED') return false;
  const endOfDay = new Date(quote.validUntil);
  endOfDay.setHours(23, 59, 59, 999);
  return endOfDay < now;
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
  async list(companyId: string, allowedBranchIds: string[] | 'all') {
    const quotes = await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.quote.findMany({ where: branchFilter(allowedBranchIds), include: QUOTE_INCLUDE, orderBy: { createdAt: 'desc' } }),
    );
    return quotes.map((q) => ({ ...q, derivedStatus: deriveStatus(q) }));
  }

  async findOne(companyId: string, id: string) {
    const quote = await this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.quote.findUnique({ where: { id }, include: { ...QUOTE_INCLUDE, convertedInvoice: { select: { id: true, no: true } } } }),
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
    const { subtotal, taxTotal, total } = computeTotals(dto.lines);
    const { currency, exchangeRate } = resolveCurrency(dto);
    // نفس عقد الترقيم المتسابق للفواتير: قيد (companyId, no) الفريد يحسم،
    // وretry يعيد العدّ — اختبار التصادم المتزامن ضمن الدفعة يثبته.
    return retryOnUniqueConflict(() =>
      this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
        const customer = await tx.customer.findUnique({ where: { id: dto.customerId }, select: { id: true } });
        if (!customer) throw new NotFoundException(MSG.customer_not_found);

        const branchId = await resolveBranchId(tx, dto.branchId, allowedBranchIds);

        const no = await this.nextQuoteNumber(tx, companyId, new Date(dto.issueDate));
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
            lines: { create: dto.lines.map((l) => ({ companyId, description: l.description, productId: l.productId ?? null, quantity: l.quantity, unitPrice: l.unitPrice, taxRate: l.taxRate })) },
          } as unknown as Prisma.QuoteUncheckedCreateInput,
          include: QUOTE_INCLUDE,
        });
      }),
    );
  }

  update(companyId: string, id: string, dto: UpdateQuoteDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.quote.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.quote_not_found);
      if (existing.status === 'CONVERTED') {
        throw new ConflictException(formatMessage(MSG.quote_converted_immutable, { invoiceNo: await this.convertedInvoiceNo(tx, existing) }));
      }

      const totals = dto.lines ? computeTotals(dto.lines) : null;
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
                  create: dto.lines!.map((l) => ({ companyId, description: l.description, productId: l.productId ?? null, quantity: l.quantity, unitPrice: l.unitPrice, taxRate: l.taxRate })),
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
  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.quote.findUnique({ where: { id } });
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
   * العرض بشرطِ ما-زال-قابلاً — الخاسر في سباق النقرتين يتراجع كلياً
   * (فاتورته تُلغى مع المعاملة) ويعيد 409 باسم فاتورة الفائز (قرار 6.12).
   */
  convert(companyId: string, allowedBranchIds: string[] | 'all', id: string, credit: CreditContext) {
    return retryOnUniqueConflict(async () => {
      try {
        return await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
          const quote = await tx.quote.findUnique({ where: { id }, include: { lines: true } });
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
              taxRate: Number(l.taxRate),
            })),
          } as CreateInvoiceDto;

          // ⚖️ **التحويل يفتح ذمّةً كالفاتورة المباشرة** — فيمرّ ببوّابة الحدّ
          //    بتصريح المستدعي نفسِه (`ق-٣٣٨`). **ولا مسارَ فوترةٍ موازٍ**،
          //    فالتكافؤُ يبقى محفوظاً حتى في المنع.
          const invoice = await this.invoicesService.createWithinTx(tx, companyId, allowedBranchIds, invoiceDto, credit);

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
