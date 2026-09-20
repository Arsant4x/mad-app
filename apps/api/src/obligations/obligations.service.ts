import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { adjustmentSign } from '../common/adjustment/adjustment-note.util';
import { toBaseAmount } from '../common/currency/base-amount.util';
import { round2 } from '../common/money/rounding';
import { money } from '../common/money/text';
import { computeDocumentTotals, lineNet } from '../common/money/totals';
import { exemptionReasonByCode } from '../common/vat/exemption-reasons';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { rentAmountsOf, rentTaxTreatment, splitGrossAmount, taxPointsOfInstallment } from '../journal/rent-tax-point.util';
import { VatDeclarationQueryDto } from './dto/vat-declaration-query.dto';
import { VatFiledDto } from './dto/vat-filed.dto';
import { MSG } from '../common/i18n/messages';
import { NOT_REPLACED_REJECTED } from '../invoices/active-documents.util';

/**
 * ⭐ **قسمُ الإيجار في الإقرار** (`ق-٩١٧` · `ق-٩١٨` · `ق-٩٢٦`).
 *
 * **المصدرُ صفوفُ الاستحقاق** (`rent_accruals`) بتاريخ نقطة الضريبة — الصفوفُ نفسُها التي
 * رُحِّل منها الدفتر، فيستوي الاثنان بالبناء (`ق-٩١٥`). وثلاثةٌ **تُعدّ وتُعلَن بنصّها**:
 *
 *   ① **ما سبق البناء** (أقساطٌ على أساس القبض ودفعاتٌ بلا قسطٍ سبقت): يُحسب هنا بالمحرّك
 *      نفسِه (`rent-tax-point.util`) ويدخل الإقرار **ولا يُرحَّل** — «في الإقرار لا في
 *      الدفتر»، الاستثناءُ الوحيد من «الدفتر = الإقرار» (`ق-٩٢٦`).
 *   ② **عقودٌ قديمة غيرُ مصنَّفة**: لا تدخل — تُعدّ حتى تُصنَّف بيدٍ (`ق-٨٩٨`).
 *   ③ **عقاراتُ التشغيل** (`managed`): توريدُ مالكها — تُعدّ ولا تدخل (`ق-٨٩٣`).
 */
export interface RentDeclarationSection {
  /** الخاضعُ من الاستحقاق (صافياً) وضريبتُه — صفوفٌ بقيد. */
  standard: number;
  standardVat: number;
  /** المعفى (سكنيٌّ) من الاستحقاق — صفُّ «المبيعات المعفاة». */
  exempt: number;
  /** عقاراتُ التشغيل — تُعدّ ولا تدخل. */
  managedExcluded: number;
  managedCount: number;
  /** ما سبق البناء — يدخل الإقرار ولا يحمله الدفتر. */
  legacyStandard: number;
  legacyStandardVat: number;
  legacyExempt: number;
  legacyCount: number;
  legacyNote: string;
  /** أقساطٌ ودفعاتٌ لعقودٍ قديمةٍ غيرِ مصنَّفة — لا تدخل حتى تُصنَّف. */
  unclassifiedCount: number;
  unclassifiedNote: string;
  /** صفوفُ استحقاقٍ في الربع بلا قيد (نقصُ حسابٍ في الدليل) — يُعلَن لا يُخفى. */
  unpostedCount: number;
  /** أقساطٌ حلّت في الربع ولم يُرحَّل استحقاقُها بعد (ينتظرها الكنسُ اليوميّ، أو حجبتها فترةٌ مقفلة) — تُعدّ لا تُخفى. */
  pendingCount: number;
  pendingNote: string;
  accrualCount: number;
}

/** The standard 9-item checklist from the mockup, verbatim — no due date, no
 * amount, no penalty, no recurrence. Auto-seeded per company on first read
 * (see `list`) rather than at signup, so it works regardless of how the
 * company was created. */
