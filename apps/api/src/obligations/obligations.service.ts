import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { adjustmentSign } from '../common/adjustment/adjustment-note.util';
import { toBaseAmount } from '../common/currency/base-amount.util';
import { round2 } from '../common/money/rounding';
import { money } from '../common/money/text';
import { computeDocumentTotals, lineNet } from '../common/money/totals';
import { exemptionReasonByCode } from '../common/vat/exemption-reasons';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { exemptNetOf, rentAmountsOf, rentTaxTreatment, type RentTaxTreatment, sharePercentOf, splitGrossAmount, taxPointsOfInstallment } from '../journal/rent-tax-point.util';
import { calendarYear, isLastPeriodOfYear, MONTHLY_PERIOD_THRESHOLD, previousVatPeriod, type ResolvedVatPeriod, resolveVatPeriod, trailingTwelveMonths } from '../common/vat/vat-period.util';
import { CORRECTION_OVERSTATEMENT_YEARS, CORRECTION_UNDERSTATEMENT_LIMIT, filedChangeNote, judgeCorrection } from '../common/vat/return-correction.util';
import { annualSettlement, applyProportionalDeduction, type InputVatBuckets, proportionalRatio } from '../common/vat/proportional-deduction.util';
import type { InputVatUse } from '@mad-app/db';
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
import { reconcileNonDeductibleVat } from '../purchases/non-deductible-vat.util';
import { companyToday } from '../common/company-day.util';
import { LINE_ORDER } from '../common/document-lines.util';

/**
 * ⭐ **قسمُ الإيجار في الإقرار** (`ق-٩١٧` · `ق-٩١٨` · `ق-٩٢٦`).
 *
 * **المصدرُ صفوفُ الاستحقاق** (`rent_accruals`) بتاريخ نقطة الضريبة — الصفوفُ نفسُها التي
 * رُحِّل منها الدفتر، فيستوي الاثنان بالبناء (`ق-٩١٥`). وثلاثةٌ **تُعدّ وتُعلَن بنصّها**:
 *
 *   ① **ما سبق البناء** (أقساطٌ على أساس القبض ودفعاتٌ بلا قسطٍ سبقت): يُحسب هنا بالمحرّك
 *      نفسِه (`rent-tax-point.util`) ويدخل الإقرار **ولا يُرحَّل** — «في الإقرار لا في
 *      الدفتر»، الاستثناءُ الوحيد من «الدفتر = الإقرار» (`ق-٩٢٦`).
 *   ② **عقودٌ قديمة غيرُ مصنَّفة**، أو على عقار تشغيلٍ لم يُعلَن مؤجّرُها: لا تدخل — تُعدّ حتى تُعلَن بيدٍ (`ق-٨٩٨`).
 *   ③ ⚖️ **عقودٌ مؤجّرُها المالك** (السؤال ٥٧٧ · `ق-١٦٠٠`): الإيجارُ توريدُ المالك — يُعدّ المقبوضُ له ولا يدخل؛ **وعمولةُ
 *      المنشأة عليه توريدٌ خاضعٌ يدخل الخانةَ ١ بضريبته** بتاريخ القبض، من صفّ الدفعة نفسِها. (وصفوفُ «تشغيل» القديمة
 *      التي كُتبت قبل الحقل تُعدّ كما كانت.)
 */
