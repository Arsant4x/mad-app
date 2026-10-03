import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { dayEndOf } from '../src/common/wall-clock.util';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): تقديرٌ أوّلٌ قبل أن تُقاس (منشأةٌ وأربعةُ عقودٍ وتجديداتُها)، ويُضبط بثلاثة أضعاف أوّلِ زمنٍ مقيسٍ في السير.
jest.setTimeout(240000);

/**
 * ⚖️ **رصيدُ المستأجر** (توجيه ٢٧٨، بحكم صاحب المشروع):
 *   · `ق-١٦٢٩`: «رصيدُ المستأجر يُخصم آلياً من أوّل قسطٍ في التجديد، ويُبنى الآن. والردُّ نقداً يُبنى مع كشف حساب المستأجر.»
 *   · `ق-١٦٣٠`: «الزائدُ في عقار التشغيل رصيدٌ للمستأجر في 2450، لا حصّةً ولا عمولة حتى يقابله قسط. ويُبنى الآن.»
 *
 * **والجوابُ محسوبٌ يداً** (`ق-٧١٥`): العقدُ التجاريُّ غيرُ الشامل بألفٍ شهرياً (1,150 بالضريبة)، والرصيدُ الزائدُ على أقساطه كلِّها
 * صافيه في `2450` وضريبتُه يومَ القبض (م٢٠)؛ **فخصمُه من قسط التجديد لا يُعيد الضريبة** (نقطتُها مضت) بل ينقل صافيَه من `2450` إلى
 * إيراد القسط (مؤجَّلاً في `2400` ما دام شهرُه لم يأتِ)، ولا يمسّ `1200` ولا `2200`. وعقارُ التشغيل بمؤجّرٍ هو المالك: القسطُ ألفٌ
 * والعمولةُ عشرةٌ في المئة وضريبتُها خمسةَ عشرَ في المئة منها، والزائدُ في `2450` حتى يقابله قسط.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
const dayBefore = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1));
const r2 = (n: number) => Math.round(n * 100) / 100;

interface E2eInstallment {
  id: string;
  dueDate: string;
  status: string;
}
interface E2ePayment {
  id: string;
  installmentId: string | null;
  amount: string;
  creditFromContractId?: string | null;
  baseCommission?: string | null;
}
interface E2eContract {
  id: string;
  installments: E2eInstallment[];
  payments: E2ePayment[];
}

describe('⚖️ رصيدُ المستأجر: يُخصم من أوّل قسطٍ في التجديد، وزائدُ عقار التشغيل رصيدٌ لا حصّةٌ ولا عمولة (ق-١٦٢٩ · ق-١٦٣٠)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;
  let seq = 0;

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const today = dayEndOf(new Date());
  const todayIso = iso(today);
  const start = monthStart(today);
  const end = dayBefore(addMonths(start, 12));
  const renewStart = addMonths(start, 12);
  const renewEnd = dayBefore(addMonths(start, 24));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'tenant-credit');
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  const balance = async (code: string) => Number(((await auth(http().get('/accounts')).expect(200)).body as { code: string; balance: string }[]).find((a) => a.code === code)?.balance ?? 0);
  const balances = async (codes: string[]) => Object.fromEntries(await Promise.all(codes.map(async (c) => [c, await balance(c)] as const))) as Record<string, number>;
  const deltas = (after: Record<string, number>, before: Record<string, number>) => Object.fromEntries(Object.keys(after).map((k) => [k, r2(after[k] - before[k])]));
  const getContract = async (id: string) => (await auth(http().get(`/contracts/${id}`)).expect(200)).body as E2eContract;
  const firstOf = (c: E2eContract) => [...c.installments].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const cashFlow = async () => {
    const body = (await auth(http().get('/reports/cash-flow')).expect(200)).body as Record<string, string>;
    return { operating: Number(body.operatingCashFlow), prepayments: Number(body.customerPrepaymentsChange ?? 0) };
  };
  // الصفوفُ كلُّها ثم الترشيحُ بالاسم نصّاً — فالقراءةُ لا تسقط على نوعٍ لم يُعرَّف بعد.
  const creditRowsOf = async (contractId: string) =>
    (
      await tenantPrisma.runInTenantContext(company.companyId, (tx) =>
        tx.rentAccrual.findMany({ where: { contractId }, select: { kind: true, amountGross: true, amountTax: true } }),
      )
    ).filter((r) => ['TENANT_CREDIT', 'CREDIT_TRANSFER'].includes(String(r.kind)));

  async function makeUnit(ownership: 'owned' | 'managed', opRate?: number): Promise<string> {
    const tag = `${Date.now()}-${++seq}`;
    const property = await auth(http().post('/properties'))
      .send({ name: `عقار رصيد المستأجر ${tag}`, ownership, ...(opRate !== undefined ? { opRate } : {}) })
      .expect(201);
    const unit = await auth(http().post('/units')).send({ propertyId: property.body.id, unitNo: `TC-${tag}`, type: 'محل', rentMonthly: 1000 }).expect(201);
    return unit.body.id as string;
  }

  async function makeContract(unitId: string, extra: Record<string, unknown>): Promise<string> {
    const customerId = await createTenantCustomer(app, company.token, `مستأجر الرصيد ${++seq}`);
    const res = await auth(http().post('/contracts'))
      .send({ unitId, customerId, value: 12000, cycle: 'monthly', start: iso(start), end: iso(end), ...extra })
      .expect(201);
    return res.body.id as string;
  }

  const renew = async (id: string, extra: Record<string, unknown>) =>
    (await auth(http().post(`/contracts/${id}/renew`)).send({ start: iso(renewStart), end: iso(renewEnd), ...extra }).expect(201)).body as E2eContract;

  it('⚖️ ① الرصيدُ دون القسط: يُخصم كلُّه من أوّل قسطٍ في التجديد، صافيه من 2450 إلى 2400، بلا ضريبةٍ ثانية ولا ذمّة، والتدفّقُ يراه (ق-١٦٢٩)', async () => {
    const unitId = await makeUnit('owned');
    const sourceId = await makeContract(unitId, { classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE' });

    // اثنا عشر قسطاً بـ1,150 = 13,800، و230 تزيد: صافيها 200 في 2450 وضريبتُها 30 يومَ القبض. والتدفّقُ التشغيليُّ يزيد بالنقد كلِّه.
    const cfBefore = await cashFlow();
    await auth(http().post(`/contracts/${sourceId}/payments`)).send({ date: todayIso, amount: 14030, method: 'CASH' }).expect(201);
    const cfAfter = await cashFlow();
    expect({ operating: r2(cfAfter.operating - cfBefore.operating), prepayments: r2(cfAfter.prepayments - cfBefore.prepayments) }).toEqual({ operating: 14030, prepayments: 200 });

    const before = await balances(['2450', '2400', '4200', '2200', '1200']);
    const renewal = await renew(sourceId, { classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE' });
    const after = await balances(['2450', '2400', '4200', '2200', '1200']);

    const fresh = await getContract(renewal.id);
    const first = firstOf(fresh);
    const transfers = fresh.payments.filter((p) => p.creditFromContractId === sourceId);
    expect({
      transfers: transfers.map((p) => ({ installmentId: p.installmentId, amount: Number(p.amount) })),
      firstStatus: fresh.installments.find((i) => i.id === first.id)?.status,
      deltas: deltas(after, before),
    }).toEqual({
      transfers: [{ installmentId: first.id, amount: 230 }],
      firstStatus: 'PARTIAL',
      deltas: { 2450: -200, 2400: 200, 4200: 0, 2200: 0, 1200: 0 },
    });

    // والضريبةُ لا تتحرّك في الإقرار: صفّا النقل بإشارتين بتاريخٍ واحد، ورصيدُ الأصل صار صفراً.
    const sourceRows = await creditRowsOf(sourceId);
    const targetRows = await creditRowsOf(renewal.id);
    expect({
      sourceRemaining: r2(sourceRows.reduce((s, r) => s + Number(r.amountGross), 0)),
      transferTax: r2([...sourceRows, ...targetRows].filter((r) => String(r.kind) === 'CREDIT_TRANSFER').reduce((s, r) => s + Number(r.amountTax), 0)),
      targetGross: r2(targetRows.reduce((s, r) => s + Number(r.amountGross), 0)),
    }).toEqual({ sourceRemaining: 0, transferTax: 0, targetGross: 230 });
  });

  it('⚖️ ② الرصيدُ فوق القسط: يُخصم بقدر أوّل قسطٍ فيُسدَّد، والباقي يبقى رصيداً في العقد الأصل (ق-١٦٢٩: «من أوّل قسط»)', async () => {
    const unitId = await makeUnit('owned');
    const sourceId = await makeContract(unitId, { classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE' });
    // 13,800 للأقساط و1,725 تزيد: صافيها 1,500 في 2450.
    await auth(http().post(`/contracts/${sourceId}/payments`)).send({ date: todayIso, amount: 15525, method: 'CASH' }).expect(201);

    const before = await balances(['2450', '2400', '2200', '1200']);
    const renewal = await renew(sourceId, { classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE' });
    const after = await balances(['2450', '2400', '2200', '1200']);

    const fresh = await getContract(renewal.id);
    const first = firstOf(fresh);
    const sourceRows = await creditRowsOf(sourceId);
    expect({
      transferred: fresh.payments.filter((p) => p.creditFromContractId === sourceId).reduce((s, p) => s + Number(p.amount), 0),
      firstStatus: fresh.installments.find((i) => i.id === first.id)?.status,
      sourceRemaining: r2(sourceRows.reduce((s, r) => s + Number(r.amountGross), 0)),
      deltas: deltas(after, before),
    }).toEqual({ transferred: 1150, firstStatus: 'PAID', sourceRemaining: 575, deltas: { 2450: -1000, 2400: 1000, 2200: 0, 1200: 0 } });
  });

  it('⚖️ ③ عقارُ التشغيل بمؤجّرٍ هو المالك: الزائدُ رصيدٌ في 2450 بلا حصّةٍ ولا عمولة، ويُخصم من أوّل قسطٍ في التجديد فيصير حصّةً وعمولة (ق-١٦٣٠ · ق-١٦٢٩)', async () => {
    const unitId = await makeUnit('managed', 10);
    const sourceId = await makeContract(unitId, { classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE', lessor: 'OWNER', ownerName: 'مالكُ الرصيد' });

    // اثنا عشر قسطاً بألف: العمولةُ 1,200 وضريبتُها 180 والحصّةُ 10,620؛ و300 تزيد: رصيدٌ في 2450 لا حصّةَ فيه ولا عمولة.
    const before = await balances(['1000', '2500', '4250', '2200', '2450', '4200', '1200']);
    await auth(http().post(`/contracts/${sourceId}/payments`)).send({ date: todayIso, amount: 12300, method: 'CASH' }).expect(201);
    const afterPay = await balances(['1000', '2500', '4250', '2200', '2450', '4200', '1200']);
    const source = await getContract(sourceId);
    expect({
      deltas: deltas(afterPay, before),
      creditCommission: source.payments.filter((p) => p.installmentId === null).map((p) => p.baseCommission ?? null),
    }).toEqual({
      deltas: { 1000: 12300, 2500: 10620, 4250: 1200, 2200: 180, 2450: 300, 4200: 0, 1200: 0 },
      creditCommission: [null],
    });

    // والتجديدُ يخصم الثلاثمئة من أوّل قسطٍ (ألف): العمولةُ 30 وضريبتُها 4.5 والحصّةُ 265.5، ولا نقد.
    const renewal = await renew(sourceId, { classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE', lessor: 'OWNER', ownerName: 'مالكُ الرصيد' });
    const afterRenew = await balances(['1000', '2500', '4250', '2200', '2450', '4200', '1200']);
    const fresh = await getContract(renewal.id);
    const first = firstOf(fresh);
    const transfers = fresh.payments.filter((p) => p.creditFromContractId === sourceId);
    expect({
      transfers: transfers.map((p) => ({ installmentId: p.installmentId, amount: Number(p.amount), commission: Number(p.baseCommission) })),
      firstStatus: fresh.installments.find((i) => i.id === first.id)?.status,
      deltas: deltas(afterRenew, afterPay),
    }).toEqual({
      transfers: [{ installmentId: first.id, amount: 300, commission: 30 }],
      firstStatus: 'PARTIAL',
      deltas: { 1000: 0, 2500: 265.5, 4250: 30, 2200: 4.5, 2450: -300, 4200: 0, 1200: 0 },
    });
  });

  it('④ تصنيفٌ آخر في التجديد: لا يُخصم الرصيد (ضريبتُه على تصنيف الأصل)، ويبقى في 2450 للأصل (حدٌّ معلَن)', async () => {
    const unitId = await makeUnit('owned');
    const sourceId = await makeContract(unitId, { classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE' });
    await auth(http().post(`/contracts/${sourceId}/payments`)).send({ date: todayIso, amount: 14030, method: 'CASH' }).expect(201);

    const before = await balance('2450');
    const renewal = await renew(sourceId, { classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE' });
    const fresh = await getContract(renewal.id);
    const sourceRows = await creditRowsOf(sourceId);
    expect({
      transfers: fresh.payments.filter((p) => p.creditFromContractId === sourceId).length,
      creditDelta: r2((await balance('2450')) - before),
      sourceRemaining: r2(sourceRows.reduce((s, r) => s + Number(r.amountGross), 0)),
    }).toEqual({ transfers: 0, creditDelta: 0, sourceRemaining: 230 });
  });
});