export const STANDARD_OBLIGATIONS: { body: string; title: string }[] = [
  { body: 'هيئة الزكاة والضريبة والجمارك', title: 'تقديم إقرار ضريبة القيمة المضافة (شهري أو ربع سنوي)' },
  { body: 'هيئة الزكاة والضريبة والجمارك', title: 'تقديم الإقرار الزكوي / ضريبة الدخل السنوي' },
  { body: 'هيئة الزكاة والضريبة والجمارك', title: 'الالتزام بمتطلبات الفوترة الإلكترونية: QR، رقم تسلسلي، حفظ النسخ' },
  { body: 'هيئة الزكاة والضريبة والجمارك', title: 'سداد الضريبة المستحقة قبل نهاية مهلة الإقرار' },
  { body: 'وزارة التجارة', title: 'تجديد السجل التجاري قبل انتهائه' },
  { body: 'وزارة التجارة', title: 'تحديث العنوان الوطني وبيانات المنشأة عند أي تغيير' },
  { body: 'وزارة التجارة', title: 'إيداع القوائم المالية للشركات الملزمة' },
  { body: 'التأمينات الاجتماعية', title: 'رفع أجور الموظفين وسداد الاشتراكات الشهرية قبل نهاية المهلة' },
  { body: 'التأمينات الاجتماعية', title: 'تسجيل الموظفين الجدد وإنهاء اشتراك المنتهية خدماتهم بالمهلة النظامية' },
];