export interface RentDeclarationSection {
  /** الخاضعُ من الاستحقاق (صافياً) وضريبتُه — صفوفٌ بقيد. */
  standard: number;
  standardVat: number;
  /** المعفى (سكنيٌّ) من الاستحقاق — صفُّ «المبيعات المعفاة». */
  exempt: number;
  /** صفوفُ «تشغيل» كُتبت قبل حقل المؤجّر، وقديمُ ما سبق البناء لعقدٍ مؤجّرُه المالك — تُعدّ ولا تدخل. */
  managedExcluded: number;
  managedCount: number;
  /** ⚖️ عمولةُ المنشأة على قبض إيجار المالكين (صافياً) وضريبتُها — تدخل الخانةَ ١. */
  commissionStandard: number;
  commissionStandardVat: number;
  /** ⚖️ ما قُبض لعقودٍ مؤجّرُها المالك (بضريبة المالك إن وُجدت) وعددُ دفعاته — يُعدّ ولا يدخل. */
  ownerCollected: number;
  ownerCount: number;
  /**
   * ⚖️ **المطالباتُ والخصوماتُ من التأمين الخاضعة** (الأسئلة ٤٩ و٥١ و٤١٣ و٤١٤ · `ق-١٦٠٠`) — صافياً وضريبتُها، تدخل الخانةَ ١:
   * المطالبةُ بتاريخ إصدارها ويُطرح إسقاطُها بتاريخه، والخصمُ بتاريخ تسوية التأمين — من الصفوف نفسِها التي رُحّل منها القيد.
   */
  chargesStandard: number;
  chargesStandardVat: number;
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
          select: { docType: true, exchangeRate: true, lines: { ...LINE_ORDER, select: { quantity: true, unitPrice: true, discount: true, taxRate: true, taxCategory: true, taxExemptionReasonCode: true, taxExemptionReason: true } } },
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
   * ⑥A1 — **معاينةُ التسوية السنوية** (م٥١/٧): تُحسب من الصفوف ولا تُكتب — فمصدرُها توريداتُ السنة نفسِها، وقراءتُها اليوم
   * كقراءتها غداً. والإقرارُ بها حدثٌ (`settleVatRatio`).
   */
  vatSettlementPreview(companyId: string, year: number) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const declared = await tx.vatProportionalRatio.findFirst({ where: { year } });
      if (!declared) throw new NotFoundException(formatMessage(MSG.vat_ratio_not_declared, { year: String(year) }));
      const settlement = await this.annualSettlementWithinTx(tx, year, Number(declared.ratio), declared);
      if (settlement === null) throw new NotFoundException(formatMessage(MSG.vat_ratio_not_declared, { year: String(year) }));
      return settlement;
    });
  }

  /**
   * ⚖️ `ق-١٣٦٠` — **التسويةُ السنويةُ حدثٌ** (م٥١/٧ · بنصّ المالك: «والتسويةُ السنويةُ حدثٌ مثلُه»): بعد انقضاء السنة وإقفال فتراتها
   * يُعاد غيرُ القابل للخصم من المشترك **بنسبة السنة الفعلية** — **بتاريخ الحدث** — ولا يُرفع إلا بحدثٍ عاكسٍ بتاريخه. والختمُ
   * القديم (`settledAt`) صار أثرَ الحدث لا بديلَه؛ والمعاينةُ بلا حدث في `vatSettlementPreview`.
   */
  settleVatRatio(companyId: string, year: number) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const declared = await tx.vatProportionalRatio.findFirst({ where: { year } });
      if (!declared) throw new NotFoundException(formatMessage(MSG.vat_ratio_not_declared, { year: String(year) }));
      const { from, to } = calendarYear(year);
      const today = await companyToday(tx, companyId);
      if (to.getTime() >= today.getTime()) throw new ConflictException(formatMessage(MSG.vat_adjustment_year_open, { year: String(year) }));
      const settlement = await this.annualSettlementWithinTx(tx, year, Number(declared.ratio), declared);
      if (settlement === null) throw new NotFoundException(formatMessage(MSG.vat_ratio_not_declared, { year: String(year) }));

      await this.lockVatClosings(tx, companyId);
      const live = await tx.vatReturnClosing.findFirst({ where: { kind: 'ANNUAL_ADJUSTMENT', year, reversedBy: { is: null } }, select: { id: true } });
      if (live) throw new ConflictException(formatMessage(MSG.vat_adjustment_exists, { year: String(year) }));
      const open = await this.mixedDocumentsOutsideClosings(tx, from, to);
      if (open > 0) throw new ConflictException(formatMessage(MSG.vat_adjustment_periods_open, { count: String(open), year: String(year) }));

      const event = await tx.vatReturnClosing.create({
        data: { companyId, kind: 'ANNUAL_ADJUSTMENT', year, periodFrom: from, periodTo: to, ratio: settlement.actualRatio, date: today, documentsCount: 0, untrackedCount: 0, baseAmount: 0 },
        select: { id: true },
      });
      const applied = await this.reconcileMixedRange(tx, companyId, { from, to, date: today, trigger: 'VAT_ANNUAL_ADJUSTMENT', closingId: event.id, label: `التسويةُ السنوية ${year}` });
      const adjustment = await this.finishClosing(tx, event.id, applied);
      const row = await tx.vatProportionalRatio.update({ where: { id: declared.id }, data: { settledRatio: settlement.actualRatio, settledAt: new Date() } });
      return { ...settlement, settledRatio: Number(row.settledRatio), settledAt: row.settledAt, adjustment };
    });
  }

  /**
   * ⚖️ **`ق-١٣٦٠` — «إقفالُ الإقرار» حدثٌ مستقلٌّ بتاريخه** (الخيارُ (ب) بحكم المالك).
   *
   * بنصّ المالك: «حدثٌ مستقلٌّ «إقفالُ الإقرار» بتاريخ الحدث نفسِه في أوّل فترةٍ مفتوحة. ⇒ فتغيّرُ التقدير يُثبَت في فترته لا بأثرٍ
   * رجعيّ، ولا يُعلَّق على علَمٍ يرفعه التاجرُ بيده.» — فبعد انقضاء الفترة يُرحَّل غيرُ القابل للخصم من المشترك لمستنداتها **بنسبة
   * الفترة كما يحسبها الإقرار** (واحدٌ لمن لا معفى له فيها · المعلَنةُ لغيره؛ وبلا إعلانٍ لمن له معفى يُرفض الإقفالُ مسمّىً) إلى تكلفة
   * ما اشتُري بقاعدة الانتشار — **بتاريخ اليوم** (يومُ الحدث)، والقفلُ يحكم تاريخَه كأيّ قيد.
   *
   * **على مستوى المنشأة بحقّها**: الإقرارُ عن المنشأة برقمها الضريبيّ الواحد، فإقفالُه يمسّ مستنداتِها كلَّها لا فرعَ القارئ.
   */
  closeVatReturn(companyId: string, dto: VatDeclarationQueryDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const period = resolveVatPeriod(dto);
      const today = await companyToday(tx, companyId);
      if (period.to.getTime() >= today.getTime()) throw new ConflictException(formatMessage(MSG.vat_closing_period_open, { period: period.label }));

      await this.lockVatClosings(tx, companyId);
      const overlapping = await tx.vatReturnClosing.findFirst({
        where: { kind: 'CLOSING', periodFrom: { lte: period.to }, periodTo: { gte: period.from }, reversedBy: { is: null } },
        select: { year: true, periodType: true, periodNo: true },
      });
      if (overlapping) {
        const same = overlapping.year === period.year && overlapping.periodType === period.periodType && overlapping.periodNo === period.periodNo;
        if (same) throw new ConflictException(formatMessage(MSG.vat_closing_exists, { period: period.label }));
        const other = resolveVatPeriod(overlapping.periodType === 'MONTHLY' ? { year: overlapping.year, month: overlapping.periodNo! } : { year: overlapping.year, quarter: overlapping.periodNo! });
        throw new ConflictException(formatMessage(MSG.vat_closing_overlap, { period: period.label, other: other.label }));
      }

      const declaration = await this.declarationWithinTx(tx, companyId, dto);
      const ratio = declaration.proportional.ratio;
      if (ratio === null) throw new ConflictException(formatMessage(MSG.vat_closing_ratio_not_declared, { period: period.label, year: String(period.year) }));

      const event = await tx.vatReturnClosing.create({
        data: {
          companyId,
          kind: 'CLOSING',
          year: period.year,
          periodType: period.periodType,
          periodNo: period.periodNo,
          periodFrom: period.from,
          periodTo: period.to,
          ratio,
          date: today,
          documentsCount: 0,
          untrackedCount: 0,
          baseAmount: 0,
        },
        select: { id: true },
      });
      const applied = await this.reconcileMixedRange(tx, companyId, { from: period.from, to: period.to, date: today, trigger: 'VAT_RETURN_CLOSING', closingId: event.id, label: `إقفالُ ${period.label}` });
      return this.finishClosing(tx, event.id, applied);
    });
  }

  /**
   * ⚖️ `ق-١٣٦٠` — **العكسُ حدثٌ بتاريخه** («ولا يُرفع إلا بحدثٍ عاكسٍ بتاريخه»): صفٌّ ثانٍ يشير إلى ما يعكسه (فريد)، ويُعاد به
   * المشتركُ إلى ما كان قبل المعكوس — بتاريخ اليوم. والعكسُ لا يُعكس، وإقفالٌ تعتمد عليه تسويةٌ سنويةٌ قائمة يُعكس بعدها.
   */
  reverseVatClosing(companyId: string, id: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      await this.lockVatClosings(tx, companyId);
      const target = await tx.vatReturnClosing.findUnique({ where: { id }, include: { reversedBy: { select: { id: true } } } });
      if (!target) throw new NotFoundException(MSG.vat_closing_not_found);
      if (target.kind === 'REVERSAL') throw new ConflictException(MSG.vat_closing_reversal_final);
      if (target.reversedBy) throw new ConflictException(MSG.vat_closing_already_reversed);
      if (target.kind === 'CLOSING') {
        const adjustment = await tx.vatReturnClosing.findFirst({
          where: { kind: 'ANNUAL_ADJUSTMENT', periodFrom: { lte: target.periodTo }, periodTo: { gte: target.periodFrom }, reversedBy: { is: null } },
          select: { year: true },
        });
        if (adjustment) throw new ConflictException(formatMessage(MSG.vat_closing_adjustment_first, { year: String(adjustment.year) }));
      }
      const today = await companyToday(tx, companyId);
      const event = await tx.vatReturnClosing.create({
        data: {
          companyId,
          kind: 'REVERSAL',
          year: target.year,
          periodType: target.periodType,
          periodNo: target.periodNo,
          periodFrom: target.periodFrom,
          periodTo: target.periodTo,
          ratio: target.ratio,
          date: today,
          reversesId: target.id,
          documentsCount: 0,
          untrackedCount: 0,
          baseAmount: 0,
        },
        select: { id: true },
      });
      const applied = await this.reconcileMixedRange(tx, companyId, { from: target.periodFrom, to: target.periodTo, date: today, trigger: 'VAT_RETURN_CLOSING_REVERSAL', closingId: event.id, label: 'عكسُ إقفال' });
      // التسويةُ السنويةُ المعكوسة: ختمُها يُرفع معها — فالإقرارُ لا يقول «أُقرّت» عن تسويةٍ عُكست.
      if (target.kind === 'ANNUAL_ADJUSTMENT') await tx.vatProportionalRatio.updateMany({ where: { year: target.year }, data: { settledRatio: null, settledAt: null } });
      return this.finishClosing(tx, event.id, applied);
    });
  }

  /** ⚖️ `ق-١٣٦٠` — أحداثُ الإقفال لسنةٍ (إقفالٌ · تسويةٌ · عكس) بترتيب وقوعها. */
  listVatClosings(companyId: string, year: number) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const rows = await tx.vatReturnClosing.findMany({ where: { year }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], include: { reversedBy: { select: { id: true } } } });
      return rows.map((r) => this.closingView(r));
    });
  }

  private closingView(r: {
    id: string;
    kind: string;
    year: number;
    periodType: string | null;
    periodNo: number | null;
    periodFrom: Date;
    periodTo: Date;
    ratio: Prisma.Decimal;
    date: Date;
    reversesId: string | null;
    documentsCount: number;
    untrackedCount: number;
    baseAmount: Prisma.Decimal;
    reversedBy?: { id: string } | null;
  }) {
    return {
      id: r.id,
      kind: r.kind,
      year: r.year,
      periodType: r.periodType,
      periodNo: r.periodNo,
      periodFrom: r.periodFrom,
      periodTo: r.periodTo,
      ratio: Number(r.ratio),
      date: r.date,
      reversesId: r.reversesId,
      reversedById: r.reversedBy?.id ?? null,
      documentsCount: r.documentsCount,
      untrackedCount: r.untrackedCount,
      baseAmount: money(Number(r.baseAmount)),
    };
  }

  /** ⚖️ `ق-١٣٦٠` — أحداثُ الإقفال تُكتب واحداً بعد واحد في المنشأة: قفلٌ استشاريٌّ في المعاملة — «الحيُّ الذي لم يُعكس» لا يعبّر عنه قيدٌ فريد. */
  private async lockVatClosings(tx: Prisma.TransactionClient, companyId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'vat_return_closing:' + companyId}))`;
  }

  /**
   * مستنداتٌ مشتركةٌ متتبَّعةٌ حيّةٌ في المدى لا يغطّيها إقفالٌ حيّ — التسويةُ السنويةُ تنتظر إقفالَها.
   *
   * **على مستوى المنشأة بحقّها**: التسويةُ السنويةُ تعديلٌ على إقرار المنشأة برقمها الضريبيّ الواحد (م٥١/٧)، فمستندٌ في فرعٍ لا يراه
   * القارئ يبقى مستنداً في سنة المكلَّف — وقصرُها على فروعه يُسوّي سنةً ناقصة.
   */
  private async mixedDocumentsOutsideClosings(tx: Prisma.TransactionClient, from: Date, to: Date): Promise<number> {
    const [docs, closings] = await Promise.all([
      tx.purchase.findMany({
        where: { date: { gte: from, lte: to }, inputVatUse: { in: ['MIXED', 'LEGACY_UNASSIGNED'] }, nonDeductibleTracked: true, exempt: false, excludeFromVat: false, voidedAt: null, baseTaxAmount: { gt: 0 } },
        select: { date: true },
      }),
      tx.vatReturnClosing.findMany({ where: { kind: 'CLOSING', periodFrom: { lte: to }, periodTo: { gte: from }, reversedBy: { is: null } }, select: { periodFrom: true, periodTo: true } }),
    ]);
    return docs.filter((d) => !closings.some((c) => c.periodFrom.getTime() <= d.date.getTime() && d.date.getTime() <= c.periodTo.getTime())).length;
  }

  /**
   * يُرحّل فرقَ غير القابل للخصم لكلِّ مستندٍ مشتركٍ في المدى — بالدالّة القائمة نفسِها (`reconcileNonDeductibleVat` — فرقٌ لا مطلق)،
   * فتقرأ النسبةَ النافذة بعد كتابة الحدث. وما سبق التتبّعَ يُعدّ ولا يُحوَّل.
   *
   * **على مستوى المنشأة بحقّها**: إقفالُ الإقرار حدثٌ على فترة المكلَّف برقمه الضريبيّ الواحد — مستنداتُها كلُّها في كلِّ فرع؛ وإقفالٌ
   * يُقصر على فروع القارئ يترك مشتركَ الفروع الأخرى في `1250` والإقرارُ يقول إن الفترةَ أُقفلت.
   */
  private async reconcileMixedRange(
    tx: Prisma.TransactionClient,
    companyId: string,
    a: { from: Date; to: Date; date: Date; trigger: 'VAT_RETURN_CLOSING' | 'VAT_RETURN_CLOSING_REVERSAL' | 'VAT_ANNUAL_ADJUSTMENT'; closingId: string; label: string },
  ): Promise<{ documentsCount: number; untrackedCount: number; baseAmount: number }> {
    const docs = await tx.purchase.findMany({
      where: { date: { gte: a.from, lte: a.to }, inputVatUse: { in: ['MIXED', 'LEGACY_UNASSIGNED'] }, exempt: false, excludeFromVat: false },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
      select: { id: true, nonDeductibleTracked: true, voidedAt: true, baseTaxAmount: true },
    });
    let documentsCount = 0;
    let untrackedCount = 0;
    let baseAmount = 0;
    for (const d of docs) {
      if (!d.nonDeductibleTracked) {
        if (d.voidedAt === null && Number(d.baseTaxAmount) > 0) untrackedCount += 1;
        continue;
      }
      const ev = await reconcileNonDeductibleVat(tx, companyId, d.id, { date: a.date, trigger: a.trigger, vatReturnClosingId: a.closingId, labelSuffix: a.label });
      if (!ev) continue;
      documentsCount += 1;
      baseAmount = round2(baseAmount + ev.baseInventory + ev.baseCogs + ev.baseExpense + ev.baseClearing);
    }
    return { documentsCount, untrackedCount, baseAmount };
  }

  /**
   * Network settlement commissions whose VAT the ledger debits to input VAT, shaped as mixed purchase inputs:
   * a settlement counts on its own date, and a voided one counts again with a negative sign on its void entry date.
   * Company wide by design: the return is filed for the company under its one VAT number, so every branch's settlements count.
   */
  private async networkFeeInputs(tx: Prisma.TransactionClient, from: Date, to: Date) {
    const select = { feeAmount: true, feeVatAmount: true } as const;
    const [posted, voided] = await Promise.all([
      tx.networkSettlement.findMany({ where: { date: { gte: from, lte: to }, feeVatAmount: { gt: 0 } }, select }),
      tx.networkSettlement.findMany({ where: { status: 'VOID', feeVatAmount: { gt: 0 }, voidJournalEntry: { is: { date: { gte: from, lte: to } } } }, select }),
    ]);
    const asInput = (s: { feeAmount: Prisma.Decimal; feeVatAmount: Prisma.Decimal }, voidSign: number) => ({
      subtotal: s.feeAmount,
      taxAmount: s.feeVatAmount,
      exempt: false,
      excludeFromVat: false,
      docType: 'PURCHASE' as const,
      inputVatUse: 'MIXED' as const,
      nonDeductibleTracked: false,
      voidSign,
    });
    return [...posted.map((s) => asInput(s, 1)), ...voided.map((s) => asInput(s, -1))];
  }

  private async finishClosing(tx: Prisma.TransactionClient, id: string, applied: { documentsCount: number; untrackedCount: number; baseAmount: number }) {
    const row = await tx.vatReturnClosing.update({
      where: { id },
      data: { documentsCount: applied.documentsCount, untrackedCount: applied.untrackedCount, baseAmount: applied.baseAmount },
      include: { reversedBy: { select: { id: true } } },
    });
    return this.closingView(row);
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
        select: { docType: true, exchangeRate: true, lines: { ...LINE_ORDER, select: { quantity: true, unitPrice: true, discount: true, taxRate: true, taxCategory: true, taxExemptionReasonCode: true, taxExemptionReason: true } } },
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

    const networkFees = await this.networkFeeInputs(tx, from, to);
    const yearApportionedBase = round2(
      purchases.reduce((s, p) => s + adjustmentSign(p.docType, 'SUPPLIER_CREDIT_NOTE') * Number(p.taxAmount), 0) +
        networkFees.reduce((s, f) => s + f.voidSign * Number(f.taxAmount), 0),
    );
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
    // ⚖️ وعمولةُ المنشأة على إيجار المالكين توريدٌ خاضعٌ لها (السؤال ٥٧٧) — تدخل الحدَّين معاً.
    const [invoiceAgg, rentAgg, commissionAgg] = await Promise.all([
      tx.invoice.aggregate({ _sum: { baseSubtotal: true }, where: { issueDate: { gte: window.from, lte: window.to }, ...NOT_REPLACED_REJECTED } }),
      tx.rentAccrual.aggregate({ _sum: { amountNet: true }, where: { date: { gte: window.from, lte: window.to }, managed: false } }),
      tx.rentPayment.aggregate({ _sum: { baseCommission: true }, where: { date: { gte: window.from, lte: window.to }, baseCommission: { not: null } } }),
    ]);
    const commissionNet = Number(commissionAgg._sum.baseCommission ?? 0);
    const upperBound = round2(Number(invoiceAgg._sum.baseSubtotal ?? 0) + Number(rentAgg._sum.amountNet ?? 0) + commissionNet);
    if (upperBound <= MONTHLY_PERIOD_THRESHOLD) return null;

    // فوق الحدّ الأعلى: يُقاس الخاضعُ بعينه بالمحرّك نفسِه — الخانةُ `1` والصفرُ والصادرات،
    // ومعها الإيجارُ الخاضع (`taxable`) وحدَه — فلا يدخل معفىً ولا عقارُ تشغيل.
    const [invoices, rentRows] = await Promise.all([
      tx.invoice.findMany({
        where: { issueDate: { gte: window.from, lte: window.to }, ...NOT_REPLACED_REJECTED },
        select: { docType: true, exchangeRate: true, lines: { ...LINE_ORDER, select: { quantity: true, unitPrice: true, discount: true, taxRate: true, taxCategory: true, taxExemptionReasonCode: true, taxExemptionReason: true } } },
      }),
      tx.rentAccrual.findMany({ where: { date: { gte: window.from, lte: window.to }, managed: false, taxable: true }, select: { amountNet: true, exchangeRate: true } }),
    ]);
    const boxes = salesBoxesFromLines(invoices.map((v) => ({ sign: adjustmentSign(v.docType, 'CREDIT_NOTE'), exchangeRate: Number(v.exchangeRate), lines: v.lines })));
    const rentStandard = rentRows.reduce((s, r) => s + Number(r.amountNet) * Number(r.exchangeRate), 0);
    const exact = round2(boxes.box1.net + boxes.box3.net + boxes.box4.net + rentStandard + commissionNet);
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
      const purchaseSelect = { subtotal: true, taxAmount: true, exempt: true, excludeFromVat: true, docType: true, inputVatUse: true, nonDeductibleTracked: true } as const;
      const [invoices, purchaseRows, voidedRows, rent, prepaymentsApplied] = await Promise.all([
        // ⑧ الإقرارُ يقرأ **السطورَ** لا مجموعَ الفاتورة (`ق-١٢٢٣`): كان كلُّ مبيعٍ في الخانة `1` بمجموعه ولو كان
        // فيه سطرٌ بنسبة الصفر أو معفى — فلا يصحّ إقرارُ صيدليةٍ ولا مصدِّر. والمبالغُ بالريال عبر سعر الفاتورة.
        tx.invoice.findMany({
          where: { issueDate: { gte: from, lte: to }, ...NOT_REPLACED_REJECTED },
          select: {
            docType: true,
            exchangeRate: true,
            lines: { ...LINE_ORDER, select: { quantity: true, unitPrice: true, discount: true, taxRate: true, taxCategory: true, taxExemptionReasonCode: true, taxExemptionReason: true } },
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
              select: { exchangeRate: true, lines: { ...LINE_ORDER, select: { quantity: true, unitPrice: true, discount: true, taxRate: true, taxCategory: true, taxExemptionReasonCode: true, taxExemptionReason: true } } },
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
      // (يُحسب ويُعلَن)؛ والسكنيُّ صفُّ المعفى (م٦٢/٢/ز). ⚖️ وعمولةُ المنشأة على إيجار المالكين خاضعةٌ (السؤال ٥٧٧).
      // ⚖️ والمطالباتُ والخصوماتُ من التأمين الخاضعة (الأسئلة ٤٩ و٥١ و٤١٣ و٤١٤) كذلك.
      const salesStandard = round2(boxes.box1.net + rent.standard + rent.legacyStandard + rent.commissionStandard + rent.chargesStandard);
      const salesStandardVat = round2(boxes.box1.vat + rent.standardVat + rent.legacyStandardVat + rent.commissionStandardVat + rent.chargesStandardVat);
      const salesExempt = round2(boxes.box5.net + rent.exempt + rent.legacyExempt);
      const salesZeroRatedDomestic = boxes.box3.net;
      const salesExports = boxes.box4.net;
      const totalSales = round2(salesStandard + boxes.box2.net + salesZeroRatedDomestic + salesExports + salesExempt);

      // A purchase with no valid tax invoice is dropped from the declaration
      // entirely (matching the mockup): its input VAT can't be reclaimed, so it
      // must not reduce the net VAT owed. Reported separately for transparency.
      const declarablePurchases = purchases.filter((p) => !p.excludeFromVat);
      const excludedPurchases = purchases.filter((p) => p.excludeFromVat);

      // The acquirer's commission VAT is posted to input VAT, so it enters box 7 as a general overhead input.
      const networkFees = await this.networkFeeInputs(tx, from, to);
      const taxablePurchases = [...declarablePurchases.filter((p) => !p.exempt), ...networkFees];
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
      /**
       * ⚖️ `ق-١٣٤٢` — **المنسوبُ إلى المعفى وحدَه يُرحَّل إلى تكلفة ما اشتُري عند الشراء نفسِه** (`non-deductible-vat.util`)،
       * فلا يبقى في حساب ضريبة المدخلات. **والباقي فيه يُعلَن بقسمَيه**: المشتركُ غيرُ المخصوم (محبوسٌ على قرار ترحيله عند
       * إقفال الإقرار — لم يُحسم) · ومستنداتٌ منسوبةٌ إلى المعفى سبقت البناء (تُعدّ ولا تُحوَّل — `ق-١١٧٨`).
       */
      // ⚖️ ق-١٣٦٠ — وما رحّله إقفالُ الفترة (أو تسويتُها السنوية) من المشترك لم يعد في 1250: يُطرح بما وُضع فعلاً لمستندات الفترة.
      const mixedPosted = await tx.nonDeductibleVatEventLine.aggregate({
        where: { event: { purchase: { date: { gte: period.from, lte: period.to }, inputVatUse: { in: ['MIXED', 'LEGACY_UNASSIGNED'] } } } },
        _sum: { baseAmount: true },
      });
      const closing = await tx.vatReturnClosing.findFirst({
        where: { kind: 'CLOSING', periodFrom: { lte: period.to }, periodTo: { gte: period.from }, reversedBy: { is: null } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, date: true, ratio: true },
      });
      const apportionedNotDeducted = round2(deduction.apportionedBase - deduction.apportionedDeductible - Number(mixedPosted._sum.baseAmount ?? 0));
      const exemptOnlyUntracked = round2(
        taxablePurchases.filter((p) => p.inputVatUse === 'EXEMPT_ONLY' && !p.nonDeductibleTracked).reduce((s, p) => s + purchaseSign(p) * Number(p.taxAmount), 0),
      );
      // ⚖️ ق-١٣٦١ — وما بلا فاتورةٍ صحيحة يُرحَّل كذلك عند الشراء؛ **فالباقي منه في 1250 ما سبق البناءَ وحدَه** (يُعدّ ولا يُحوَّل).
      const excludedUntracked = round2(
        excludedPurchases.filter((p) => !p.exempt && !p.nonDeductibleTracked).reduce((s, p) => s + purchaseSign(p) * Number(p.taxAmount), 0),
      );
      const notPosted = round2(apportionedNotDeducted + exemptOnlyUntracked + excludedUntracked);
      if (notPosted > 0) {
        limits.push({
          code: 'NON_DEDUCTIBLE_INPUT_VAT_NOT_POSTED',
          severity: 'warning',
          message: `غيرُ القابل للخصم من ضريبة المدخلات الباقي في حسابها في هذه الفترة ${money(notPosted)} — منه المشتركُ غيرُ المخصوم ${money(apportionedNotDeducted)} (${closing ? 'بعد إقفال الفترة — ما بقي منه سابقٌ للتتبّع أو فرقُ تدوير' : 'يُرحَّل إلى التكلفة بحدث «إقفال الإقرار» بعد انقضاء الفترة'}) ومنه مشترياتٌ منسوبةٌ إلى المعفى سبقت ترحيلَه ${money(exemptOnlyUntracked)} ومنه مشترياتٌ بلا فاتورةٍ ضريبيةٍ صحيحة سبقت البناء ${money(excludedUntracked)}؛ فرصيدُ حساب ضريبة المدخلات أعلى مما يُستردّ بهذا المقدار. أمّا المنسوبُ إلى المعفى وحدَه وما بلا فاتورةٍ صحيحة فيُرحَّلان إلى تكلفة ما اشتُري عند الشراء`,
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
          commissionStandard: money(rent.commissionStandard),
          commissionStandardVat: money(rent.commissionStandardVat),
          chargesStandard: money(rent.chargesStandard),
          chargesStandardVat: money(rent.chargesStandardVat),
          ownerCollected: money(rent.ownerCollected),
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
          /** ⚖️ `ق-١٣٦٠` — حدثُ «إقفال الإقرار» الحيّ لهذه الفترة (إن وقع): تاريخُه ونسبتُه — والمشتركُ المرحَّلُ لمستنداتها. */
          closing: closing ? { id: closing.id, date: closing.date, ratio: Number(closing.ratio) } : null,
          mixedPosted: money(Number(mixedPosted._sum.baseAmount ?? 0)),
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
        filedNote: changedSinceFiled ? filedChangeNote(filed!.netVat, netVat) : null,
      };
    }
  }

  /** قسمُ الإيجار — انظر `RentDeclarationSection`. */
  private async rentSection(tx: Prisma.TransactionClient, from: Date, to: Date): Promise<RentDeclarationSection> {
    const rows = await tx.rentAccrual.findMany({
      where: { date: { gte: from, lte: to } },
      select: { classification: true, taxable: true, managed: true, baseNet: true, baseTax: true, baseExemptNet: true, journalEntryId: true },
    });
    const sum = (pick: (r: (typeof rows)[number]) => boolean, field: 'baseNet' | 'baseTax') => round2(rows.filter(pick).reduce((s, r) => s + Number(r[field]), 0));
    // ⚖️ المختلط (السؤال ٤١٢): جزؤه المعفى على صفّه — يُطرح من الخاضع ويُضاف إلى المعفى؛ وفارغٌ لغيره فصفر.
    const exemptPart = (pick: (r: (typeof rows)[number]) => boolean) => round2(rows.filter(pick).reduce((s, r) => s + Number(r.baseExemptNet ?? 0), 0));

    // ⚖️ قبضُ إيجار المالكين (السؤال ٥٧٧ · ق-١٦٠٠): العمولةُ وضريبتُها على صفّ الدفعة بتاريخها — الخاضعُ للمنشأة —
    // والمقبوضُ للمالك يُعدّ ولا يدخل. صفُّ الدفعة نفسُه هو ما رُحّل منه قيدُ القبض، فيستوي الدفترُ والإقرار.
    const commission = await tx.rentPayment.aggregate({
      where: { date: { gte: from, lte: to }, baseCommission: { not: null } },
      _sum: { baseNetAmount: true, baseCommission: true, baseCommissionTax: true },
      _count: { _all: true },
    });

    // ⚖️ المطالباتُ الخاضعة بتاريخ إصدارها، ويُطرح ما أُسقط منها بتاريخ إسقاطه (تعديلٌ في فترته)؛ والخصوماتُ الخاضعة من التأمين
    // بتاريخ تسويته — كلٌّ من صفّه الذي رُحّل منه القيد (الأسئلة ٤٩ و٥١ و٤١٣ و٤١٤).
    const [claimsIssued, claimsWaived, deductionsTaxed] = await Promise.all([
      tx.contractClaim.aggregate({ where: { taxTreatment: 'TAXABLE_SERVICE', issuedAt: { gte: from, lte: to } }, _sum: { baseAmount: true, baseTax: true } }),
      tx.contractClaim.aggregate({ where: { taxTreatment: 'TAXABLE_SERVICE', status: 'WAIVED', settledAt: { gte: from, lte: to } }, _sum: { baseAmount: true, baseTax: true } }),
      tx.depositDeduction.aggregate({ where: { taxTreatment: 'TAXABLE_SERVICE', deposit: { settledAt: { gte: from, lte: to } } }, _sum: { baseNet: true, baseTax: true } }),
    ]);
    const n = (v: Prisma.Decimal | null | undefined) => Number(v ?? 0);

    const section: RentDeclarationSection = {
      standard: round2(sum((r) => r.taxable, 'baseNet') - exemptPart((r) => r.taxable)),
      standardVat: sum((r) => r.taxable, 'baseTax'),
      exempt: round2(sum((r) => r.classification === 'RESIDENTIAL' && !r.managed, 'baseNet') + exemptPart((r) => !r.managed)),
      managedExcluded: sum((r) => r.managed, 'baseNet'),
      managedCount: rows.filter((r) => r.managed).length,
      commissionStandard: round2(Number(commission._sum.baseCommission ?? 0)),
      commissionStandardVat: round2(Number(commission._sum.baseCommissionTax ?? 0)),
      ownerCollected: round2(Number(commission._sum.baseNetAmount ?? 0)),
      ownerCount: commission._count._all,
      chargesStandard: round2(n(claimsIssued._sum.baseAmount) - n(claimsWaived._sum.baseAmount) + n(deductionsTaxed._sum.baseNet)),
      chargesStandardVat: round2(n(claimsIssued._sum.baseTax) - n(claimsWaived._sum.baseTax) + n(deductionsTaxed._sum.baseTax)),
      legacyStandard: 0,
      legacyStandardVat: 0,
      legacyExempt: 0,
      legacyCount: 0,
      legacyNote: 'أقساطٌ ودفعاتٌ سبقت بناءَ الاستحقاق: تدخل الإقرار بنقطة ضريبتها ولا يحملها الدفتر — «ما سبق اللحظةَ: في الإقرار لا في الدفتر»',
      unclassifiedCount: 0,
      unclassifiedNote: 'أقساطٌ ودفعاتٌ لعقودٍ قديمةٍ غيرِ مصنَّفة، أو على عقار تشغيلٍ لم يُعلَن مؤجّرُها، لا تدخل الإقرار حتى تُعلَن من بطاقة العقد',
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
        // ⚖️ وعقدٌ مؤجّرُه المالك لا يُستحقّ بالتصميم (السؤال ٥٧٧) — فلا يُعدّ معلّقاً.
        contract: { classification: { not: 'LEGACY_UNCLASSIFIED' }, vatInclusion: { not: 'LEGACY_UNDECLARED' }, lessor: 'COMPANY', status: { not: 'DRAFT' } },
      },
    });

    // ① ما سبق البناء — أقساطٌ على أساس القبض لعقودٍ مصنَّفة: نقاطُها بالمحرّك نفسِه.
    // **مقصورةً على ما قد تقع نقطتُه في الربع**: استحقاقٌ فيه أو دفعةٌ فيه — لا كلَّ القديم.
    const legacyInstallments = await tx.installment.findMany({
      where: {
        accrualBasis: 'LEGACY_COLLECTED',
        status: { not: 'CANCELLED' },
        OR: [{ dueDate: { gte: from, lte: to } }, { payments: { some: { date: { gte: from, lte: to } } } }],
        contract: { classification: { not: 'LEGACY_UNCLASSIFIED' }, vatInclusion: { not: 'LEGACY_UNDECLARED' }, lessor: { not: 'LEGACY_UNDECLARED' }, status: { not: 'DRAFT' } },
      },
      select: {
        dueDate: true,
        amount: true,
        exchangeRate: true,
        payments: { select: { id: true, date: true, amount: true } },
        contract: { select: { classification: true, vatInclusion: true, lessor: true, exemptSharePercent: true } },
      },
    });
    for (const i of legacyInstallments) {
      const treatment = rentTaxTreatment(i.contract.classification, i.contract.vatInclusion, i.contract.lessor, sharePercentOf(i.contract.exemptSharePercent));
      if (!treatment) continue;
      const points = taxPointsOfInstallment({
        gross: rentAmountsOf(Number(i.amount), treatment).gross,
        dueDate: i.dueDate,
        payments: i.payments.map((p) => ({ id: p.id, date: p.date, gross: Number(p.amount) })),
        // حتى اليوم في الربع المفتوح، كالعدِّ المعلّق أعلاه وكمسار الاستحقاق (الكنسُ يرحّل حتى اليوم):
        // قسطٌ لم يحلّ ولم يُقبض ليس نقطةَ ضريبةٍ بعد. وكان `asOf: to` يعدّ في الربع المفتوح أقساطاً تحلّ
        // بعد اليوم، فظهر أوّلَ الربع الرابع (2026-10-02) ولم يظهر في آخر الثالث (ق-١٥٧٦).
        asOf: to < today ? to : today,
      }).filter((pt) => pt.date >= from && pt.date <= to);
      for (const pt of points) this.addLegacyPoint(section, splitGrossAmount(pt.gross, treatment), Number(i.exchangeRate), treatment);
    }

    // ودفعاتٌ بلا قسطٍ سبقت البناء (لا صفَّ لها) لعقودٍ مصنَّفة — بقدرها بتاريخها.
    // ⚖️ ودفعةٌ لعقدٍ مؤجّرُه المالك ليست منها وإن لم يكن لها صفّ: عمولتُها على صفّها معدودةٌ أعلاه (السؤال ٥٧٧).
    const legacyUnlinked = await tx.rentPayment.findMany({
      where: {
        installmentId: null,
        date: { gte: from, lte: to },
        accruals: { none: {} },
        baseCommission: null,
        contract: { classification: { not: 'LEGACY_UNCLASSIFIED' }, vatInclusion: { not: 'LEGACY_UNDECLARED' }, lessor: { not: 'LEGACY_UNDECLARED' } },
      },
      select: {
        amount: true,
        exchangeRate: true,
        contract: { select: { classification: true, vatInclusion: true, lessor: true, exemptSharePercent: true } },
      },
    });
    for (const p of legacyUnlinked) {
      const treatment = rentTaxTreatment(p.contract.classification, p.contract.vatInclusion, p.contract.lessor, sharePercentOf(p.contract.exemptSharePercent));
      if (!treatment) continue;
      this.addLegacyPoint(section, splitGrossAmount(Number(p.amount), treatment), Number(p.exchangeRate), treatment);
    }

    // ② عقودٌ غيرُ مصنَّفة، أو على عقار تشغيلٍ لم يُعلَن مؤجّرُها — تُعدّ ولا تدخل.
    const unclassifiedWhere = { OR: [{ classification: 'LEGACY_UNCLASSIFIED' as const }, { vatInclusion: 'LEGACY_UNDECLARED' as const }, { lessor: 'LEGACY_UNDECLARED' as const }] };
    const [unclassifiedInstallments, unclassifiedPayments] = await Promise.all([
      tx.installment.count({ where: { dueDate: { gte: from, lte: to }, status: { not: 'CANCELLED' }, contract: unclassifiedWhere } }),
      tx.rentPayment.count({ where: { installmentId: null, date: { gte: from, lte: to }, contract: unclassifiedWhere } }),
    ]);
    section.unclassifiedCount = unclassifiedInstallments + unclassifiedPayments;

    return section;
  }

  private addLegacyPoint(section: RentDeclarationSection, amounts: { net: number; tax: number }, rate: number, treatment: RentTaxTreatment) {
    const net = round2(amounts.net * rate);
    const tax = round2(amounts.tax * rate);
    section.legacyCount += 1;
    if (treatment.managed) {
      section.managedExcluded = round2(section.managedExcluded + net);
      section.managedCount += 1;
    } else if (treatment.taxable) {
      // ⚖️ المختلطُ (السؤال ٤١٢) بجزأيه بالدالّة نفسِها التي تكتب صفَّ الاستحقاق — وغيرُه لا جزءَ معفى فيه.
      const exempt = exemptNetOf(net, treatment) ?? 0;
      section.legacyStandard = round2(section.legacyStandard + net - exempt);
      section.legacyStandardVat = round2(section.legacyStandardVat + tax);
      section.legacyExempt = round2(section.legacyExempt + exempt);
    } else if (treatment.classification === 'RESIDENTIAL') {
      section.legacyExempt = round2(section.legacyExempt + net);
    }
  }
}

/** ⑧ سطرُ مستندٍ كما يقرؤه الإقرار — الحقولُ التي نُسخت لحظةَ البيع. */
interface DeclarationLine {
  quantity: Prisma.Decimal | number;
  unitPrice: Prisma.Decimal | number;
  /** Line discount as an amount; the line net is quantity x price minus it, as in the ledger. */
  discount: Prisma.Decimal | number;
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
      discount: Number(l.discount),
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
