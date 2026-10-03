import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { formatMessage, MSG } from '../common/i18n/messages';
import { dayStartOf } from '../common/wall-clock.util';

/**
 * ⚖️ **تقويمُ المنشأة المالي — يولد معها ويتجدّد، فلا يعمل القفلُ مفتوحاً** (توجيه ٢٧٥ · `ق-١٥٨٤`، بحكم صاحب المشروع).
 *
 * كان القفلُ (`assertPeriodOpen`) يعود بلا فحصٍ حين لا فترةَ للمنشأة أصلاً، ومنشأةٌ جديدة تولد بلا سنة؛ فكلُّ ترحيلٍ يمرّ حتى
 * ينشئ التاجرُ سنةً بيده. والحكم: **سنةٌ ميلاديةٌ مع الميلاد** (`createBirthFiscalYear`)، **وكلُّ ترحيلٍ تاريخُه بلا سنةٍ يُنشئ
 * السنةَ التي تحويه** على إيقاع التقويم القائم (`ensureFiscalYearFor` — التجدّد)، **وشهرُ البداية يتغيّر قبل أوّل ترحيلٍ وحدَه**.
 *
 * ⚠️ **وحدُّه معلَن**: تنشأ السنةُ التي تحوي التاريخَ وحدَها، لا ما بينها وبين آخر سنة؛ فترحيلٌ بعيدٌ (خطأُ تاريخ) يُنشئ سنتَه
 * ويظهر في صفحة السنوات. وسنةٌ يدويةٌ بمدّةٍ مختلفة تتقاطع مع المحسوبة لا تُمسّ: لا تنشأ المحسوبة، ويبقى رفضُ «لا فترة» قائماً.
 */

/**
 * أزواجُ (سنة، شهر) التي تغطّيها السنةُ المالية — **من بدايتها إلى نهايتها المعلَنة** (`ق-١٢٧٩` · د/①A3).
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
 * حدُّ المدّة — نظامُ الشركات (١٤٤٣هـ) **م١٦**: السنةُ اثنا عشر شهراً، والأولى لا تقلّ عن ستّة ولا تزيد على ثمانية عشر
 * (`docs/domain-scan/01` — المصدر م٨). والحدُّ على المدى وحدَه.
 */
export const FISCAL_SPAN_MIN_MONTHS = 6;
export const FISCAL_SPAN_MAX_MONTHS = 18;

/** يُنشئ سنةً بفتراتها المفتوحة داخل معاملةٍ قائمة — المسارُ الواحد للإنشاء اليدويّ والميلاد والتجدّد. */
export async function createFiscalYearWithinTx(tx: Prisma.TransactionClient, companyId: string, input: { name: string; start: Date; end: Date }) {
  const { start, end } = input;
  if (start >= end) throw new BadRequestException(MSG.fiscal_year_start_after_end);

  const months = monthsBetween(start, end);
  if (months.length < FISCAL_SPAN_MIN_MONTHS || months.length > FISCAL_SPAN_MAX_MONTHS) {
    throw new BadRequestException(formatMessage(MSG.fiscal_year_span_out_of_range, { months: months.length }));
  }

  // Two fiscal years must not both claim the same month: `periodForDate`
  // resolves a date to exactly one period, so an overlap would make which
  // one applies arbitrary. `companyId` is explicit in every read here so the
  // scope never depends on which client runs it (tenant-extended or raw).
  const clash = await tx.fiscalPeriod.findFirst({ where: { companyId, OR: months.map((m) => ({ month: m.month, year: m.year })) } });
  if (clash) throw new ConflictException(MSG.fiscal_year_overlaps);

  // `companyId` صريحاً — تقبله معاملةُ المستأجر، ويلزم في معاملة الميلاد التي تجري بالعميل الخام (كما `createDefaultChart`).
  const created = await tx.fiscalYear.create({
    data: { companyId, name: input.name.trim(), start, end } as unknown as Prisma.FiscalYearUncheckedCreateInput,
  });
  // كلُّ فتراتها مفتوحة — الإقفالُ فعلٌ مقصودٌ دائماً لا حالةٌ افتراضية.
  await tx.fiscalPeriod.createMany({
    data: months.map((m) => ({ companyId, fiscalYearId: created.id, month: m.month, year: m.year })) as unknown as Prisma.FiscalPeriodUncheckedCreateInput[],
  });
  return created;
}

/** السنةُ المالية التي تحوي التاريخَ بشهر البداية: من أوّل ذلك الشهر إلى اليوم الذي قبل أوّله في السنة التالية. */
export function fiscalYearContaining(date: Date, startMonth: number): { start: Date; end: Date } {
  const year = date.getUTCMonth() + 1 >= startMonth ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return { start: new Date(Date.UTC(year, startMonth - 1, 1)), end: new Date(Date.UTC(year + 1, startMonth - 1, 0)) };
}

