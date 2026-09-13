import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { round2 } from '../common/money/rounding';
import { ReportsService } from './reports.service';

/**
 * `ق-٧٠٦` — **تقريرُ الإيراد المؤجَّل يُرشِّح في القاعدة — والناتجُ يطابق الشكلَ القديم رقماً رقماً،
 * على أكبر منشأةٍ في القاعدة لا على عيّنة.**
 *
 * الواقعة (`ق-٦٩٩` · `ق-٧٠٤`): الشكلُ القديم حمّل `22,872` قسطاً بعلاقاته ليُخرج `4` صفوف — `≥ 94٪`
 * من زمن المعاملة في العميل — فسقط بـ`500` عند مهلة المعاملة الحاملة لسياق العزل.
 *
 * **شرطا المالك (التوجيه ١٥٤)**:
 *   ① **مُثبَتٌ بالعكس على `22,872` قسطاً لا على عيّنة**: يُختار أكبرُ منشأةٍ في القاعدة (على التطوير
 *      هي منشأةُ العرض بأقساطها المتراكمة)، ويُقاس الشكلُ الجديد مقابل القديم — **ومن يُعيد التحميلَ
 *      الكامل يُسقط شرطَ النسبة** (الجديد أسرع أربعَ مرّاتٍ على الأقلّ عند `≥ 10,000` قسط).
 *   ② **الناتجُ يطابق ما يُعطيه اليوم**: الشكلُ القديم يُحسب هنا حرفياً (كما كان في الخدمة قبل
 *      `ق-٧٠٦`) ويُقارَن بالجديد قيمةً قيمة — الصفوفُ والمجاميعُ والدفعاتُ غيرُ المرتبطة.
 *
 * **حدُّه المعلَن**: شرطُ النسبة يُقاس حيث توجد الأقساط (التطوير)؛ على قاعدةٍ صغيرة (السير) يُعلَن
 * تخطّيه ولا يُدّعى — وشرطُ المطابقة يعمل على أيّ حجم.
 */
const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;
const RATIO_MIN_INSTALLMENTS = 10_000;

interface OutstandingRow {
  contractNo: string;
  tenant: string;
  unitNo: string | null;
  serviceStart: Date | null;
  serviceEnd: Date | null;
  collected: number;
  recognized: number;
  deferred: number;
}

