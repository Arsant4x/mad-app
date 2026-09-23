import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { adjustmentSign } from '../common/adjustment/adjustment-note.util';
import { toBaseAmount } from '../common/currency/base-amount.util';
import { round2 } from '../common/money/rounding';
import { money } from '../common/money/text';
import { computeDocumentTotals, lineNet } from '../common/money/totals';
import { exemptionReasonByCode } from '../common/vat/exemption-reasons';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { rentAmountsOf, rentTaxTreatment, splitGrossAmount, taxPointsOfInstallment } from '../journal/rent-tax-point.util';
import { calendarYear, isLastPeriodOfYear, MONTHLY_PERIOD_THRESHOLD, previousVatPeriod, type ResolvedVatPeriod, resolveVatPeriod, trailingTwelveMonths } from '../common/vat/vat-period.util';
import { CORRECTION_OVERSTATEMENT_YEARS, CORRECTION_UNDERSTATEMENT_LIMIT, judgeCorrection } from '../common/vat/return-correction.util';
import { annualSettlement, applyProportionalDeduction, type InputVatBuckets, proportionalRatio } from '../common/vat/proportional-deduction.util';
import type { InputVatUse } from '@prisma/client';
import { VatDeclarationQueryDto } from './dto/vat-declaration-query.dto';
import { VatFiledDto } from './dto/vat-filed.dto';
import { DeclareVatRatioDto } from './dto/vat-ratio.dto';
import { DeclareVatCorrectionDto } from './dto/vat-correction.dto';
import { formatMessage, MSG } from '../common/i18n/messages';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { pagedFindMany, searchTerm, searchWhere } from '../common/pagination/paged.util';

