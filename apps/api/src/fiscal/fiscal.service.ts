import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { formatMessage, MSG } from '../common/i18n/messages';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { PagedQueryDto } from '../common/dto/paged-query.dto';
import { pagedFindMany, searchTerm, searchWhere } from '../common/pagination/paged.util';

/** حقولُ البحث المُعلَنة (`ق-١٢٣٦`) — الاسم. */
const FISCAL_SEARCH_FIELDS = ['name'] as const;
import { CreateFiscalYearDto } from './dto/create-fiscal-year.dto';
import { closeFiscalYearWithinTx, reverseClosingEntryWithinTx } from './year-closing.util';

const YEAR_INCLUDE = { periods: { orderBy: [{ year: 'asc' as const }, { month: 'asc' as const }] } };

/**
 * أزواجُ (سنة، شهر) التي تغطّيها السنةُ المالية — **من بدايتها إلى نهايتها المعلَنة**
 * (`ق-١٢٧٩` · د/①A3 — `domain-scan/01` A3 · S24).
 *
 * **ما كان**: اثنا عشر شهراً دائماً من البداية، و`end` يُفحص أن يكون بعدها **ولا يؤثّر**.
 * فسنةٌ أولى من ثمانية عشر شهراً (نظامُ الشركات، م١٦) **لا تُمثَّل**: ستّةُ أشهرٍ بلا فترة،
 * وكلُّ قيدٍ فيها يُردّ `fiscal_no_period_for_date` — فالتقويمُ خاطئٌ من اليوم الأوّل،
 * وتصحيحُه بعد الإقفال يمرّ بحارس A2 (لا يُحذف تقويمٌ فيه فترةٌ مقفلة).
 *
 * واليومُ الأوّل من كلِّ شهرٍ يتجنّب فخَّ آخر الشهر (`Jan 31 + 1 month = Mar 3`).
 */
export function monthsBetween(start: Date, end: Date): { month: number; year: number }[] {
  const months: { month: number; year: number }[] = [];
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  for (let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)); d <= last; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    months.push({ month: d.getUTCMonth() + 1, year: d.getUTCFullYear() });
  }
  return months;
}

/**
 * حدُّ المدّة — **من المصدر لا من الذاكرة**: نظامُ الشركات (١٤٤٣هـ) **م١٦**: «السنةُ المالية
 * للشركة اثنا عشر شهراً … ويجوز أن تكون السنةُ المالية الأولى … مدّةً لا تقلّ عن ستّة أشهر
 * ولا تزيد على ثمانية عشر شهراً» — الترجمةُ الإنجليزية على موقع وزارة الاستثمار، مقروءةً
 * 2026-09-21 (`docs/domain-scan/01` — المصدر م٨). **ولا يُفرَض اثنا عشر حتماً**: الأولى
 * والأخيرة يجوز أن تخالفاها، والنظامُ لا يميّزهما في بياناتنا — فالحدُّ على المدى وحدَه.
 */
export const FISCAL_SPAN_MIN_MONTHS = 6;
export const FISCAL_SPAN_MAX_MONTHS = 18;

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
      const start = new Date(dto.start);
      const end = new Date(dto.end);
      if (start >= end) throw new BadRequestException(MSG.fiscal_year_start_after_end);

      const months = monthsBetween(start, end);
      if (months.length < FISCAL_SPAN_MIN_MONTHS || months.length > FISCAL_SPAN_MAX_MONTHS) {
        throw new BadRequestException(formatMessage(MSG.fiscal_year_span_out_of_range, { months: months.length }));
      }

      // Two fiscal years must not both claim the same month: `periodForDate`
      // resolves a date to exactly one period, so an overlap would make which
      // one applies arbitrary.
      const clash = await tx.fiscalPeriod.findFirst({
        where: { OR: months.map((m) => ({ month: m.month, year: m.year })) },
      });
      if (clash) throw new ConflictException(MSG.fiscal_year_overlaps);

      const created = await tx.fiscalYear.create({
        data: { name: dto.name.trim(), start, end } as unknown as Prisma.FiscalYearUncheckedCreateInput,
      });

      // كلُّ فتراتها مفتوحة — الإقفالُ فعلٌ مقصودٌ دائماً لا حالةٌ افتراضية.
      await tx.fiscalPeriod.createMany({
        data: months.map((m) => ({
          companyId,
          fiscalYearId: created.id,
          month: m.month,
          year: m.year,
        })) as unknown as Prisma.FiscalPeriodUncheckedCreateInput[],
      });

      return tx.fiscalYear.findUniqueOrThrow({ where: { id: created.id }, include: YEAR_INCLUDE });
    });
  }

  /** Closing is reversible by design: a period is reopened to correct a
   * genuine mistake, and every open/close is visible via `closedAt`. What is
   * *not* offered is editing an entry inside a closed period — that's the
   * whole point (CLAUDE.md 6.9: correct with a reversing entry). */
  setPeriodStatus(companyId: string, periodId: string, close: boolean) {
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
        data: { status: close ? 'CLOSED' : 'OPEN', closedAt: close ? new Date() : null },
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