@Injectable()
export class ObligationsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.governmentObligation.findMany({ orderBy: { order: 'asc' } });
      if (existing.length > 0) return existing;

      await tx.governmentObligation.createMany({
        // companyId omitted on purpose — injected per-row at runtime by the
        // tenant scope extension (see accounts.service.ts for why this cast
        // exists).
        data: STANDARD_OBLIGATIONS.map((o, i) => ({ body: o.body, title: o.title, order: i })) as unknown as Prisma.GovernmentObligationCreateManyInput[],
      });
      return tx.governmentObligation.findMany({ orderBy: { order: 'asc' } });
    });
  }

  toggle(companyId: string, id: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.governmentObligation.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.obligation_not_found);
      return tx.governmentObligation.update({ where: { id }, data: { done: !existing.done } });
    });
  }

  /**
   * **على مستوى المنشأة بحقّها**: إقرارُ الضريبة يُقدَّم عن المنشأة برقمها
   * الضريبيّ الواحد — فمبيعاتُ الفروع كلِّها ومشترياتُها تدخل فيه، وإقرارٌ يحجب
   * فرعاً إقرارٌ ناقصٌ أمام الهيئة.
   */
  vatDeclaration(companyId: string, query: VatDeclarationQueryDto) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => this.declarationWithinTx(tx, query));
  }

  /**
   * **علَمُ «قُدِّم»** (`ق-٩١٩`): يُوسَم الربعُ بصافيه كما قُرئ الآن — فتُقاس عليه قراءاتُ الغد.
   * وسمٌ ثانٍ يُحدّث اللحظةَ والصافي (قدّم تصحيحاً فوسم من جديد).
   */
  markFiled(companyId: string, dto: VatFiledDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const declaration = await this.declarationWithinTx(tx, dto);
      const filing = await tx.vatReturnFiling.upsert({
        where: { companyId_year_quarter: { companyId, year: dto.year, quarter: dto.quarter } },
        create: { companyId, year: dto.year, quarter: dto.quarter, netVat: declaration.netVat, filedAt: new Date() },
        update: { netVat: declaration.netVat, filedAt: new Date() },
      });
      return { year: filing.year, quarter: filing.quarter, filedAt: filing.filedAt, netVat: money(filing.netVat) };
    });
  }

  unmarkFiled(companyId: string, dto: VatFiledDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      await tx.vatReturnFiling.deleteMany({ where: { year: dto.year, quarter: dto.quarter } });
      return { year: dto.year, quarter: dto.quarter, filed: null };
    });
  }

  /**
   * **على مستوى المنشأة بحقّها**: إقرارُ الضريبة يُقدَّم عن المنشأة برقمها الضريبيّ الواحد —
   * فمبيعاتُ الفروع كلِّها ومشترياتُها تدخل فيه (الإعلانُ على المتحكِّم العامّ أعلاه، ويُعاد هنا
   * على الدالّة التي تقرأ — فحارسُ `ق-٥١٧` يقرأ النطاقَ الذي تقع فيه القراءة).
   */
  private async declarationWithinTx(tx: Prisma.TransactionClient, query: VatDeclarationQueryDto) {
    {
      const quarterMonths: Record<number, [number, number]> = { 1: [1, 3], 2: [4, 6], 3: [7, 9], 4: [10, 12] };
      const [startMonth, endMonth] = quarterMonths[query.quarter];
      const from = new Date(Date.UTC(query.year, startMonth - 1, 1));
      const to = new Date(Date.UTC(query.year, endMonth, 0));

      // الإقرارُ يقرأ ولا يُرحّل: الاستحقاقُ يُكتب عند الإنشاء والتجديد والقبض وبالكنس اليوميّ
      // (ق-٩٢٧/٥)؛ وما حلّ ولم يُرحَّل بعدُ **يُعدّ هنا** لا يُخفى — فقراءةٌ لا تكتب في الدفتر.
      // المردودةُ التي صدر بدلُها تخرج والبدلُ يدخل — من المصدر الواحد لا بنسخةٍ هنا (`ق-٩٦٧/١`).
      const purchaseSelect = { subtotal: true, taxAmount: true, exempt: true, excludeFromVat: true, docType: true } as const;
      const [invoices, purchaseRows, voidedRows, rent] = await Promise.all([
        // ⑧ الإقرارُ يقرأ **السطورَ** لا مجموعَ الفاتورة (`ق-١٢٢٣`): كان كلُّ مبيعٍ في الخانة `1` بمجموعه ولو كان
        // فيه سطرٌ بنسبة الصفر أو معفى — فلا يصحّ إقرارُ صيدليةٍ ولا مصدِّر. والمبالغُ بالريال عبر سعر الفاتورة.
        tx.invoice.findMany({
          where: { issueDate: { gte: from, lte: to }, ...NOT_REPLACED_REJECTED },
          select: {
            docType: true,
            exchangeRate: true,
            lines: { select: { quantity: true, unitPrice: true, taxRate: true, taxCategory: true, taxExemptionReasonCode: true, taxExemptionReason: true } },
          },
        }),
        tx.purchase.findMany({ where: { date: { gte: from, lte: to } }, select: purchaseSelect }),
        // ⚖️ الإلغاءُ بقيد عكسٍ يدخل الإقرارَ **في ربعه** كما دخل الأصلُ في ربعه (`ق-٩٩٧`/②) — لا يُعاد كتابةُ ربعٍ مضى.
        tx.purchase.findMany({ where: { voidedAt: { gte: from, lt: new Date(to.getTime() + 86_400_000) } }, select: purchaseSelect }),
        this.rentSection(tx, from, to),
      ]);
      const purchases = [...purchaseRows.map((p) => ({ ...p, voidSign: 1 })), ...voidedRows.map((p) => ({ ...p, voidSign: -1 }))];

      // A credit note reduces the quarter's output VAT — its stored amounts are positive (the
      // docType carries the direction), so it enters the declaration with a flipped sign rather
      // than adding to sales. المصدرُ الواحد ⑤ مع إشعار المورّد (`ق-١٠٠٨`/١).
      const sign = (docType: string) => adjustmentSign(docType, 'CREDIT_NOTE');
      // ⚖️ وإشعارُ المورّد الدائن يعكس ضريبةَ المدخلات بإشارته في فترة تاريخه (`ق-١٠٠٦`/④) — لا يُعاد كتابةُ ربعٍ مضى.
      const purchaseSign = (p: { docType: string; voidSign: number }) => adjustmentSign(p.docType, 'SUPPLIER_CREDIT_NOTE') * p.voidSign;
      // ⑧ توزيعُ السطور على خانات النموذج (دليلُ الإقرار — الموجز §٢-د · `exemption-reasons.ts`):
      //   `1` الخاضعُ بالنسبة الأساسية (`S`، ومعه ما بيع من صنفٍ لم يُعلَن `LEGACY_STANDARD` — يُعدّ ويُعلَن)
      //   `2` المبيعاتُ للمواطنين — **تابعةٌ للمشتري، غيرُ مدعومة: صفرٌ معلَن** (`ق-١٢٢٣`)، لا تُترك في `3`
      //   `3` الصفرُ المحليّ · `4` الصادرات · `5` المعفى · وخارجُ النطاق (`O`) لا يدخل الإقرار ويُعدّ
      //   و`LEGACY_ZERO` — سطرٌ قديم بصفرٍ لا يُعرف أزيروٌ هو أم معفىً أم خارج النطاق: **يُعدّ ويُعلَن ولا
      //   يُنسب إلى خانة** — أوّلُ صفٍّ يقول «لا أعرف» بدل أن يختار.
      const boxes = salesBoxesFromLines(invoices.map((v) => ({ sign: sign(v.docType), exchangeRate: Number(v.exchangeRate), lines: v.lines })));
      // الإيجارُ التجاريُّ يدخل الخاضعَ بنقطة ضريبته — من الدفتر (الاستحقاق) ومن ما سبق البناء
      // (يُحسب ويُعلَن)؛ والسكنيُّ صفُّ المعفى (م٦٢/٢/ز).
      const salesStandard = round2(boxes.box1.net + rent.standard + rent.legacyStandard);
      const salesStandardVat = round2(boxes.box1.vat + rent.standardVat + rent.legacyStandardVat);
      const salesExempt = round2(boxes.box5.net + rent.exempt + rent.legacyExempt);
      const salesZeroRatedDomestic = boxes.box3.net;
      const salesExports = boxes.box4.net;
      const totalSales = round2(salesStandard + boxes.box2.net + salesZeroRatedDomestic + salesExports + salesExempt);

      // A purchase with no valid tax invoice is dropped from the declaration
      // entirely (matching the mockup): its input VAT can't be reclaimed, so it
      // must not reduce the net VAT owed. Reported separately for transparency.
      const declarablePurchases = purchases.filter((p) => !p.excludeFromVat);
      const excludedPurchases = purchases.filter((p) => p.excludeFromVat);

      const taxablePurchases = declarablePurchases.filter((p) => !p.exempt);
      const exemptPurchases = declarablePurchases.filter((p) => p.exempt);
      const purchasesStandard = round2(taxablePurchases.reduce((s, p) => s + purchaseSign(p) * Number(p.subtotal), 0));
      const purchasesStandardVat = round2(taxablePurchases.reduce((s, p) => s + purchaseSign(p) * Number(p.taxAmount), 0));
      const purchasesExempt = round2(exemptPurchases.reduce((s, p) => s + purchaseSign(p) * Number(p.subtotal), 0));
      const purchasesExcluded = round2(excludedPurchases.reduce((s, p) => s + purchaseSign(p) * Number(p.subtotal), 0));

      const netVat = round2(salesStandardVat - purchasesStandardVat);
      // علَمُ «قُدِّم» (ق-٩١٩): إن وُسم الربعُ فالمقارنةُ بين ما قُدِّم وما يُقرأ الآن — وبلا وسمٍ لا رسالة.
      const filing = await tx.vatReturnFiling.findFirst({ where: { year: query.year, quarter: query.quarter } });
      const filed = filing ? { filedAt: filing.filedAt, netVat: round2(Number(filing.netVat)) } : null;
      const changedSinceFiled = filed !== null && Math.abs(filed.netVat - netVat) >= 0.005;

      // ② **المالُ نصّاً بدقّة صنفه على حدّ الاستجابة** (`ق-١٢٣٥` — أوّلُ نطاق: الإقرار): الحسابُ فوقُ يبقى رقماً
      //    بالمصدر الواحد، والحقولُ تخرج نصّاً بخانتين (`money`) فلا يُعاد تدويرُها في المتصفّح؛ والعدّاتُ أرقامٌ كما هي.
      const box = (b: { net: number; vat?: number }) => ('vat' in b && b.vat !== undefined ? { net: money(b.net), vat: money(b.vat) } : { net: money(b.net) });
      const counted = (c: { lineCount: number; net: number }) => ({ lineCount: c.lineCount, net: money(c.net) });
      return {
        year: query.year,
        quarter: query.quarter,
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        salesStandard: money(salesStandard),
        salesStandardVat: money(salesStandardVat),
        salesExempt: money(salesExempt),
        /** ⑧ الخاناتُ من السطور — و`2` صفرٌ معلَن بنصّه، والقديمُ وخارجُ النطاق عدّاً معلَناً لا خانةً. */
        salesZeroRatedDomestic: money(salesZeroRatedDomestic),
        salesExports: money(salesExports),
        salesCitizens: money(boxes.box2.net),
        salesCitizensNote: 'المبيعاتُ للمواطنين (الخدمات الصحية الخاصة / التعليم الأهلي الخاص) تتبع هويّةَ المشتري لا الصنف — غيرُ مدعومة بعد؛ الخانةُ صفرٌ معلَن ولا تُدمَج في الخانة 3',
        totalSales: money(totalSales),
        salesOutOfScope: counted(boxes.outOfScope),
        legacyZeroLines: counted(boxes.legacyZero),
        legacyStandardLines: counted(boxes.legacyStandard),
        boxes: {
          1: box(boxes.box1),
          2: { ...box(boxes.box2), supported: false as const },
          3: box(boxes.box3),
          4: box(boxes.box4),
          5: box(boxes.box5),
          6: { net: money(totalSales) },
        },
        rent: {
          ...rent,
          standard: money(rent.standard),
          standardVat: money(rent.standardVat),
          exempt: money(rent.exempt),
          managedExcluded: money(rent.managedExcluded),
          legacyStandard: money(rent.legacyStandard),
          legacyStandardVat: money(rent.legacyStandardVat),
          legacyExempt: money(rent.legacyExempt),
        },
        purchasesStandard: money(purchasesStandard),
        purchasesStandardVat: money(purchasesStandardVat),
        purchasesExempt: money(purchasesExempt),
        purchasesExcluded: money(purchasesExcluded),
        excludedCount: excludedPurchases.length,
        totalPurchases: money(round2(purchasesStandard + purchasesExempt)),
        netVat: money(netVat),
        invoiceCount: invoices.length,
        purchaseCount: purchases.length,
        filed: filed ? { filedAt: filed.filedAt, netVat: money(filed.netVat) } : null,
        changedSinceFiled,
        /** يُعرض حين `changedSinceFiled` وحدَه — نصُّ م٦٣ حيث يُقرأ الرقم (ق-٤٤٩). */
        filedNote: changedSinceFiled
          ? `تغيّر هذا الإقرارُ بعد تقديمه (قُدِّم بصافي ${money(filed!.netVat)}): تصحيحُه واجبٌ خلال عشرين يوماً من العلم (م٦٣/١)؛ ونقصٌ دون 15,000 ريال يجوز إدراجُه في الإقرار التالي (م٦٣/٣)`
          : null,
      };
    }
  }

  /** قسمُ الإيجار — انظر `RentDeclarationSection`. */
  private async rentSection(tx: Prisma.TransactionClient, from: Date, to: Date): Promise<RentDeclarationSection> {
    const rows = await tx.rentAccrual.findMany({
      where: { date: { gte: from, lte: to } },
      select: { classification: true, taxable: true, managed: true, baseNet: true, baseTax: true, journalEntryId: true },
    });
    const sum = (pick: (r: (typeof rows)[number]) => boolean, field: 'baseNet' | 'baseTax') => round2(rows.filter(pick).reduce((s, r) => s + Number(r[field]), 0));

    const section: RentDeclarationSection = {
      standard: sum((r) => r.taxable, 'baseNet'),
      standardVat: sum((r) => r.taxable, 'baseTax'),
      exempt: sum((r) => r.classification === 'RESIDENTIAL', 'baseNet'),
      managedExcluded: sum((r) => r.managed, 'baseNet'),
      managedCount: rows.filter((r) => r.managed).length,
      legacyStandard: 0,
      legacyStandardVat: 0,
      legacyExempt: 0,
      legacyCount: 0,
      legacyNote: 'أقساطٌ ودفعاتٌ سبقت بناءَ الاستحقاق: تدخل الإقرار بنقطة ضريبتها ولا يحملها الدفتر — «ما سبق اللحظةَ: في الإقرار لا في الدفتر»',
      unclassifiedCount: 0,
      unclassifiedNote: 'أقساطٌ ودفعاتٌ لعقودٍ قديمةٍ غيرِ مصنَّفة لا تدخل الإقرار حتى تُصنَّف من بطاقة العقد',
      unpostedCount: rows.filter((r) => r.journalEntryId === null).length,
      pendingCount: 0,
      pendingNote: 'أقساطٌ حلّت في هذا الربع ولم يُرحَّل استحقاقُها بعد — يرحّلها الكنسُ اليوميّ، وإن حجبتها فترةٌ مقفلة فافتحها',
      accrualCount: rows.length,
    };

    // ⓪ ما حلّ في الربع ولم يُرحَّل بعد — يُعدّ لا يُخفى.
    const today = new Date();
    section.pendingCount = await tx.installment.count({
      where: {
        accrualBasis: 'ACCRUAL',
        accrualCompletedAt: null,
        status: { not: 'CANCELLED' },
        dueDate: { gte: from, lte: to < today ? to : today },
        contract: { classification: { not: 'LEGACY_UNCLASSIFIED' }, vatInclusion: { not: 'LEGACY_UNDECLARED' }, status: { not: 'DRAFT' } },
      },
    });

    // ① ما سبق البناء — أقساطٌ على أساس القبض لعقودٍ مصنَّفة: نقاطُها بالمحرّك نفسِه.
    // **مقصورةً على ما قد تقع نقطتُه في الربع**: استحقاقٌ فيه أو دفعةٌ فيه — لا كلَّ القديم.
    const legacyInstallments = await tx.installment.findMany({
      where: {
        accrualBasis: 'LEGACY_COLLECTED',
        status: { not: 'CANCELLED' },
        OR: [{ dueDate: { gte: from, lte: to } }, { payments: { some: { date: { gte: from, lte: to } } } }],
        contract: { classification: { not: 'LEGACY_UNCLASSIFIED' }, vatInclusion: { not: 'LEGACY_UNDECLARED' }, status: { not: 'DRAFT' } },
      },
      select: {
        dueDate: true,
        amount: true,
        exchangeRate: true,
        payments: { select: { id: true, date: true, amount: true } },
        contract: { select: { classification: true, vatInclusion: true, unit: { select: { property: { select: { ownership: true } } } } } },
      },
    });
    for (const i of legacyInstallments) {
      const treatment = rentTaxTreatment(i.contract.classification, i.contract.vatInclusion, i.contract.unit.property.ownership);
      if (!treatment) continue;
      const points = taxPointsOfInstallment({
        gross: rentAmountsOf(Number(i.amount), treatment).gross,
        dueDate: i.dueDate,
        payments: i.payments.map((p) => ({ id: p.id, date: p.date, gross: Number(p.amount) })),
        asOf: to,
      }).filter((pt) => pt.date >= from && pt.date <= to);
      for (const pt of points) this.addLegacyPoint(section, splitGrossAmount(pt.gross, treatment), Number(i.exchangeRate), treatment);
    }

    // ودفعاتٌ بلا قسطٍ سبقت البناء (لا صفَّ لها) لعقودٍ مصنَّفة — بقدرها بتاريخها.
    const legacyUnlinked = await tx.rentPayment.findMany({
      where: {
        installmentId: null,
        date: { gte: from, lte: to },
        accruals: { none: {} },
        contract: { classification: { not: 'LEGACY_UNCLASSIFIED' }, vatInclusion: { not: 'LEGACY_UNDECLARED' } },
      },
      select: {
        amount: true,
        exchangeRate: true,
        contract: { select: { classification: true, vatInclusion: true, unit: { select: { property: { select: { ownership: true } } } } } },
      },
    });
    for (const p of legacyUnlinked) {
      const treatment = rentTaxTreatment(p.contract.classification, p.contract.vatInclusion, p.contract.unit.property.ownership);
      if (!treatment) continue;
      this.addLegacyPoint(section, splitGrossAmount(Number(p.amount), treatment), Number(p.exchangeRate), treatment);
    }

    // ② عقودٌ غيرُ مصنَّفة — تُعدّ ولا تدخل.
    const unclassifiedWhere = { OR: [{ classification: 'LEGACY_UNCLASSIFIED' as const }, { vatInclusion: 'LEGACY_UNDECLARED' as const }] };
    const [unclassifiedInstallments, unclassifiedPayments] = await Promise.all([
      tx.installment.count({ where: { dueDate: { gte: from, lte: to }, status: { not: 'CANCELLED' }, contract: unclassifiedWhere } }),
      tx.rentPayment.count({ where: { installmentId: null, date: { gte: from, lte: to }, contract: unclassifiedWhere } }),
    ]);
    section.unclassifiedCount = unclassifiedInstallments + unclassifiedPayments;

    return section;
  }

  private addLegacyPoint(section: RentDeclarationSection, amounts: { net: number; tax: number }, rate: number, treatment: { taxable: boolean; managed: boolean; classification: string }) {
    const net = round2(amounts.net * rate);
    const tax = round2(amounts.tax * rate);
    section.legacyCount += 1;
    if (treatment.managed) {
      section.managedExcluded = round2(section.managedExcluded + net);
      section.managedCount += 1;
    } else if (treatment.taxable) {
      section.legacyStandard = round2(section.legacyStandard + net);
      section.legacyStandardVat = round2(section.legacyStandardVat + tax);
    } else if (treatment.classification === 'RESIDENTIAL') {
      section.legacyExempt = round2(section.legacyExempt + net);
    }
  }
}

