import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { round2 } from '../common/money/rounding';
import { LIVE_SPEC_TIMEOUT_MS } from '../../test/live-spec-timeout';
import { ReportsService } from './reports.service';

// المهلةُ صريحة (بوّابةُ السير) — والاختباراتُ الثقيلة ترفعها فوقها بمهلتها الخاصّة (الشكلُ القديم على 22,872 قسطاً).
jest.setTimeout(LIVE_SPEC_TIMEOUT_MS);

/**
 * `ق-٧٠٦` — **تقريرُ الإيراد المؤجَّل يُرشِّح في القاعدة — والناتجُ يطابق الشكلَ القديم رقماً رقماً،
 * على صفوفٍ يصنعها الحارسُ بنفسه ويعرف جوابَها يداً، ثم على أكبر منشأةٍ في القاعدة لا على عيّنة.**
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
 * **والمجسُّ يصنع صفوفَه** (السقطةُ الأولى في السير 2026-09-14: قاعدةُ السير مبذورةٌ بلا أقساط، فلم
 * يجد منشأةً وسقط حارسُ المجسّ — «مجسٌّ يعتمد على حالِ قاعدةٍ ليس مجسّاً»): منشأةٌ تُنشأ بالمسار
 * الحقيقيّ (`loginIdentity.create` بشركةٍ متداخلة) وفيها أربعةُ أقساطٍ ودفعاتٌ **جوابُها معروفٌ يداً**
 * — فيُثبت الحارسُ الدلالةَ لا المطابقةَ وحدَها (مطابقةُ شكلَين خاطئَين معاً تمرّ)، ثم تُزال المنشأةُ.
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

/**
 * منشأةُ المجسّ — بالمسار الحقيقيّ، وصفوفُها معروفةُ الجواب:
 *   ① قسطٌ بفترة خدمة، معترَفٌ به `400`، عليه دفعتان `600 + 400` ⇒ محصَّل `1000` ومؤجَّل **`600`** (يظهر)
 *   ② قسطٌ بفترة خدمة، معترَفٌ به `500`، عليه دفعة `500` ⇒ مؤجَّل `0` (يُرشَّح)
 *   ③ قسطٌ بفترة خدمة بلا دفعة ⇒ محصَّل `0` (يُرشَّح)
 *   ④ قسطٌ **بلا** فترة خدمة عليه دفعة `200` ⇒ خارج التقرير كلّه
 *   ودفعةٌ غيرُ مرتبطةٍ بقسط `300` ⇒ في قائمة غير المرتبط وحدَها.
 */
const PROBE = {
  contractNo: 'DR-PROBE-1',
  tenant: 'مستأجر مجسّ الإيراد المؤجَّل',
  unitNo: 'DR-A1',
  outstanding: { collected: 1000, recognized: 400, deferred: 600, serviceStart: '2026-01-01', serviceEnd: '2026-01-31' },
  unlinked: 300,
};