/** الشكلُ القديم حرفياً — المرجعُ الذي يُطابَق عليه (لا يُعدَّل مع الخدمة). */
async function legacyDeferredRevenue(tenant: TenantPrismaService, companyId: string) {
  return tenant.runInTenantContext(
    companyId,
    async (tx) => {
      const installments = await tx.installment.findMany({
        where: { serviceStart: { not: null }, serviceEnd: { not: null } },
        select: {
          dueDate: true,
          serviceStart: true,
          serviceEnd: true,
          baseRecognized: true,
          contract: { select: { no: true, tenant: true, unit: { select: { unitNo: true } } } },
          payments: { select: { baseNetAmount: true } },
        },
        orderBy: { dueDate: 'asc' },
      });
      const outstanding: OutstandingRow[] = installments
        .map((i) => {
          const collected = round2(i.payments.reduce((sum, p) => sum + Number(p.baseNetAmount), 0));
          return {
            contractNo: i.contract.no,
            tenant: i.contract.tenant,
            unitNo: i.contract.unit?.unitNo ?? null,
            serviceStart: i.serviceStart,
            serviceEnd: i.serviceEnd,
            collected,
            recognized: round2(Number(i.baseRecognized)),
            deferred: round2(collected - Number(i.baseRecognized)),
          };
        })
        .filter((r) => r.deferred > 0);
      const unlinkedRows = await tx.rentPayment.findMany({
        where: { installmentId: null },
        select: { date: true, baseNetAmount: true, contract: { select: { no: true, tenant: true } } },
        orderBy: { date: 'desc' },
      });
      const unlinked = unlinkedRows.map((p) => ({ date: p.date, contractNo: p.contract.no, tenant: p.contract.tenant, baseNetAmount: round2(Number(p.baseNetAmount)) }));
      return {
        installmentsLoaded: installments.length,
        outstanding,
        totalDeferred: round2(outstanding.reduce((sum, r) => sum + r.deferred, 0)),
        unlinked,
        totalUnlinked: round2(unlinked.reduce((sum, r) => sum + r.baseNetAmount, 0)),
      };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}

/** مفتاحٌ قانونيٌّ للمقارنة كمجموعة — ترتيبُ المتساوين في تاريخ الاستحقاق غيرُ محدَّدٍ في الشكلين. */
const key = (r: OutstandingRow) =>
  [r.contractNo, r.tenant, r.unitNo ?? '', r.serviceStart?.toISOString() ?? '', r.serviceEnd?.toISOString() ?? '', r.collected, r.recognized, r.deferred].join('|');

d('تقريرُ الإيراد المؤجَّل يُرشِّح في القاعدة — مطابقٌ للشكل القديم على أكبر منشأة (ق-٧٠٦)', () => {
  const prisma = new PrismaService();
  const tenant = new TenantPrismaService(prisma);
  const reports = new ReportsService(tenant);
  const raw = new PrismaClient();
  let companyId = '';
  let installments = 0;

  beforeAll(async () => {
    // أكبرُ منشأةٍ بأقساطها — تُقرأ من القاعدة (كلُّ منشأةٍ تحت سياقها؛ `companies` بلا عزل).
    const companies = await raw.company.findMany({ select: { id: true } });
    for (const c of companies) {
      const n = await tenant.runInTenantContext(c.id, (tx) => tx.installment.count({ where: { serviceStart: { not: null }, serviceEnd: { not: null } } }));
      if (n > installments) {
        installments = n;
        companyId = c.id;
      }
    }
  }, 120_000);

  afterAll(async () => {
    await raw.$disconnect();
    await prisma.$disconnect();
  });

  it('⓪ حارسٌ على المجسّ: وُجدت منشأةٌ ذاتُ أقساطٍ بفترات خدمة', () => {
    expect(companyId).not.toBe('');
    expect(installments).toBeGreaterThan(0);
  });

  it('⭐ ② الناتجُ يطابق الشكلَ القديم رقماً رقماً — الصفوفُ والمجاميعُ والدفعاتُ غيرُ المرتبطة', async () => {
    const legacy = await legacyDeferredRevenue(tenant, companyId);
    const current = await reports.deferredRevenue(companyId);

    expect(current.outstanding.length).toBe(legacy.outstanding.length);
    expect(current.outstanding.map(key).sort()).toEqual(legacy.outstanding.map(key).sort());
    expect(current.totalDeferred).toBe(legacy.totalDeferred);
    expect(current.unlinked).toEqual(legacy.unlinked);
    expect(current.totalUnlinked).toBe(legacy.totalUnlinked);
    // eslint-disable-next-line no-console
    console.log(`  ق-٧٠٦ · المنشأة ${companyId} · أقساطٌ بفترة خدمة ${legacy.installmentsLoaded} · مؤجَّلٌ موجب ${current.outstanding.length} · غيرُ مرتبط ${current.unlinked.length}`);
  }, 300_000);

  it('⭐ ① بالعكس على الحجم الحقيقيّ: الجديدُ أسرعُ من القديم أربعَ مرّاتٍ على الأقلّ عند ≥ 10,000 قسط', async () => {
    if (installments < RATIO_MIN_INSTALLMENTS) {
      // eslint-disable-next-line no-console
      console.log(`  ⚠️ شرطُ النسبة لم يُقَس: ${installments} قسطاً دون ${RATIO_MIN_INSTALLMENTS} — يُقاس حيث توجد الأقساط (التطوير)`);
      return;
    }
    // إحماءٌ لكليهما ثم وسيطُ ثلاث قياسات — فالباردُ ضجيجُه كبير.
    await reports.deferredRevenue(companyId);
    await legacyDeferredRevenue(tenant, companyId);
    const time = async (fn: () => Promise<unknown>) => {
      const xs: number[] = [];
      for (let i = 0; i < 3; i++) {
        const t0 = process.hrtime.bigint();
        await fn();
        xs.push(Number(process.hrtime.bigint() - t0) / 1e6);
      }
      return xs.sort((a, b) => a - b)[1];
    };
    const legacyMs = await time(() => legacyDeferredRevenue(tenant, companyId));
    const currentMs = await time(() => reports.deferredRevenue(companyId));
    // eslint-disable-next-line no-console
    console.log(`  ق-٧٠٦ · ${installments} قسطاً: القديم ${legacyMs.toFixed(0)} ms · الجديد ${currentMs.toFixed(0)} ms · النسبة ${(legacyMs / currentMs).toFixed(1)}×`);
    expect(currentMs).toBeLessThan(legacyMs / 4);
  }, 600_000);
});