/** ⑧ سطرُ مستندٍ كما يقرؤه الإقرار — الحقولُ التي نُسخت لحظةَ البيع. */
interface DeclarationLine {
  quantity: Prisma.Decimal | number;
  unitPrice: Prisma.Decimal | number;
  taxRate: Prisma.Decimal | number;
  taxCategory: string;
  taxExemptionReasonCode: string | null;
  taxExemptionReason: string | null;
}

export interface SalesBoxes {
  box1: { net: number; vat: number };
  box2: { net: number; vat: number };
  box3: { net: number };
  box4: { net: number };
  box5: { net: number };
  /** خارجُ النطاق — لا يدخل الإقرار، ويُعدّ. */
  outOfScope: { lineCount: number; net: number };
  /** سطورٌ قديمة بصفرٍ بلا فئة — تُعدّ وتُعلَن ولا تُنسب إلى خانة. */
  legacyZero: { lineCount: number; net: number };
  /** ما بيع من صنفٍ لم يُعلَن — دخل الخانة `1` كالخاضع ويُعدّ («بيعٌ بقيمةٍ قديمة»). */
  legacyStandard: { lineCount: number; net: number };
}

/**
 * ⑧ توزيعُ سطور المبيعات على خانات النموذج — بالدالّة التي يبني بها الدفترُ والمستندُ مجاميعَهما
 * (`computeDocumentTotals`: وعاءٌ لكل فئةٍ ونسبةٍ وسبب)، فما يُقرّ هو ما رُحِّل وما خُتم هللةً بهللة؛
 * والمبالغُ بالريال بسعر الفاتورة نفسِها، والإشعارُ الدائن بإشارته.
 */