async function createProbeCompany(raw: PrismaClient, tenant: TenantPrismaService): Promise<{ companyId: string; identityId: string }> {
  const template = await raw.permissionTemplate.findFirstOrThrow({ where: { companyId: null }, select: { id: true }, orderBy: { createdAt: 'asc' } });
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const identity = await raw.loginIdentity.create({
    data: {
      username: `probe-deferred-revenue-${stamp}`,
      passwordHash: 'probe-not-a-real-hash',
      actorType: 'COMPANY',
      company: { create: { orgName: `probe-deferred-revenue-${stamp}`, permissionTemplateId: template.id } },
    },
    include: { company: { select: { id: true } } },
  });
  const companyId = identity.company!.id;
  await tenant.runInTenantContext(companyId, async (tx) => {
    const property = await tx.property.create({ data: { companyId, name: 'عقار المجسّ', ownership: 'owned' } });
    const unit = await tx.unit.create({ data: { companyId, propertyId: property.id, unitNo: PROBE.unitNo, type: 'شقة', rentMonthly: 1000 } });
    const contract = await tx.contract.create({
      data: { companyId, unitId: unit.id, no: PROBE.contractNo, tenant: PROBE.tenant, value: 12000, baseValue: 12000, cycle: 'monthly', start: new Date('2026-01-01'), end: new Date('2026-12-31'), classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE' },
    });
    const installment = (dueDate: string, service: { start: string; end: string } | null, baseRecognized: number) =>
      tx.installment.create({
        data: {
          companyId,
          contractId: contract.id,
          dueDate: new Date(dueDate),
          amount: 1000,
          baseAmount: 1000,
          baseRecognized,
          serviceStart: service ? new Date(service.start) : null,
          serviceEnd: service ? new Date(service.end) : null,
        },
      });
    const payment = (installmentId: string | null, date: string, amount: number) =>
      tx.rentPayment.create({
        data: { companyId, contractId: contract.id, installmentId, date: new Date(date), amount, netAmount: amount, baseAmount: amount, baseNetAmount: amount, method: 'CASH' },
      });
    const i1 = await installment('2026-01-01', { start: PROBE.outstanding.serviceStart, end: PROBE.outstanding.serviceEnd }, PROBE.outstanding.recognized);
    const i2 = await installment('2026-02-01', { start: '2026-02-01', end: '2026-02-28' }, 500);
    await installment('2026-03-01', { start: '2026-03-01', end: '2026-03-31' }, 0);
    const i4 = await installment('2026-04-01', null, 0);
    await payment(i1.id, '2026-01-05', 600);
    await payment(i1.id, '2026-01-20', 400);
    await payment(i2.id, '2026-02-05', 500);
    await payment(i4.id, '2026-04-05', 200);
    await payment(null, '2026-05-01', PROBE.unlinked);
  });
  return { companyId, identityId: identity.id };
}

/** مفتاحٌ قانونيٌّ للمقارنة كمجموعة — ترتيبُ المتساوين في تاريخ الاستحقاق غيرُ محدَّدٍ في الشكلين. */
const key = (r: OutstandingRow) =>
  [r.contractNo, r.tenant, r.unitNo ?? '', r.serviceStart?.toISOString() ?? '', r.serviceEnd?.toISOString() ?? '', r.collected, r.recognized, r.deferred].join('|');

const day = (x: Date | null) => x?.toISOString().slice(0, 10) ?? null;

d('تقريرُ الإيراد المؤجَّل يُرشِّح في القاعدة — مطابقٌ للشكل القديم على صفوفٍ معلومة وعلى أكبر منشأة (ق-٧٠٦)', () => {
  const prisma = new PrismaService();
  const tenant = new TenantPrismaService(prisma);
  const reports = new ReportsService(tenant);
  const raw = new PrismaClient();
  let probeCompanyId = '';
  let probeIdentityId = '';
  let largestCompanyId = '';
  let largestInstallments = 0;

  beforeAll(async () => {
    const probe = await createProbeCompany(raw, tenant);
    probeCompanyId = probe.companyId;
    probeIdentityId = probe.identityId;
    // أكبرُ منشأةٍ بأقساطها — تُقرأ من القاعدة (كلُّ منشأةٍ تحت سياقها؛ `companies` بلا عزل). على السير هي منشأةُ المجسّ نفسُها.
    const companies = await raw.company.findMany({ select: { id: true } });
    for (const c of companies) {
      const n = await tenant.runInTenantContext(c.id, (tx) => tx.installment.count({ where: { serviceStart: { not: null }, serviceEnd: { not: null } } }));
      if (n > largestInstallments) {
        largestInstallments = n;
        largestCompanyId = c.id;
      }
    }
  }, 120_000);

  afterAll(async () => {
    // إزالةُ منشأة المجسّ: حذفُ الهويّة يتسلسل إلى المنشأة وإلى كلّ صفوفها (المفاتيحُ `Cascade`، وقيودُ الإحالة تتخطّى العزل).
    if (probeIdentityId) {
      await raw.loginIdentity.delete({ where: { id: probeIdentityId } });
      const left = await raw.company.count({ where: { id: probeCompanyId } });
      if (left !== 0) throw new Error(`منشأةُ المجسّ ${probeCompanyId} لم تُزَل`);
    }
    await raw.$disconnect();
    await prisma.$disconnect();
  });

  it('⓪ حارسٌ على المجسّ: منشأةُ المجسّ أُنشئت بأقساطها الأربعة — ووُجدت أكبرُ منشأةٍ في القاعدة', async () => {
    expect(probeCompanyId).not.toBe('');
    const n = await tenant.runInTenantContext(probeCompanyId, (tx) => tx.installment.count());
    expect(n).toBe(4);
    expect(largestCompanyId).not.toBe('');
    expect(largestInstallments).toBeGreaterThanOrEqual(3);
  });

  it('⭐ ② على صفوفٍ معلومة الجواب: صفٌّ واحدٌ مؤجَّلُه 600، والمرشَّحان لا يظهران، وغيرُ المرتبط 300 — والشكلُ القديم يقول الشيءَ نفسَه', async () => {
    const current = await reports.deferredRevenue(probeCompanyId);
    expect(current.outstanding).toHaveLength(1);
    const row = current.outstanding[0];
    expect(row.contractNo).toBe(PROBE.contractNo);
    expect(row.tenant).toBe(PROBE.tenant);
    expect(row.unitNo).toBe(PROBE.unitNo);
    expect(day(row.serviceStart)).toBe(PROBE.outstanding.serviceStart);
    expect(day(row.serviceEnd)).toBe(PROBE.outstanding.serviceEnd);
    expect(row.collected).toBe(PROBE.outstanding.collected);
    expect(row.recognized).toBe(PROBE.outstanding.recognized);
    expect(row.deferred).toBe(PROBE.outstanding.deferred);
    expect(current.totalDeferred).toBe(PROBE.outstanding.deferred);
    expect(current.unlinked).toHaveLength(1);
    expect(current.unlinked[0].baseNetAmount).toBe(PROBE.unlinked);
    expect(current.unlinked[0].contractNo).toBe(PROBE.contractNo);
    expect(current.totalUnlinked).toBe(PROBE.unlinked);

    const legacy = await legacyDeferredRevenue(tenant, probeCompanyId);
    expect(legacy.installmentsLoaded).toBe(3); // القديمُ يحمّل الثلاثةَ ذاتَ الفترة ليُخرج واحداً — وهذه هي العلّة
    expect(current.outstanding.map(key).sort()).toEqual(legacy.outstanding.map(key).sort());
    expect(current.totalDeferred).toBe(legacy.totalDeferred);
    expect(current.unlinked).toEqual(legacy.unlinked);
    expect(current.totalUnlinked).toBe(legacy.totalUnlinked);
  });

  it('⭐ ② على أكبر منشأةٍ في القاعدة: الناتجُ يطابق الشكلَ القديم رقماً رقماً — الصفوفُ والمجاميعُ والدفعاتُ غيرُ المرتبطة', async () => {
    const legacy = await legacyDeferredRevenue(tenant, largestCompanyId);
    const current = await reports.deferredRevenue(largestCompanyId);

    expect(current.outstanding.length).toBe(legacy.outstanding.length);
    expect(current.outstanding.map(key).sort()).toEqual(legacy.outstanding.map(key).sort());
    expect(current.totalDeferred).toBe(legacy.totalDeferred);
    expect(current.unlinked).toEqual(legacy.unlinked);
    expect(current.totalUnlinked).toBe(legacy.totalUnlinked);
    // eslint-disable-next-line no-console
    console.log(`  ق-٧٠٦ · المنشأة ${largestCompanyId} · أقساطٌ بفترة خدمة ${legacy.installmentsLoaded} · مؤجَّلٌ موجب ${current.outstanding.length} · غيرُ مرتبط ${current.unlinked.length}`);
  }, 300_000);

  it('⭐ ① بالعكس على الحجم الحقيقيّ: الجديدُ أسرعُ من القديم أربعَ مرّاتٍ على الأقلّ عند ≥ 10,000 قسط', async () => {
    if (largestInstallments < RATIO_MIN_INSTALLMENTS) {
      // eslint-disable-next-line no-console
      console.log(`  ⚠️ شرطُ النسبة لم يُقَس: ${largestInstallments} قسطاً دون ${RATIO_MIN_INSTALLMENTS} — يُقاس حيث توجد الأقساط (التطوير)`);
      return;
    }
    // إحماءٌ لكليهما ثم وسيطُ ثلاث قياسات — فالباردُ ضجيجُه كبير.
    await reports.deferredRevenue(largestCompanyId);
    await legacyDeferredRevenue(tenant, largestCompanyId);
    const time = async (fn: () => Promise<unknown>) => {
      const xs: number[] = [];
      for (let i = 0; i < 3; i++) {
        const t0 = process.hrtime.bigint();
        await fn();
        xs.push(Number(process.hrtime.bigint() - t0) / 1e6);
      }
      return xs.sort((a, b) => a - b)[1];
    };
    const legacyMs = await time(() => legacyDeferredRevenue(tenant, largestCompanyId));
    const currentMs = await time(() => reports.deferredRevenue(largestCompanyId));
    // eslint-disable-next-line no-console
    console.log(`  ق-٧٠٦ · ${largestInstallments} قسطاً: القديم ${legacyMs.toFixed(0)} ms · الجديد ${currentMs.toFixed(0)} ms · النسبة ${(legacyMs / currentMs).toFixed(1)}×`);
    expect(currentMs).toBeLessThan(legacyMs / 4);
  }, 600_000);
});