/** اسمُ السنة: ميلاديةٌ برقمها، وغيرُها بالسنتين اللتين تمتدّ عليهما. */
export function fiscalYearName(start: Date, startMonth: number): string {
  const y = start.getUTCFullYear();
  return startMonth === 1 ? `السنة المالية ${y}` : `السنة المالية ${y}/${y + 1}`;
}

/** منشأةُ المعاملة من سياقها — كلُّ ترحيلٍ يجري تحته (`runInTenantContext`). */
async function contextCompanyId(tx: Prisma.TransactionClient): Promise<string | null> {
  const [row] = await tx.$queryRaw<{ id: string | null }[]>`SELECT NULLIF(current_setting('app.company_id', true), '') AS id`;
  return row?.id ?? null;
}

/** إنشاءُ السنوات واحداً بعد واحد في المنشأة: ترحيلان متزامنان في سنةٍ لم تُنشأ بعد يُنشئانها مرّةً لا مرّتين (الفهرسُ الفريد على الفترة كان سيُسقط الثاني `500`). */
export async function lockFiscalCalendar(tx: Prisma.TransactionClient, companyId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'fiscal_calendar:' + companyId}))`;
}

/**
 * **التجدّد**: تاريخٌ لا فترةَ له يُنشئ السنةَ المالية التي تحويه — قبل أن يُسأل القفلُ عن فترته.
 *
 * وشهرُ البداية **إيقاعُ التقويم القائم**: شهرُ بداية أقرب سنةٍ تبدأ قبل التاريخ (وإلا أقدمِ سنةٍ بعده)، فمنشأةٌ سنتُها من يوليو
 * تتجدّد من يوليو وإن لم يُضبط لها شهر؛ **وبلا سنةٍ أصلاً** شهرُ المنشأة (`fiscalStartMonth`، يناير افتراضاً). وإن تقاطعت
 * المحسوبةُ مع سنةٍ قائمة (سنةٌ يدويةٌ بمدّةٍ مختلفة) لا تُنشأ، ويقرّر القفلُ «لا فترة» كما كان.
 */
export async function ensureFiscalYearFor(tx: Prisma.TransactionClient, date: Date): Promise<void> {
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  // الطريقُ السريع بلا قراءةٍ زائدة: يرى ما يراه القفلُ نفسُه (`assertPeriodOpen` يقرأ فترتَه بالشكل ذاته)؛ وما بعده يسمّي المنشأة.
  if (await tx.fiscalPeriod.findFirst({ where: { month, year }, select: { id: true } })) return;

  const companyId = await contextCompanyId(tx);
  if (!companyId) return;
  await lockFiscalCalendar(tx, companyId);
  if (await tx.fiscalPeriod.findFirst({ where: { companyId, month, year }, select: { id: true } })) return;

  // الإيقاعُ من أقرب سنةٍ تبدأ قبل التاريخ، وإلا من أقدم سنةٍ بعده — فسنةٌ يدويةٌ بعيدةٌ في المستقبل لا تغيّر إيقاعَ ما قبلها.
  const anchor =
    (await tx.fiscalYear.findFirst({ where: { companyId, start: { lte: date } }, orderBy: { start: 'desc' }, select: { start: true } })) ??
    (await tx.fiscalYear.findFirst({ where: { companyId }, orderBy: { start: 'asc' }, select: { start: true } }));
  const company = anchor ? null : await tx.company.findUnique({ where: { id: companyId }, select: { fiscalStartMonth: true } });
  const startMonth = anchor ? anchor.start.getUTCMonth() + 1 : (company?.fiscalStartMonth ?? 1);
  const range = fiscalYearContaining(date, startMonth);
  const months = monthsBetween(range.start, range.end);
  if (await tx.fiscalPeriod.findFirst({ where: { companyId, OR: months.map((m) => ({ month: m.month, year: m.year })) }, select: { id: true } })) return;

  // الاسمُ فريدٌ في المنشأة (`@@unique([companyId, name])`)، وسنةٌ يدويةٌ قد تحمل الاسمَ المحسوب؛ فيُميَّز بتاريخ بدايته.
  const base = fiscalYearName(range.start, startMonth);
  const taken = await tx.fiscalYear.findFirst({ where: { companyId, name: base }, select: { id: true } });
  const name = taken ? `${base} (${range.start.toISOString().slice(0, 10)})` : base;
  await createFiscalYearWithinTx(tx, companyId, { name, ...range });
}

/** **سنةُ الميلاد**: السنةُ الميلادية التي تحوي يومَ الإنشاء — داخل معاملة الميلاد بعد ضبط سياقها. */
export async function createBirthFiscalYear(tx: Prisma.TransactionClient, companyId: string, today: Date = dayStartOf(new Date())) {
  const range = fiscalYearContaining(today, 1);
  return createFiscalYearWithinTx(tx, companyId, { name: fiscalYearName(range.start, 1), ...range });
}