export function salesBoxesFromLines(invoices: readonly { sign: number; exchangeRate: number; lines: readonly DeclarationLine[] }[]): SalesBoxes {
  const boxes: SalesBoxes = {
    box1: { net: 0, vat: 0 },
    box2: { net: 0, vat: 0 },
    box3: { net: 0 },
    box4: { net: 0 },
    box5: { net: 0 },
    outOfScope: { lineCount: 0, net: 0 },
    legacyZero: { lineCount: 0, net: 0 },
    legacyStandard: { lineCount: 0, net: 0 },
  };
  for (const inv of invoices) {
    const lines = inv.lines.map((l) => ({
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      taxRate: Number(l.taxRate),
      taxCategory: l.taxCategory,
      taxExemptionReasonCode: l.taxExemptionReasonCode,
      taxExemptionReason: l.taxExemptionReason,
    }));
    const base = (amount: number) => toBaseAmount(amount, inv.exchangeRate) * inv.sign;
    for (const bucket of computeDocumentTotals(lines).byRate) {
      const net = base(bucket.taxable);
      switch (bucket.category) {
        case 'S':
          boxes.box1.net = round2(boxes.box1.net + net);
          boxes.box1.vat = round2(boxes.box1.vat + base(bucket.tax));
          break;
        case 'Z': {
          const box = exemptionReasonByCode(bucket.reasonCode)?.box ?? 3;
          if (box === 4) boxes.box4.net = round2(boxes.box4.net + net);
          else if (box === 2) boxes.box2.net = round2(boxes.box2.net + net);
          else boxes.box3.net = round2(boxes.box3.net + net);
          break;
        }
        case 'E':
          boxes.box5.net = round2(boxes.box5.net + net);
          break;
        case 'O':
          boxes.outOfScope.net = round2(boxes.outOfScope.net + net);
          break;
        case 'LEGACY_ZERO':
          boxes.legacyZero.net = round2(boxes.legacyZero.net + net);
          break;
      }
    }
    for (const l of lines) {
      if (l.taxCategory === 'LEGACY_ZERO') boxes.legacyZero.lineCount += 1;
      else if (l.taxCategory === 'O') boxes.outOfScope.lineCount += 1;
      else if (l.taxCategory === 'LEGACY_STANDARD') {
        boxes.legacyStandard.lineCount += 1;
        boxes.legacyStandard.net = round2(boxes.legacyStandard.net + base(lineNet(l)));
      }
    }
  }
  return boxes;
}