/** حقولُ البحث المُعلَنة للالتزامات الحكومية (`ق-١٢٣٦`) — العنوانُ والجهة. */
const OBLIGATION_SEARCH_FIELDS = ['title', 'body'] as const;
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

  list(companyId: string, query?: PagedQueryDto) {
    const where: Prisma.GovernmentObligationWhereInput = { ...searchWhere(searchTerm(query), OBLIGATION_SEARCH_FIELDS) };
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // الافتراضياتُ تُبذَر عند أوّل قراءةٍ كما كان — **بعدٍّ لا بقراءة القائمة**، فبحثٌ لا يُصيب شيئاً لا يُعيد البذر.
      if ((await tx.governmentObligation.count()) === 0) {
        await tx.governmentObligation.createMany({
          // companyId omitted on purpose — injected per-row at runtime by the
          // tenant scope extension (see accounts.service.ts for why this cast
          // exists).
          data: STANDARD_OBLIGATIONS.map((o, i) => ({ body: o.body, title: o.title, order: i })) as unknown as Prisma.GovernmentObligationCreateManyInput[],
        });
      }
      return pagedFindMany(query, tx.governmentObligation, { where, orderBy: { order: 'asc' } });
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
    return this.tenantPrisma.runInTenantContext(companyId, (tx) => this.declarationWithinTx(tx, companyId, query));
  }

  /**
   * **علَمُ «قُدِّم»** (`ق-٩١٩`): يُوسَم الربعُ بصافيه كما قُرئ الآن — فتُقاس عليه قراءاتُ الغد.
   * وسمٌ ثانٍ يُحدّث اللحظةَ والصافي (قدّم تصحيحاً فوسم من جديد).
   */
  markFiled(companyId: string, dto: VatFiledDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const declaration = await this.declarationWithinTx(tx, companyId, dto);
      // ⑥A2 — الوسمُ بنوع الفترة ورقمِها معاً، فشهرُ `3` وربعُ `3` وسمان مختلفان لا واحد.
      const period = resolveVatPeriod(dto);
      const filing = await tx.vatReturnFiling.upsert({
        where: {
          companyId_year_periodType_periodNo: { companyId, year: period.year, periodType: period.periodType, periodNo: period.periodNo },
        },
        create: { companyId, year: period.year, periodType: period.periodType, periodNo: period.periodNo, netVat: declaration.netVat, filedAt: new Date(), refundRequested: dto.refundRequested ?? false },
        update: { netVat: declaration.netVat, filedAt: new Date(), refundRequested: dto.refundRequested ?? false },
      });
      return { year: filing.year, periodType: filing.periodType, periodNo: filing.periodNo, filedAt: filing.filedAt, netVat: money(filing.netVat), refundRequested: filing.refundRequested };
    });
  }

  unmarkFiled(companyId: string, dto: VatFiledDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const period = resolveVatPeriod(dto);
      await tx.vatReturnFiling.deleteMany({ where: { year: period.year, periodType: period.periodType, periodNo: period.periodNo } });
      return { year: period.year, periodType: period.periodType, periodNo: period.periodNo, filed: null };
    });
  }

  /**
   * ⑥A3 (`ق-١٣٢٥`) — **إعلانُ تصحيحٍ لإقرارٍ سابق** (م٦٣).
   *
   * ⚠️ **والرفضُ يقول ما يفعل**: نقصٌ يبلغ خمسةَ آلافٍ **يوجب إشعارَ الهيئة خلال عشرين
   * يوماً** ولا يُبتلع هنا — ونظامٌ يقبله يجعل التاجر يظنّ أنه امتثل وهو لم يُشعر.
   */
  declareCorrection(companyId: string, dto: DeclareVatCorrectionDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const declaredIn = resolveVatPeriod(dto);
      const corrected = { year: dto.correctedYear, periodType: dto.correctedPeriodType, periodNo: dto.correctedPeriodNo };
      const verdict = judgeCorrection(declaredIn, corrected, dto.amount, new Date());
      if (!verdict.ok) {
        const message =
          verdict.code === 'NOT_EARLIER'
            ? MSG.vat_correction_not_earlier
            : verdict.code === 'UNDERSTATEMENT_NEEDS_NOTICE'
              ? MSG.vat_correction_needs_notice
              : MSG.vat_correction_time_barred;
        throw new BadRequestException(formatMessage(message, { limit: String(CORRECTION_UNDERSTATEMENT_LIMIT), years: String(CORRECTION_OVERSTATEMENT_YEARS) }));
      }
      const row = await tx.vatReturnCorrection.create({
        data: {
          companyId,
          year: declaredIn.year,
          periodType: declaredIn.periodType,
          periodNo: declaredIn.periodNo,
          correctedYear: corrected.year,
          correctedPeriodType: corrected.periodType,
          correctedPeriodNo: corrected.periodNo,
          amount: dto.amount,
          reason: dto.reason.trim(),
        },
      });
      return { id: row.id, amount: money(Number(row.amount)), reason: row.reason };
    });
  }

  /** ⑥A3 — سحبُ تصحيحٍ أُعلن خطأً، **ما دام إقرارُه لم يُقدَّم بعد**. */
  removeCorrection(companyId: string, id: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const row = await tx.vatReturnCorrection.findUnique({ where: { id } });
      if (!row) throw new NotFoundException(MSG.vat_correction_not_found);
      const filing = await tx.vatReturnFiling.findFirst({ where: { year: row.year, periodType: row.periodType, periodNo: row.periodNo } });
      // ⛔ **ولا يُسحب من إقرارٍ قُدِّم**: ما قُدِّم للهيئة يُصحَّح بتصحيحٍ لا بمحوٍ من سجلِّنا.
      if (filing) throw new ConflictException(MSG.vat_correction_filed_locked);
      await tx.vatReturnCorrection.delete({ where: { id } });
      return { id, removed: true };
    });
  }

  /**
   * ⑥A1 (`ق-١٣٢٥`) — **نسبةُ السنة: المعلَنةُ والمقترَحة معاً.**
   *
   * ⚠️ **والمقترَحُ يحمل تحفّظَه**: يُحسب من السنة الماضية (م٥١/٤)، **ويُعلَن معه أوّلُ
   * مستندٍ في النظام** — فمن انتقل إلينا في منتصف تلك السنة يرى أن الأساس ناقص **قبل أن
   * يُقرّ**. ونسبةٌ من بياناتٍ ناقصة رقمٌ خاطئٌ بلا عَرَض، فلا تُكتب آلياً.
   */
  /**
   * **على مستوى المنشأة بحقّها**: نسبةُ الخصم النسبيّ كسرٌ من توريدات المكلَّف كلِّها (م٥١/٤)،
   * والمكلَّفُ هو المنشأةُ برقمها الضريبيّ الواحد — فنسبةٌ تُحسب من فرعٍ دون فرعٍ **نسبةُ
   * شخصٍ آخر**، ويُخصم بها ما لا يحقّ أو يُمنع ما يحقّ.
   */
  vatRatio(companyId: string, year: number) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const declared = await tx.vatProportionalRatio.findFirst({ where: { year } });
      const previous = calendarYear(year - 1);
      const [invoices, rent, firstInvoice] = await Promise.all([
        tx.invoice.findMany({
          where: { issueDate: { gte: previous.from, lte: previous.to }, ...NOT_REPLACED_REJECTED },
          select: { docType: true, exchangeRate: true, lines: { select: { quantity: true, unitPrice: true, taxRate: true, taxCategory: true, taxExemptionReasonCode: true, taxExemptionReason: true } } },
        }),
        this.rentSection(tx, previous.from, previous.to),
        tx.invoice.findFirst({ orderBy: { issueDate: 'asc' }, select: { issueDate: true } }),
      ]);
      const boxes = salesBoxesFromLines(invoices.map((v) => ({ sign: adjustmentSign(v.docType, 'CREDIT_NOTE'), exchangeRate: Number(v.exchangeRate), lines: v.lines })));
      const taxable = round2(boxes.box1.net + boxes.box3.net + boxes.box4.net + rent.standard + rent.legacyStandard);
      const exempt = round2(boxes.box5.net + rent.exempt + rent.legacyExempt);
      const suggested = proportionalRatio(taxable, exempt);
      // **يغطّي النظامُ السنةَ الماضية كلَّها؟** — أوّلُ مستندٍ فيه قبل بدايتها أو معها.
      const coversPreviousYear = firstInvoice !== null && firstInvoice.issueDate <= previous.from;
      return {
        year,
        declared: declared ? { ratio: Number(declared.ratio), basis: declared.basis, note: declared.note, settledRatio: declared.settledRatio === null ? null : Number(declared.settledRatio), settledAt: declared.settledAt } : null,
        suggestion: {
          basedOnYear: year - 1,
          ratio: suggested,
          taxableSupplies: money(taxable),
          exemptSupplies: money(exempt),
          coversPreviousYear,
          note: suggested === null ? `لا توريداتِ في ${year - 1} في هذا النظام — فالنسبةُ تُقدَّر لسنة ${year} وتُسوّى في إقرارها الأخير (م٥١/٦–٧)` : coversPreviousYear ? `محسوبةٌ من توريدات ${year - 1} كاملةً (م٥١/٤)` : `⚠️ أوّلُ مستندٍ في هذا النظام بعد بداية ${year - 1} — فالأساسُ ناقصٌ، وراجِع دفاترك قبل الإقرار`,
        },
      };
    });
  }

  /** ⑥A1 — إعلانُ النسبة: يُكتب أو يُحدَّث لسنةٍ واحدة (`@@unique([companyId, year])`). */
  declareVatRatio(companyId: string, dto: DeclareVatRatioDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const row = await tx.vatProportionalRatio.upsert({
        where: { companyId_year: { companyId, year: dto.year } },
        create: { companyId, year: dto.year, ratio: dto.ratio, basis: dto.basis, note: dto.note?.trim() || null },
        update: { ratio: dto.ratio, basis: dto.basis, note: dto.note?.trim() || null },
      });
      return { year: row.year, ratio: Number(row.ratio), basis: row.basis, note: row.note };
    });
  }

  /**
   * ⑥A1 — **إقرارُ التسوية السنوية** (م٥١/٧): يُختم أن التاجر رآها وأقرّها، **ولا يُخزَّن
   * حسابُها** — فمصدرُه الصفوفُ نفسُها وقراءتُه اليوم كقراءته غداً.
   */
  settleVatRatio(companyId: string, year: number) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const declared = await tx.vatProportionalRatio.findFirst({ where: { year } });
      if (!declared) throw new NotFoundException(formatMessage(MSG.vat_ratio_not_declared, { year: String(year) }));
      const settlement = await this.annualSettlementWithinTx(tx, year, Number(declared.ratio), declared);
      if (settlement === null) throw new NotFoundException(formatMessage(MSG.vat_ratio_not_declared, { year: String(year) }));
      const row = await tx.vatProportionalRatio.update({ where: { id: declared.id }, data: { settledRatio: settlement.actualRatio, settledAt: new Date() } });
      return { ...settlement, settledRatio: Number(row.settledRatio), settledAt: row.settledAt };
    });
  }

  /**
   * ⑥A1 (`ق-١٣٢٥`) — **تسويةُ الخصم النسبيّ السنوية** (م٥١/٧).
   *
   * «أن يقوم **في نهاية السنة التقويمية** بمقارنة القيَم المستخدمة في الكسر خلال تلك السنة
   * مع القيَم الفعلية للتوريدات … وإجراء التعديل على ضريبة المدخلات **في الإقرار الضريبي
   * النهائي عن تلك السنة**».
   *
   * **وتُحسب من السنة كلِّها لا من الفترة**: توريداتُها الفعلية نسبةً، ومشترياتُها المشتركة
   * وعاءً. **ولا تُخزَّن** — مصدرُها الصفوفُ نفسُها، وقراءتُها اليوم كقراءتها غداً.
   *
   * **على مستوى المنشأة بحقّها**: التسويةُ تعديلٌ على إقرارٍ يُقدَّم عن المنشأة برقمها
   * الضريبيّ الواحد، ونسبتُها من توريدات المكلَّف كلِّها — فتسويةٌ بفرعٍ دون فرعٍ تُعدِّل
   * ضريبةَ مدخلاتٍ بنسبةٍ ليست نسبتَه.
   */
  private async annualSettlementWithinTx(tx: Prisma.TransactionClient, year: number, appliedRatio: number, declared: { settledAt: Date | null } | null) {
    const { from, to } = calendarYear(year);
    const [invoices, purchases, rent] = await Promise.all([
      tx.invoice.findMany({
        where: { issueDate: { gte: from, lte: to }, ...NOT_REPLACED_REJECTED },
        select: { docType: true, exchangeRate: true, lines: { select: { quantity: true, unitPrice: true, taxRate: true, taxCategory: true, taxExemptionReasonCode: true, taxExemptionReason: true } } },
      }),
      tx.purchase.findMany({
        where: { date: { gte: from, lte: to }, excludeFromVat: false, exempt: false, inputVatUse: { in: ['MIXED', 'LEGACY_UNASSIGNED'] } },
        select: { taxAmount: true, docType: true },
      }),
      this.rentSection(tx, from, to),
    ]);
    const boxes = salesBoxesFromLines(invoices.map((v) => ({ sign: adjustmentSign(v.docType, 'CREDIT_NOTE'), exchangeRate: Number(v.exchangeRate), lines: v.lines })));
    const yearTaxable = round2(boxes.box1.net + boxes.box3.net + boxes.box4.net + rent.standard + rent.legacyStandard);
    const yearExempt = round2(boxes.box5.net + rent.exempt + rent.legacyExempt);
    const actualRatio = proportionalRatio(yearTaxable, yearExempt);
    if (actualRatio === null) return null;

    const yearApportionedBase = round2(purchases.reduce((s, p) => s + adjustmentSign(p.docType, 'SUPPLIER_CREDIT_NOTE') * Number(p.taxAmount), 0));
    const settled = annualSettlement(appliedRatio, actualRatio, yearApportionedBase);
    return {
      year,
      appliedRatio,
      actualRatio,
      yearTaxableSupplies: money(yearTaxable),
      yearExemptSupplies: money(yearExempt),
      yearApportionedBase: money(yearApportionedBase),
      appliedDeductible: money(settled.appliedDeductible),
      actualDeductible: money(settled.actualDeductible),
      difference: settled.difference,
      differenceText: money(settled.difference),
      /** أُقرّت التسويةُ بيد التاجر؟ — الحسابُ يبقى كما هو، والإقرارُ أثرٌ يُحفظ. */
      settledAt: declared?.settledAt ?? null,
    };
  }

  /**
   * ⑥A2 (`ق-١٣٢٥`) — **التوريداتُ الخاضعة في الاثني عشر شهراً الماضية، إن تجاوزت الحدَّ.**
   *
   * تُعيد الرقمَ حين يتجاوز أربعين مليوناً، و`null` حين لا يتجاوزه — فلا يُحسب ما لا يُعرض.
   *
   * ⚠️ **ومرحلتان لا واحدة، والسببُ كلفةٌ لا أناقة**: القياسُ الدقيق يقرأ **سطورَ** اثني عشر
   * شهراً (أربعةَ أضعاف ما يقرؤه الإقرارُ الربعيّ) — **وكلُّ قراءةِ إقرارٍ تدفعه**. فيُقاس
   * أوّلاً **حدٌّ أعلى رخيص** بالتجميع في القاعدة: مجموعُ صافي المستندات وصافي الاستحقاق.
   * وهو **حدٌّ أعلى مُثبَت**: الخاضعُ من كلِّ مستندٍ لا يتجاوز صافيَه كلَّه، والإشعارُ الدائن
   * يُجمع موجباً فيزيد البند ولا ينقصه. فإن قصُر الحدُّ الأعلى عن أربعين مليوناً **فالحقيقةُ
   * دونه يقيناً** ولا يُقرأ سطرٌ واحد؛ ولا يُقاس الدقيقُ إلا حيث يمكن أن يُلزِم.
   *
   * **على مستوى المنشأة بحقّها**: حدُّ الفترة الشهرية على «annual value of Taxable Supplies»
   * للمكلَّف — أي المنشأةِ برقمها الضريبيّ الواحد. **فقياسٌ بفرعٍ دون فرعٍ يُنقص التوريداتِ**
   * فلا يبلغ الحدَّ أبداً، ويسكت عن إلزامٍ قائم.
   */
  private async trailingTaxableSupplies(tx: Prisma.TransactionClient, period: ResolvedVatPeriod): Promise<number | null> {
    const window = trailingTwelveMonths(period);
    const [invoiceAgg, rentAgg] = await Promise.all([
      tx.invoice.aggregate({ _sum: { baseSubtotal: true }, where: { issueDate: { gte: window.from, lte: window.to }, ...NOT_REPLACED_REJECTED } }),
      tx.rentAccrual.aggregate({ _sum: { amountNet: true }, where: { date: { gte: window.from, lte: window.to }, managed: false } }),
    ]);
    const upperBound = round2(Number(invoiceAgg._sum.baseSubtotal ?? 0) + Number(rentAgg._sum.amountNet ?? 0));
    if (upperBound <= MONTHLY_PERIOD_THRESHOLD) return null;

    // فوق الحدّ الأعلى: يُقاس الخاضعُ بعينه بالمحرّك نفسِه — الخانةُ `1` والصفرُ والصادرات،
    // ومعها الإيجارُ الخاضع (`taxable`) وحدَه — فلا يدخل معفىً ولا عقارُ تشغيل.
    const [invoices, rentRows] = await Promise.all([
      tx.invoice.findMany({
        where: { issueDate: { gte: window.from, lte: window.to }, ...NOT_REPLACED_REJECTED },
        select: { docType: true, exchangeRate: true, lines: { select: { quantity: true, unitPrice: true, taxRate: true, taxCategory: true, taxExemptionReasonCode: true, taxExemptionReason: true } } },
      }),
      tx.rentAccrual.findMany({ where: { date: { gte: window.from, lte: window.to }, managed: false, taxable: true }, select: { amountNet: true, exchangeRate: true } }),
    ]);
    const boxes = salesBoxesFromLines(invoices.map((v) => ({ sign: adjustmentSign(v.docType, 'CREDIT_NOTE'), exchangeRate: Number(v.exchangeRate), lines: v.lines })));
    const rentStandard = rentRows.reduce((s, r) => s + Number(r.amountNet) * Number(r.exchangeRate), 0);
    const exact = round2(boxes.box1.net + boxes.box3.net + boxes.box4.net + rentStandard);
    return exact > MONTHLY_PERIOD_THRESHOLD ? exact : null;
  }

  /**
   * **على مستوى المنشأة بحقّها**: إقرارُ الضريبة يُقدَّم عن المنشأة برقمها الضريبيّ الواحد —
   * فمبيعاتُ الفروع كلِّها ومشترياتُها تدخل فيه (الإعلانُ على المتحكِّم العامّ أعلاه، ويُعاد هنا
   * على الدالّة التي تقرأ — فحارسُ `ق-٥١٧` يقرأ النطاقَ الذي تقع فيه القراءة).
   */
  private async declarationWithinTx(tx: Prisma.TransactionClient, companyId: string, query: VatDeclarationQueryDto) {
    {
      // ⑥A2 (`ق-١٣٢٥`) — الفترةُ من المصدر الواحد: ربعاً أو شهراً، بمدىً واحدٍ لا جدولَين.
      const period = resolveVatPeriod(query);
      const { from, to } = period;

      // الإقرارُ يقرأ ولا يُرحّل: الاستحقاقُ يُكتب عند الإنشاء والتجديد والقبض وبالكنس اليوميّ
      // (ق-٩٢٧/٥)؛ وما حلّ ولم يُرحَّل بعدُ **يُعدّ هنا** لا يُخفى — فقراءةٌ لا تكتب في الدفتر.
      // المردودةُ التي صدر بدلُها تخرج والبدلُ يدخل — من المصدر الواحد لا بنسخةٍ هنا (`ق-٩٦٧/١`).
      const purchaseSelect = { subtotal: true, taxAmount: true, exempt: true, excludeFromVat: true, docType: true, inputVatUse: true } as const;
      const [invoices, purchaseRows, voidedRows, rent, prepaymentsApplied] = await Promise.all([
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
        // ④A1: دفعاتٌ مقدَّمة طُبِّقت على فواتيرِ توريدٍ صادرةٍ في الربع — مستندُ 386 دخل الإقرارَ في ربع قبضه بضريبته،
        // وفاتورةُ التوريد تدخل هنا بكامل ضريبتها (كما في مستند الهيئة) — فيُطرح ما سبق إقرارُه في ربع التطبيق.
        tx.invoicePrepayment.findMany({
          where: { invoice: { issueDate: { gte: from, lte: to }, ...NOT_REPLACED_REJECTED } },
          select: {
            net: true,
            vat: true,
            prepaymentInvoice: {
              select: { exchangeRate: true, lines: { select: { quantity: true, unitPrice: true, taxRate: true, taxCategory: true, taxExemptionReasonCode: true, taxExemptionReason: true } } },
            },
          },
        }),
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
      const boxes = salesBoxesFromLines([
        ...invoices.map((v) => ({ sign: sign(v.docType), exchangeRate: Number(v.exchangeRate), lines: v.lines })),
        // ④A1: سطورُ مستند 386 المطبَّق بإشارةٍ سالبة — بسعر صرفه كما دخل.
        ...prepaymentsApplied.map((p) => ({ sign: -1 as const, exchangeRate: Number(p.prepaymentInvoice.exchangeRate), lines: p.prepaymentInvoice.lines })),
      ]);
      const prepaymentsAppliedNet = round2(prepaymentsApplied.reduce((s, p) => s + Number(p.net) * Number(p.prepaymentInvoice.exchangeRate), 0));
      const prepaymentsAppliedVat = round2(prepaymentsApplied.reduce((s, p) => s + Number(p.vat) * Number(p.prepaymentInvoice.exchangeRate), 0));
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

      /**
       * ⑥A1 (`ق-١٣٢٥`) — **الخصمُ النسبيّ** (م٥١): ضريبةُ المدخلات تُقسَم على أكياسها، ثم
       * **تُضرب النسبةُ في المشترك وحدَه**. والنسبةُ من `vat_proportional_ratios` للسنة —
       * **تُعلَن ولا تُخترع**؛ وبلا إعلانٍ لمن له توريدٌ معفى يُعلَن حدٌّ حاجب.
       */
      const bucketVat = (use: InputVatUse) => round2(taxablePurchases.filter((p) => p.inputVatUse === use).reduce((s, p) => s + purchaseSign(p) * Number(p.taxAmount), 0));
      const inputVatBuckets: InputVatBuckets = {
        taxableOnly: bucketVat('TAXABLE_ONLY'),
        exemptOnly: bucketVat('EXEMPT_ONLY'),
        mixed: bucketVat('MIXED'),
        legacyUnassigned: bucketVat('LEGACY_UNASSIGNED'),
        legacyCount: taxablePurchases.filter((p) => p.inputVatUse === 'LEGACY_UNASSIGNED').length,
      };
      const declaredRatio = await tx.vatProportionalRatio.findFirst({ where: { year: period.year } });
      /**
       * ⚠️ **ولا نسبةَ لمن لا معفى له**: منشأةٌ خاضعةٌ وحدَها **لا يجب عليها شيء** من م٥١ —
       * فلا تُطالَب بإعلانٍ ولا يُنقص خصمُها. والقياسُ من الفترة نفسِها كما في `ق-١٢٦٠`.
       */
      const proportionalApplies = salesExempt > 0;
      const appliedRatio = proportionalApplies ? (declaredRatio ? Number(declaredRatio.ratio) : null) : 1;
      // بلا نسبةٍ معلَنة **لا يُخصم المشتركُ أصلاً** — ولا يُخصم كاملاً: الحدُّ الحاجب يقول للتاجر ما يفعل.
      const deduction = applyProportionalDeduction(inputVatBuckets, appliedRatio ?? 0);
      const deductibleInputVat = deduction.deductible;

      /**
       * ⑥A1 — **تسويةُ آخر فترةٍ من السنة** (م٥١/٧): تُقارَن النسبةُ المطبَّقة بنسبة السنة
       * **الفعلية** ويُعدَّل الفرقُ هنا. **وتُحسب ولا تُخزَّن** — فمصدرُها توريداتُ السنة نفسِها،
       * وقراءتُها اليوم كقراءتها غداً. والمخزَّنُ **أنها أُقرّت** (`settledAt`).
       */
      const settlement = proportionalApplies && appliedRatio !== null && isLastPeriodOfYear(period) ? await this.annualSettlementWithinTx(tx, period.year, appliedRatio, declaredRatio) : null;

      // وفرقُ التسوية **خصمٌ إضافي** حين يكون موجباً (خُصم أقلُّ مما يحقّ) وردٌّ حين يكون سالباً.
      /**
       * ⑥A3 (`ق-١٣٢٥`) — **تصحيحاتُ إقراراتٍ سابقة تُعلَن في هذا الإقرار** (م٦٣/٢ · خانةُ م٦٢/٢/ي).
       * موجبٌ يزيد المستحقَّ وسالبٌ ينقصه — وإشارةُ الصفّ هي إشارتُه في الصافي.
       */
      const corrections = await tx.vatReturnCorrection.findMany({ where: { year: period.year, periodType: period.periodType, periodNo: period.periodNo }, orderBy: { declaredAt: 'asc' } });
      const correctionsTotal = round2(corrections.reduce((s, c) => s + Number(c.amount), 0));

      const netVat = round2(salesStandardVat - deductibleInputVat - (settlement?.difference ?? 0) + correctionsTotal);

      /**
       * ⑥A3 — **الرصيدُ المرحَّل من الفترة السابقة** (`otherwise excess Tax will be carried forward`).
       *
       * ⚠️ **ومن الفترة السابقة المقدَّمة وحدَها**: الفائضُ يصير رصيداً **حين يُقدَّم الإقرار**،
       * وقراءةُ فترةٍ لم تُقدَّم بعد **قراءةُ عمل** لا واقعةٌ يُبنى عليها رصيد. ولو طُلب ردُّه
       * **فقد خرج** فلا يُرحَّل — ولذلك يُعلَن الطلبُ ولا يُخمَّن.
       */
      const prev = previousVatPeriod(period);
      const prevFiling = await tx.vatReturnFiling.findFirst({ where: { year: prev.year, periodType: prev.periodType, periodNo: prev.periodNo } });
      const carriedForward = prevFiling && !prevFiling.refundRequested && Number(prevFiling.netVat) < 0 ? round2(-Number(prevFiling.netVat)) : 0;
      /** ما يُدفع (أو يُستردّ) بعد استنزال المرحَّل — و`netVat` يبقى صافيَ الفترة نفسِها. */
      const netVatAfterCarryForward = round2(netVat - carriedForward);
      // علَمُ «قُدِّم» (ق-٩١٩): إن وُسم الربعُ فالمقارنةُ بين ما قُدِّم وما يُقرأ الآن — وبلا وسمٍ لا رسالة.
      const filing = await tx.vatReturnFiling.findFirst({ where: { year: period.year, periodType: period.periodType, periodNo: period.periodNo } });
      const filed = filing ? { filedAt: filing.filedAt, netVat: round2(Number(filing.netVat)) } : null;
      const changedSinceFiled = filed !== null && Math.abs(filed.netVat - netVat) >= 0.005;

      // ② **المالُ نصّاً بدقّة صنفه على حدّ الاستجابة** (`ق-١٢٣٥` — أوّلُ نطاق: الإقرار): الحسابُ فوقُ يبقى رقماً
      //    بالمصدر الواحد، والحقولُ تخرج نصّاً بخانتين (`money`) فلا يُعاد تدويرُها في المتصفّح؛ والعدّاتُ أرقامٌ كما هي.
      const exemptSupplies = salesExempt; // يشمل إيجارَ السكنيّ المعفى وقديمَه
      const taxableSupplies = round2(salesStandard + salesZeroRatedDomestic + salesExports); // الخاضعُ بنسبته وبالصفر — كلاهما «خاضع» في القسمة
      const limits: { code: string; severity: 'blocking' | 'warning'; message: string }[] = [];

      /**
       * ⑥A1 (`ق-١٣٢٥`) — **حدُّ `ق-١٢٦٠` رُفع ببناء الخصم النسبيّ**، وحلّ محلَّه حدّان يقولان
       * للتاجر ما يفعل: نسبةٌ لم تُعلَن (حاجب) · ومشترياتٌ بلا إسناد (تنبيه).
       */
      if (proportionalApplies && appliedRatio === null) {
        limits.push({
          code: 'PROPORTIONAL_RATIO_NOT_DECLARED',
          severity: 'blocking',
          message: `لك في هذه الفترة توريداتٌ معفاة (${money(exemptSupplies)}) وخاضعة (${money(taxableSupplies)}) معاً، فضريبةُ المدخلات المشتركة تُخصم بنسبةٍ (م٥١) — ولم تُعلَن نسبةُ سنة ${period.year} بعد، فلا يُخصم المشترَك (${money(deduction.apportionedBase)}) حتى تُعلنها من هذه الشاشة`,
        });
      }
      if (inputVatBuckets.legacyCount > 0 && proportionalApplies) {
        limits.push({
          code: 'INPUT_VAT_USE_UNASSIGNED',
          severity: 'warning',
          message: `${inputVatBuckets.legacyCount} فاتورةَ شراءٍ في هذه الفترة سُجّلت قبل بناء إسناد المدخلات، بضريبةٍ قدرُها ${money(inputVatBuckets.legacyUnassigned)} — تُعامَل معاملةَ المشترك فتُخصم بالنسبة؛ وما كان منها خاصاً بتوريدٍ خاضعٍ حصراً يُصنَّف من بطاقة الشراء ليُخصم كاملاً`,
        });
      }
      if (proportionalApplies && deduction.nonDeductible > 0) {
        limits.push({
          code: 'NON_DEDUCTIBLE_INPUT_VAT_NOT_POSTED',
          severity: 'warning',
          message: `غيرُ القابل للخصم من ضريبة المدخلات في هذه الفترة ${money(deduction.nonDeductible)} — **يُخصم من الإقرار ولا يُرحَّل في الدفتر بعد**: ما زال كاملاً في حساب ضريبة المدخلات، فرصيدُه أعلى مما يُستردّ بهذا المقدار. ومعالجتُه قيداً قرارٌ محاسبيٌّ لم يُحسم بعد (أيُّ حسابِ مصروفٍ ومتى)`,
        });
      }

      /**
       * ⑥A3 (`ق-١٣٢٥`) — **الخانتان `8` و`9` لم تُبنَيا، ويُعلَن ذلك لمن يمسّه وحدَه.**
       *
       * اللائحةُ تؤكّد المفهومين (م٦٢/٢/د الاحتسابُ العكسيّ · م٦٢/٢/و ضريبةُ الاستيراد)،
       * **لكنّ ترقيمَ الخانات وحسابَها قُرئا صورةً لا نصّاً** ومسحُ الباب ⑥ يشترط صراحةً
       * مصادقتَهما **على النموذج الحيّ في بوابة الهيئة قبل أن تُبنى** (`حدودُ المسح` ٢).
       * وبيانُ الاستيراد نفسُه **موجةٌ مسمّاة `٧-ب`** لا سطرٌ هنا.
       *
       * ⚠️ **فيُعلَن ولا يُخمَّن**: إقرارُ مستوردٍ يخرج من هنا **ناقصاً خانتين**، ومن يقرأ
       * رقماً بلا تنبيهٍ يظنّه كاملاً. والتنبيهُ **لمن له مورّدٌ أجنبيّ وحدَه** — فلا يُثقَل
       * به تاجرُ تجزئةٍ محلّيّ لا يستورد.
       */
      /**
       * ⚠️ **وهو إعلانٌ ثابتٌ لا بانرُ إنذار**: لا حقلَ على المورّد يقول «غيرُ مقيم» بعد
       * (`Supplier` بلا `country` — مقيسٌ على المخطَّط؛ و`country` على `Customer` وحدَه)،
       * **فلا يُقاس من يمسّه** — وبانرٌ يُنذر الجميع يُعطَّل (`ق-٦٥`). فيُعلَن نصّاً في
       * موضعه من الردّ: **من يستورد يقرؤه، ومن لا يستورد لا يُثقَل به**.
       */
      const notBuilt = [
        {
          code: 'IMPORT_BOXES',
          note: 'خانتا الاستيراد — الضريبةُ المدفوعة عند الجمارك، والاحتسابُ العكسيّ على ما يُورَّد من خارج المملكة — غير مبنيّتين بعد (المفهومان في المادة ٦٢ فقرة ٢/د و٢/و). فإن كان لك استيراد في هذه الفترة، أكمِل الخانتين في نموذج الهيئة يدوياً. ويسبق بناءهما: حقلٌ يميّز المورّد غير المقيم، ومستندُ بيان الاستيراد، ومصادقةُ ترقيم الخانات على النموذج الحيّ',
        },
      ];

      /**
       * ⑥A2 (`ق-١٣٢٥`) — **حدُّ الأربعين مليوناً يُقاس ويُعلَن ولا يُبدَّل به إعدادُ التاجر.**
       *
       * ف١ تُلزم بالشهرية من تجاوزت توريداتُه الخاضعة أربعين مليوناً في الاثني عشر شهراً
       * الماضية. **ولا يُقلب الإعدادُ آلياً**: الانتقالُ يقع بإشعارٍ من الهيئة له تاريخُ سريان
       * (ف٤ · ف٦) — فنظامٌ يبدّلها بنفسه **يصنع فترةً لم تُقرّها الهيئة**. فيُعلَن للتاجر
       * ليطلب، **ويبقى القرارُ خارجَنا**.
       */
      /**
       * ⚠️ **بالمعرّف لا بـ`findFirst`** — و**الاختبارُ أمسكها قبل الدفع**: أوّلُ صياغةٍ كانت
       * `tx.company.findFirstOrThrow({ select: … })` بلا شرط. و`companies` **بلا `RLS` أصلاً**
       * (`relrowsecurity = false` — مقيسٌ في الموجة ٢٥٦)، **وليس في `TENANT_SCOPED_MODELS`**
       * لأنه يحمل `id` لا `companyId` — فلا امتدادٌ يحقن النطاق ولا سياسةٌ تحجب.
       * ⇒ **فقراءةٌ بلا شرطٍ تُعيد صفَّ منشأةٍ أخرى**، لا فراغاً يُلاحَظ (`§8.5` مقلوبةً).
       */
      const company = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { vatPeriod: true } });
      if (company.vatPeriod === 'QUARTERLY') {
        const trailing = await this.trailingTaxableSupplies(tx, period);
        if (trailing !== null) {
          limits.push({
            code: 'MONTHLY_VAT_PERIOD_REQUIRED',
            severity: 'warning',
            message: `توريداتُك الخاضعة في الاثني عشر شهراً المنتهية بنهاية هذه الفترة ${money(trailing)} — وهي فوق أربعين مليوناً، والفترةُ الضريبية عندئذٍ شهرية (مادّةُ الفترة الضريبية ف١). وإعدادُك ربعيّ: الانتقالُ يقع بإشعارٍ من الهيئة لا من النظام، فراجِعها`,
          });
        }
      }

      const box = (b: { net: number; vat?: number }) => ('vat' in b && b.vat !== undefined ? { net: money(b.net), vat: money(b.vat) } : { net: money(b.net) });
      const counted = (c: { lineCount: number; net: number }) => ({ lineCount: c.lineCount, net: money(c.net) });
      return {
        year: period.year,
        /** ⑥A2 — الفترةُ كما حُلَّت: نوعُها ورقمُها ونصُّها، **ومطابقتُها لإعداد التاجر**. */
        periodType: period.periodType,
        periodNo: period.periodNo,
        periodLabel: period.label,
        companyVatPeriod: company.vatPeriod,
        periodMatchesCompany: period.periodType === company.vatPeriod,
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
        /**
         * ⑥A1 (`ق-١٣٢٥`) — **الخصمُ النسبيّ بأجزائه، فيُقرأ منه كيف بلغ ما بلغ** (م٥١).
         * و`ratio = null` تعني «لم تُعلَن بعد» لا «صفر» — ومعها حدٌّ حاجب.
         */
        proportional: {
          applies: proportionalApplies,
          ratio: appliedRatio,
          basis: declaredRatio?.basis ?? null,
          buckets: {
            taxableOnly: money(inputVatBuckets.taxableOnly),
            exemptOnly: money(inputVatBuckets.exemptOnly),
            mixed: money(inputVatBuckets.mixed),
            legacyUnassigned: money(inputVatBuckets.legacyUnassigned),
            legacyCount: inputVatBuckets.legacyCount,
          },
          apportionedBase: money(deduction.apportionedBase),
          apportionedDeductible: money(deduction.apportionedDeductible),
          deductibleInputVat: money(deductibleInputVat),
          nonDeductibleInputVat: money(deduction.nonDeductible),
          settlement,
        },
        netVat: money(netVat),
        /**
         * ⑥A3 (`ق-١٣٢٥`) — المرحَّلُ والتصحيحاتُ بأصلهما، **و`netVat` يبقى صافيَ الفترة نفسِها**
         * فلا يتغيّر معناه عمّا يُقاس عليه «تغيّر بعد التقديم».
         */
        /** ⑥A3 — ما لم يُبنَ من الإقرار، **معلَناً في وجهه لا في وثيقةٍ بعيدة**. */
        notBuilt,
        carriedForward: money(carriedForward),
        carriedForwardFrom: carriedForward > 0 ? { year: prev.year, periodType: prev.periodType, periodNo: prev.periodNo } : null,
        netVatAfterCarryForward: money(netVatAfterCarryForward),
        corrections: {
          total: money(correctionsTotal),
          rows: corrections.map((c) => ({
            id: c.id,
            correctedYear: c.correctedYear,
            correctedPeriodType: c.correctedPeriodType,
            correctedPeriodNo: c.correctedPeriodNo,
            amount: money(Number(c.amount)),
            reason: c.reason,
            declaredAt: c.declaredAt,
          })),
        },
        invoiceCount: invoices.length,
        purchaseCount: purchases.length,
        /** ④A1: ما طُرح في هذا الربع من دفعاتٍ مقدَّمة سبق إقرارُها في ربع قبضها — عدّاً ووعاءً وضريبةً. */
        prepaymentsApplied: { count: prepaymentsApplied.length, net: money(prepaymentsAppliedNet), vat: money(prepaymentsAppliedVat) },
        filed: filed ? { filedAt: filed.filedAt, netVat: money(filed.netVat) } : null,
        changedSinceFiled,
        /** حدودٌ معلَنة على هذا الإقرار — فارغةٌ حين لا حدّ (`ق-١٢٦٠`). */
        limits,
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
