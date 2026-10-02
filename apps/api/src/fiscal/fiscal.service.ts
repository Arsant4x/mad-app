import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { formatMessage, MSG } from '../common/i18n/messages';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { pagedFindMany, searchTerm, searchWhere } from '../common/pagination/paged.util';

/** حقولُ البحث المُعلَنة (`ق-١٢٣٦`) — الاسم. */
const FISCAL_SEARCH_FIELDS = ['name'] as const;
import { CreateFiscalYearDto } from './dto/create-fiscal-year.dto';
import { closeFiscalYearWithinTx, reverseClosingEntryWithinTx } from './year-closing.util';
import { createFiscalYearWithinTx, fiscalYearContaining, fiscalYearName, lockFiscalCalendar } from './fiscal-calendar.util';
import { dayStartOf } from '../common/wall-clock.util';

const YEAR_INCLUDE = { periods: { orderBy: [{ year: 'asc' as const }, { month: 'asc' as const }] } };

/** نُقلت إلى `fiscal-calendar.util.ts` ليشترك فيها الإنشاءُ اليدويّ والميلادُ والتجدّد (`ق-١٥٨٤`)، وتُصدَّر من هنا كما كانت. */
export { FISCAL_SPAN_MAX_MONTHS, FISCAL_SPAN_MIN_MONTHS, monthsBetween } from './fiscal-calendar.util';

