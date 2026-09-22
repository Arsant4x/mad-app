import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { deriveSettlementStatus } from '../src/common/settlement/settlement.util';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { rentAmountsOf, rentTaxTreatment } from '../src/journal/rent-tax-point.util';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (18.3 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(55000);

/**
 * **السدادُ الجزئي للقسط — حقلُ حالةٍ يُشتقّ على نمط الفاتورة** (`SPEC 16.3` · `ق-١٠٤٠`):
 * ① دفعةٌ جزئية ⇒ `PARTIAL` لا `PAID`؛ ويبقى القسطُ في التذكيرات والتصعيد؛ ونسبةُ التحصيل تقرأ المقبوض.
 * ② قبضُ الباقي ⇒ `PAID` ويخرج من التذكيرات.
 * ③ خصمٌ + قبضٌ يُكملان الإجماليَّ ⇒ `PAID` — الخصمُ يُنقص المستحقَّ في المحرّك.
 * ④ ⛔ الاستحقاقُ لا يُمسّ: `rent_accruals` قبل الدفعة الجزئية وبعدها وبعد الكنس كما تقوله نقطةُ الضريبة وحدَها.
 * ⑤ العقدُ الشامل: الإجماليُّ هو المبلغ.
 * ⑦ غيرُ الشامل: قبضُ المبلغ (1,000) لا يسدّد القسطَ — المقارَنُ به الإجماليُّ بالضريبة (1,150).
 * ⑥ حارسُ الانحراف: لكلِّ قسطٍ في المنشأة المخزَّنُ = المحسوبُ من دفعاته وإجماليّه.
 * منشأةٌ معزولة تُزال في الختام.
 */
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
const dayBefore = (d: Date) => new Date(d.getTime() - 86400000);
const monthStart = (offset = 0) => addMonths(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)), offset);

type Installment = { id: string; dueDate: string; amount: string | number; status: string };
type ContractBody = { id: string; installments: Installment[] };