@Injectable()
export class FiscalService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list(companyId: string, query?: PagedQueryDto) {
    return this.tenantPrisma.runInTenantContext(companyId, (tx) =>
      pagedFindMany(query, tx.fiscalYear, { where: { ...searchWhere(searchTerm(query), FISCAL_SEARCH_FIELDS) }, include: YEAR_INCLUDE, orderBy: { start: 'asc' } }),
    );
  }

  create(companyId: string, dto: CreateFiscalYearDto) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const created = await createFiscalYearWithinTx(tx, companyId, { name: dto.name, start: new Date(dto.start), end: new Date(dto.end) });
      return tx.fiscalYear.findUniqueOrThrow({ where: { id: created.id }, include: YEAR_INCLUDE });
    });
  }

  /**
   * ⚖️ **شهرُ بداية السنة المالية يغيّره التاجرُ قبل أوّل ترحيلٍ وحدَه** (توجيه ٢٧٥ · `ق-١٥٨٤`، بحكم صاحب المشروع).
   *
   * قبل أوّل قيدٍ لا شيءَ يقوم على الفترات، فيُعاد بناءُ التقويم من الشهر الجديد: تُحذف السنواتُ (كلُّها مفتوحة بلا قيد)
   * وتُنشأ السنةُ التي تحوي اليوم. وبعده `409` مسمّى: القيودُ قائمةٌ على فتراتها، وتغييرُ البداية يعيد توزيعَها.
   */
  setStartMonth(companyId: string, month: number) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      await lockFiscalCalendar(tx, companyId);
      if (await tx.journalEntry.findFirst({ where: { companyId }, select: { id: true } })) throw new ConflictException(MSG.fiscal_start_month_after_posting);
      await tx.company.update({ where: { id: companyId }, data: { fiscalStartMonth: month } });
      await tx.fiscalYear.deleteMany({ where: { companyId } });
      const range = fiscalYearContaining(dayStartOf(new Date()), month);
      await createFiscalYearWithinTx(tx, companyId, { name: fiscalYearName(range.start, month), ...range });
      return tx.fiscalYear.findMany({ include: YEAR_INCLUDE, orderBy: { start: 'asc' } });
    });
  }

  /** Closing is reversible by design: a period is reopened to correct a
   * genuine mistake, and every open/close is visible via `closedAt`. What is
   * *not* offered is editing an entry inside a closed period — that's the
   * whole point (CLAUDE.md 6.9: correct with a reversing entry).
   *
   * ⚖️ **والفتحُ بسببٍ مكتوبٍ يُسجَّل** (توجيه ٢٧٥ · `ق-١٥٨٣`، بحكم صاحب المشروع): يُحفظ على الفترة السببُ ولحظةُ الفتح ومن
   * فتحها، فيُقرأ بجانبها؛ وفتحٌ ثانٍ يحلّ محلّ الأوّل فيها، والأوّلُ باقٍ في سجلّ التدقيق. والسببُ الفارغُ بعد التشذيب يُرفض. */
  setPeriodStatus(companyId: string, periodId: string, close: boolean, reopen?: { reason: string; actorId: string }) {
    const reason = reopen?.reason?.trim() ?? '';
    if (!close && !reason) throw new BadRequestException(MSG.fiscal_reopen_reason_required);
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const period = await tx.fiscalPeriod.findUnique({ where: { id: periodId } });
      if (!period) throw new NotFoundException(MSG.fiscal_period_not_found);

      /**
       * ⚖️ **إعادةُ فتح فترةٍ تعكس قيدَ إقفال سنتها آلياً** (`ق-١٢٨٣`/ج — قرار المالك):
       * «فلا يبقى قيدُ إقفالٍ على أرقامٍ تغيّرت». والعكسُ **قيدٌ مرقَّم بتاريخ الأصل**
       * لا محوٌ — والإقفالُ يُعاد توليدُه حين تُغلق الفترةُ ثانيةً.
       */
      if (!close) await reverseClosingEntryWithinTx(tx, { companyId, fiscalYearId: period.fiscalYearId });

      return tx.fiscalPeriod.update({
        where: { id: periodId },
        data: close
          ? { status: 'CLOSED', closedAt: new Date() }
          : { status: 'OPEN', closedAt: null, reopenReason: reason, reopenedAt: new Date(), reopenedById: reopen?.actorId ?? null },
      });
    });
  }

  /**
   * **إقفالُ السنة بقيدٍ واحد — بيد صاحب الصلاحية لا آلياً** (`ق-١٢٨٣` · د/③).
   *
   * «فتسوياتُ المراجع تقع غالباً **بعد** إغلاق آخر فترة، والإقفالُ الآليُّ يسبقها»
   * (قرار المالك) — فالفعلُ صريحٌ بصلاحية `review` كإغلاق الفترة نفسِه.
   */
  closeYear(companyId: string, id: string) {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const year = await tx.fiscalYear.findUnique({ where: { id }, select: { id: true, name: true, start: true, end: true } });
      if (!year) throw new NotFoundException(MSG.fiscal_year_not_found);
      return closeFiscalYearWithinTx(tx, { companyId, year });
    });
  }

  /**
   * **حذفُ التقويم لا يفكّ الإقفال** (`ق-١٢٥٣`/② — `domain-scan/01` A2).
   *
   * كانت السنةُ تُحذف بفتراتها المقفلة بالتتالي، فيصير الشهرُ المقفل مفتوحاً لكلِّ
   * ترحيلٍ بلا أثرٍ يميّز ما دخله بعد الحذف. الحارسُ: سنةٌ فيها فترةٌ `CLOSED`
   * تُرفض `409` مسمّىً بالشهر؛ ومن أراد حذفَها يعيد فتحَ الفترة أولاً — فعلٌ
   * مقصودٌ يمرّ بصلاحية `review` ويُسجَّل في التدقيق — ثم يحذف تقويماً لا يقفل شيئاً.
   * (الفتراتُ المفتوحة كلُّها لا تقفل قيداً، فحذفُها لا يفكّ شيئاً — وسنةٌ خاطئةٌ
   * تُصحَّح بالحذف وإعادة الإنشاء، لا تُحبَس بقيودها.)
   */
  async remove(companyId: string, id: string): Promise<void> {
    await this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const existing = await tx.fiscalYear.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException(MSG.fiscal_year_not_found);
      const closed = await tx.fiscalPeriod.findFirst({
        where: { fiscalYearId: id, status: 'CLOSED' },
        orderBy: [{ year: 'asc' }, { month: 'asc' }],
        select: { month: true, year: true },
      });
      if (closed) {
        throw new ConflictException(
          formatMessage(MSG.fiscal_year_has_closed_period, { period: `${String(closed.month).padStart(2, '0')}/${closed.year}` }),
        );
      }
      // Periods cascade with the year (see schema) — deleting an all-open
      // calendar doesn't touch any journal entry, it only stops constraining them.
      await tx.fiscalYear.delete({ where: { id } });
    });
  }
}