describe('السدادُ الجزئي للقسط — PARTIAL مشتقّةٌ من المقبوض مقابل الإجماليّ (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let token: string;
  let tenantPrisma: TenantPrismaService;
  let seq = 0;
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  async function makeContract(opts: { vatInclusion: 'EXCLUSIVE' | 'INCLUSIVE'; startOffset?: number }) {
    const tag = `${Date.now()}-${++seq}`;
    const property = (await auth(http().post('/properties')).send({ name: `عقار ${tag}`, ownership: 'owned' }).expect(201)).body as { id: string };
    const unit = (await auth(http().post('/units')).send({ propertyId: property.id, unitNo: `PS-${tag}`, type: 'تجاري', rentMonthly: 1000 }).expect(201)).body as { id: string };
    const customerId = await createTenantCustomer(app, token, `مستأجر جزئي ${tag}`, '0500000301');
    const start = monthStart(opts.startOffset ?? 0);
    const created = (
      await auth(http().post('/contracts'))
        .send({ classification: 'COMMERCIAL', vatInclusion: opts.vatInclusion, unitId: unit.id, customerId, value: 12000, cycle: 'monthly', start: iso(start), end: iso(dayBefore(addMonths(start, 12))) })
        .expect(201)
    ).body as ContractBody;
    return created;
  }
  const readContract = async (id: string) => (await auth(http().get(`/contracts/${id}`)).expect(200)).body as ContractBody;
  const firstInstallment = (c: ContractBody) => [...c.installments].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const pay = async (contractId: string, installmentId: string, amount: number, discount = 0) =>
    (await auth(http().post(`/contracts/${contractId}/payments`)).send({ installmentId, date: iso(new Date()), amount, ...(discount ? { discount } : {}), method: 'CASH' }).expect(201)).body as { installment: { status: string } };
  const remindersDue = async (contractId: string) => ((await auth(http().get('/reminders/due').query({ contractId })).expect(200)).body as { reminders: { installmentId: string }[] }).reminders;
  // ② المقبوضُ نصٌّ بخانتين (`ق-١٢٣٥`) — يُثبَت شكلُه ثم يُقرأ رقماً للفرق.
  const kpis = async () => {
    const body = (await auth(http().get('/reports/property-kpis')).expect(200)).body as { collection: { paidAmount: string; overdueCount: number } };
    expect(body.collection.paidAmount).toMatch(/^-?\d+\.\d{2}$/);
    return { collection: { paidAmount: Number(body.collection.paidAmount), overdueCount: body.collection.overdueCount } };
  };
  const accrualsOf = (installmentId: string) =>
    tenantPrisma.runInTenantContext(company.companyId, (tx) => tx.rentAccrual.findMany({ where: { installmentId }, orderBy: { date: 'asc' }, select: { amountGross: true, kind: true } }));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'installment-partial');
    token = company.token;
  }, 120000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 120000);

  it('[SPEC 16.3] ① دفعةٌ جزئية ⇒ PARTIAL لا PAID — ويبقى في التذكيرات، ونسبةُ التحصيل تقرأ المقبوضَ لا القسطَ كلَّه', async () => {
    const c = await makeContract({ vatInclusion: 'EXCLUSIVE' });
    const inst = firstInstallment(c);
    // الإجماليُّ بالضريبة 1,150 على قسطٍ 1,000 غيرِ شامل
    const kpiBefore = await kpis();
    const paid = await pay(c.id, inst.id, 100);
    expect(paid.installment.status).toBe('PARTIAL');
    expect(firstInstallment(await readContract(c.id)).status).toBe('PARTIAL');
    // ما زال مستحقّاً بباقيه — في التذكيرات
    expect((await remindersDue(c.id)).some((r) => r.installmentId === inst.id)).toBe(true);
    // نسبةُ التحصيل: المقبوضُ 100 لا 1,000 — والقسطُ ما زال في عدّ المتأخّر (كان القديمُ يُسقطه بختمه PAID)
    const kpiAfter = await kpis();
    expect(kpiAfter.collection.paidAmount - kpiBefore.collection.paidAmount).toBe(100);
    expect(kpiAfter.collection.overdueCount).toBe(kpiBefore.collection.overdueCount);
  }, 120000);

  it('② قبضُ الباقي ⇒ PAID — ويخرج من التذكيرات', async () => {
    const c = await makeContract({ vatInclusion: 'EXCLUSIVE' });
    const inst = firstInstallment(c);
    expect((await pay(c.id, inst.id, 100)).installment.status).toBe('PARTIAL');
    expect((await pay(c.id, inst.id, 1050)).installment.status).toBe('PAID');
    expect((await remindersDue(c.id)).some((r) => r.installmentId === inst.id)).toBe(false);
  }, 120000);

  it('③ خصمٌ وقبضٌ يُكملان الإجماليَّ ⇒ PAID — الخصمُ يُنقص المستحقَّ في المحرّك', async () => {
    const c = await makeContract({ vatInclusion: 'EXCLUSIVE' });
    const inst = firstInstallment(c);
    // 1,150 = 1,100 مقبوضة + 50 خصماً
    expect((await pay(c.id, inst.id, 1150, 50)).installment.status).toBe('PAID');
  }, 120000);

  it('④ ⛔ الاستحقاقُ لا يُمسّ — صفوفُ نقطة الضريبة قبل الجزئية وبعدها وبعد الكنس كما هي', async () => {
    // قسطٌ يحلّ الشهرَ القادم: دفعةٌ جزئية قبل الحلول تستحقّ بقدرها (ق-٩٢٤)، والكنسُ بعد الحلول يرحّل الباقي — والحالةُ لا تدخل في ذلك
    const c = await makeContract({ vatInclusion: 'EXCLUSIVE', startOffset: 1 });
    const inst = firstInstallment(c);
    expect(await accrualsOf(inst.id)).toEqual([]);
    expect((await pay(c.id, inst.id, 100)).installment.status).toBe('PARTIAL');
    const afterPartial = (await accrualsOf(inst.id)).map((a) => Number(a.amountGross));
    expect(afterPartial).toEqual([100]);
    const treatment = rentTaxTreatment('COMMERCIAL', 'EXCLUSIVE', 'owned');
    expect(treatment).not.toBeNull();
    expect(rentAmountsOf(1000, treatment!).gross).toBe(1150);
    // بعد الحلول: الكنسُ يرحّل 1,050 الباقية رغم PARTIAL — لأنه لا يقرأ الحالة
    const { accrueDueWithinTx } = await import('../src/journal/rent-accrual.util');
    const dayAfterDue = new Date(monthStart(1).getTime() + 86400000);
    await tenantPrisma.runInTenantContext(company.companyId, (tx) => accrueDueWithinTx(tx, company.companyId, dayAfterDue, c.id));
    const afterSweep = (await accrualsOf(inst.id)).map((a) => Number(a.amountGross));
    expect(afterSweep).toEqual([100, 1050]);
    expect(firstInstallment(await readContract(c.id)).status).toBe('PARTIAL');
  }, 120000);

  it('⑤ العقدُ الشامل: الإجماليُّ هو المبلغ — قبضُ 1,000 يسدّد القسطَ كاملاً', async () => {
    const c = await makeContract({ vatInclusion: 'INCLUSIVE' });
    const inst = firstInstallment(c);
    expect((await pay(c.id, inst.id, 400)).installment.status).toBe('PARTIAL');
    expect((await pay(c.id, inst.id, 600)).installment.status).toBe('PAID');
  }, 120000);

  it('⑦ غيرُ الشامل: قبضُ المبلغ 1,000 لا يسدّد القسطَ — الإجماليُّ بالضريبة 1,150 هو المقارَنُ به لا المبلغ', async () => {
    // مطوّرٌ يقارن بالمبلغ بدل الإجماليّ يختم هذه PAID — والباقي 150 يغيب عن التذكيرات والتصعيد
    const c = await makeContract({ vatInclusion: 'EXCLUSIVE' });
    const inst = firstInstallment(c);
    expect((await pay(c.id, inst.id, 1000)).installment.status).toBe('PARTIAL');
    expect((await remindersDue(c.id)).some((r) => r.installmentId === inst.id)).toBe(true);
    expect((await pay(c.id, inst.id, 150)).installment.status).toBe('PAID');
  }, 120000);

  it('⑥ حارسُ الانحراف: لكلِّ قسطٍ في المنشأة المخزَّنُ = المحسوبُ من دفعاته وإجماليّه', async () => {
    const rows = await tenantPrisma.runInTenantContext(company.companyId, (tx) =>
      tx.installment.findMany({
        where: { status: { not: 'CANCELLED' } },
        select: {
          id: true,
          amount: true,
          status: true,
          payments: { select: { netAmount: true, discount: true } },
          contract: { select: { classification: true, vatInclusion: true, unit: { select: { property: { select: { ownership: true } } } } } },
        },
      }),
    );
    expect(rows.length).toBeGreaterThan(5);
    const drift = rows
      .map((r) => {
        const t = rentTaxTreatment(r.contract.classification, r.contract.vatInclusion, r.contract.unit.property.ownership);
        const gross = t ? rentAmountsOf(Number(r.amount), t).gross : Number(r.amount);
        const settled = r.payments.reduce((s, p) => s + Number(p.netAmount) + Number(p.discount), 0);
        const derived = deriveSettlementStatus(settled, gross);
        const expected = derived === 'PAID' ? 'PAID' : derived === 'PARTIAL' ? 'PARTIAL' : r.status === 'PARTIAL' || r.status === 'PAID' ? 'DRIFT' : r.status;
        return { id: r.id, stored: r.status, expected };
      })
      .filter((x) => x.stored !== x.expected);
    expect(drift).toEqual([]);
  }, 60000);
});
