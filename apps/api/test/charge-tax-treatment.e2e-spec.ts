import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Prisma } from '@mad-app/db';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { dayEndOf } from '../src/common/wall-clock.util';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): تقديرٌ أوّلٌ قبل أن تُقاس، ويُضبط بثلاثة أضعاف أوّلِ زمنٍ مقيسٍ في السير.
jest.setTimeout(180000);

/**
 * ⚖️ **المطالبةُ والخصمُ من التأمين بمعاملتهما الضريبية** (الأسئلة ٤٩ و٥١ و٤١٣ و٤١٤ · `ق-١٦٠٠` · `ق-١٦٠٩`/د، بحكم صاحب المشروع).
 *
 * · **المطالبةُ تفرّق ثلاثة** (السؤال ٤١٣): خدمةٌ خاضعة ١٥٪ (**الافتراض** — «فالنيابةُ استثناءٌ يُثبت») · مبلغٌ دُفع نيابةً
 *   (حسابٌ وسيطٌ لا إيراد، ويُكتب ما يثبت الشروط) · تعويضُ ضرر (خارج النطاق، بلا ضريبة).
 * · **والخصمُ من التأمين** (السؤال ٤١٤): الضررُ والإيجارُ غيرُ المسدَّد كما هما · النظافةُ خاضعة (٤٩) · المرافقُ خاضعةٌ أو نيابةً
 *   (٥١) · «أخرى» يُسأل عنها عند إدخالها (خاضعةٌ أو تعويض).
 *
 * والجوابُ محسوبٌ يداً (`ق-٧١٥`): المطالبةُ الخاضعة مئةٌ صافية وضريبتُها خمسةَ عشر فوقها، والخصمُ الخاضعُ من التأمين إجماليٌّ
 * (مالٌ مأخوذٌ من وديعةٍ ثابتة) فمئةٌ وخمسةَ عشرَ منه مئةٌ صافية وخمسةَ عشرَ ضريبة.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
const dayBefore = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1));
const quarterOf = (d: Date) => ({ year: d.getUTCFullYear(), quarter: Math.floor(d.getUTCMonth() / 3) + 1 });

interface E2eClaim {
  id: string;
  amount: string;
  status: string;
  taxTreatment: string;
  taxAmount: string;
  description: string;
}

describe('⚖️ المطالبةُ والخصمُ من التأمين بمعاملتهما الضريبية (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;
  let token: string;
  let contractId: string;
  let seq = 0;

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const today = dayEndOf(new Date());
  const todayIso = iso(today);
  const thisQuarter = quarterOf(today);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'charges');
    token = company.token;

    const tag = `${Date.now()}`;
    const property = await auth(http().post('/properties')).send({ name: `عقار المطالبات ${tag}`, ownership: 'owned' }).expect(201);
    const unit = await auth(http().post('/units')).send({ propertyId: property.body.id, unitNo: `C-${tag}`, type: 'شقة', rentMonthly: 1000 }).expect(201);
    const start = monthStart(today);
    const contract = await auth(http().post('/contracts'))
      .send({
        unitId: unit.body.id,
        customerId: await createTenantCustomer(app, token, `مستأجر المطالبات ${tag}`),
        value: 12000,
        cycle: 'monthly',
        start: iso(start),
        end: iso(dayBefore(addMonths(start, 12))),
        classification: 'RESIDENTIAL',
        vatInclusion: 'EXCLUSIVE',
      })
      .expect(201);
    contractId = contract.body.id;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  async function balance(code: string): Promise<number> {
    const accounts = await auth(http().get('/accounts')).expect(200);
    return Number(accounts.body.find((a: { code: string }) => a.code === code)?.balance ?? 0);
  }
  const ledger = async () => ({
    cash: await balance('1000'),
    receivable: await balance('1200'),
    onBehalf: await balance('1260'),
    vat: await balance('2200'),
    deposits: await balance('2300'),
    other: await balance('4300'),
  });
  async function rent(): Promise<Record<string, number>> {
    const body = (await auth(http().get('/obligations/vat-declaration')).query(thisQuarter).expect(200)).body;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(body.rent as Record<string, unknown>)) out[k] = Number(v);
    out.salesStandard = Number(body.salesStandard);
    out.salesStandardVat = Number(body.salesStandardVat);
    return out;
  }
  async function raise(body: Record<string, unknown>): Promise<E2eClaim> {
    const description = `مطالبة ${++seq}`;
    const res = await auth(http().post(`/contracts/${contractId}/claims`)).send({ issuedAt: todayIso, description, ...body }).expect(201);
    const claim = (res.body.claims as E2eClaim[]).find((c) => c.description === description);
    if (!claim) throw new Error('المطالبةُ المُنشأة غائبةٌ عن العقد');
    return claim;
  }

  it('⭐ ① المطالبةُ بلا معاملةٍ مختارة خاضعةٌ ١٥٪ فوق مبلغها: ذمّةٌ بإجماليّها، وإيرادٌ بصافيها، وضريبتُها في الإقرار', async () => {
    const before = { l: await ledger(), r: await rent() };
    const claim = await raise({ kind: 'UTILITIES', amount: 100 });
    expect(claim.taxTreatment).toBe('TAXABLE_SERVICE');
    expect(Number(claim.taxAmount)).toBeCloseTo(15, 2);
    const after = { l: await ledger(), r: await rent() };
    expect(after.l.receivable - before.l.receivable).toBeCloseTo(115, 2);
    expect(after.l.other - before.l.other).toBeCloseTo(100, 2);
    expect(after.l.vat - before.l.vat).toBeCloseTo(15, 2);
    expect(after.r.chargesStandard - before.r.chargesStandard).toBeCloseTo(100, 2);
    expect(after.r.chargesStandardVat - before.r.chargesStandardVat).toBeCloseTo(15, 2);
    expect(after.r.salesStandardVat - before.r.salesStandardVat).toBeCloseTo(15, 2);
  });

  it('② المبلغُ المدفوعُ نيابةً: بلا ما يثبت الشروطَ يُرفض، ومعه حسابٌ وسيطٌ لا إيرادٌ ولا ضريبة', async () => {
    const refused = await auth(http().post(`/contracts/${contractId}/claims`))
      .send({ issuedAt: todayIso, description: 'كهرباء نيابةً', kind: 'UTILITIES', amount: 80, taxTreatment: 'ON_BEHALF' })
      .expect(400);
    expect(String(refused.body.message)).toContain('نيابةً');
    const before = { l: await ledger(), r: await rent() };
    const claim = await raise({ kind: 'UTILITIES', amount: 80, taxTreatment: 'ON_BEHALF', onBehalfEvidence: 'العدّادُ باسم المستأجر، والفاتورةُ رقم 7781 مرفقة' });
    expect(claim.taxTreatment).toBe('ON_BEHALF');
    expect(Number(claim.taxAmount)).toBeCloseTo(0, 2);
    const after = { l: await ledger(), r: await rent() };
    expect(after.l.receivable - before.l.receivable).toBeCloseTo(80, 2);
    // الحسابُ الوسيطُ أصلٌ (ما دُفع عن المستأجر)، والمطالبةُ تُقيَّد دائنةً فيه فينقص رصيدُه.
    expect(after.l.onBehalf - before.l.onBehalf).toBeCloseTo(-80, 2);
    expect(after.l.other - before.l.other).toBeCloseTo(0, 2);
    expect(after.l.vat - before.l.vat).toBeCloseTo(0, 2);
    expect(after.r.chargesStandard - before.r.chargesStandard).toBeCloseTo(0, 2);
  });

  it('③ تعويضُ الضرر خارج النطاق: إيرادٌ بلا ضريبة كما كان', async () => {
    const before = { l: await ledger(), r: await rent() };
    await raise({ kind: 'DAMAGE', amount: 500, taxTreatment: 'COMPENSATION' });
    const after = { l: await ledger(), r: await rent() };
    expect(after.l.receivable - before.l.receivable).toBeCloseTo(500, 2);
    expect(after.l.other - before.l.other).toBeCloseTo(500, 2);
    expect(after.l.vat - before.l.vat).toBeCloseTo(0, 2);
    expect(after.r.chargesStandard - before.r.chargesStandard).toBeCloseTo(0, 2);
  });

  it('④ تحصيلُ الخاضعة بإجماليّها، وإسقاطُها يعكس الإيرادَ والضريبة ويُنقص الإقرار', async () => {
    const paid = await raise({ kind: 'MAINTENANCE', amount: 200 });
    const before = await ledger();
    await auth(http().post(`/contracts/${contractId}/claims/${paid.id}/pay`)).send({ paidAt: todayIso }).expect(201);
    const afterPay = await ledger();
    expect(afterPay.cash - before.cash).toBeCloseTo(230, 2);
    expect(afterPay.receivable - before.receivable).toBeCloseTo(-230, 2);

    const waived = await raise({ kind: 'MAINTENANCE', amount: 300 });
    const beforeWaive = { l: await ledger(), r: await rent() };
    await auth(http().post(`/contracts/${contractId}/claims/${waived.id}/waive`)).send({ waivedAt: todayIso, reason: 'تسويةٌ ودّية' }).expect(201);
    const afterWaive = { l: await ledger(), r: await rent() };
    expect(afterWaive.l.receivable - beforeWaive.l.receivable).toBeCloseTo(-345, 2);
    expect(afterWaive.l.other - beforeWaive.l.other).toBeCloseTo(-300, 2);
    expect(afterWaive.l.vat - beforeWaive.l.vat).toBeCloseTo(-45, 2);
    expect(afterWaive.r.chargesStandard - beforeWaive.r.chargesStandard).toBeCloseTo(-300, 2);
    expect(afterWaive.r.chargesStandardVat - beforeWaive.r.chargesStandardVat).toBeCloseTo(-45, 2);
  });

  it('⭐ ⑤ الخصمُ من التأمين: النظافةُ خاضعةٌ من إجماليّها · المرافقُ نيابةً · «أخرى» يُسأل عنها · والضررُ كما هو', async () => {
    const deposit = await auth(http().post(`/contracts/${contractId}/deposits`)).send({ type: 'RENT', amount: 1000, receivedAt: todayIso }).expect(201);
    const depositId = (deposit.body.deposits as { id: string; status: string }[]).find((d) => d.status === 'HELD')!.id;

    // «أخرى» بلا معاملةٍ مختارة يُرفض — يُسأل عنها عند إدخالها.
    const unasked = await auth(http().post(`/contracts/${contractId}/deposits/${depositId}/settle`))
      .send({ settledAt: todayIso, deductions: [{ kind: 'OTHER', amount: 30, reason: 'شيءٌ آخر' }] })
      .expect(400);
    expect(String(unasked.body.message)).toContain('أخرى');

    const before = { l: await ledger(), r: await rent() };
    await auth(http().post(`/contracts/${contractId}/deposits/${depositId}/settle`))
      .send({
        settledAt: todayIso,
        deductions: [
          { kind: 'CLEANING', amount: 115, reason: 'تنظيفٌ عند الخروج' },
          { kind: 'UTILITIES', amount: 50, reason: 'ماءٌ متأخّر', taxTreatment: 'ON_BEHALF', onBehalfEvidence: 'عدّادُ الماء باسم المستأجر' },
          { kind: 'OTHER', amount: 30, reason: 'مفتاحٌ مفقود', taxTreatment: 'COMPENSATION' },
          { kind: 'DAMAGE', amount: 100, reason: 'بابٌ مكسور' },
        ],
      })
      .expect(201);
    const after = { l: await ledger(), r: await rent() };
    // 1000 − (115 + 50 + 30 + 100) = 705 يُردّ.
    expect(after.l.deposits - before.l.deposits).toBeCloseTo(-1000, 2);
    expect(after.l.cash - before.l.cash).toBeCloseTo(-705, 2);
    expect(after.l.other - before.l.other).toBeCloseTo(100 + 30 + 100, 2);
    expect(after.l.vat - before.l.vat).toBeCloseTo(15, 2);
    expect(after.l.onBehalf - before.l.onBehalf).toBeCloseTo(-50, 2);
    expect(after.r.chargesStandard - before.r.chargesStandard).toBeCloseTo(100, 2);
    expect(after.r.chargesStandardVat - before.r.chargesStandardVat).toBeCloseTo(15, 2);
  });

  it('⭐ ⑥ الحبسُ في القاعدة: القيمةُ القديمة لمطالبةٍ جديدة، وخصمُ نظافةٍ جديدٌ بلا معاملة — يرفضهما قيدان مسمّيان', async () => {
    const claim = await raise({ kind: 'OTHER', amount: 10, taxTreatment: 'COMPENSATION' });
    const attempt = async (sql: Prisma.Sql): Promise<string> => {
      try {
        await tenantPrisma.runInTenantContext(company.companyId, (tx) => tx.$executeRaw(sql));
        return '';
      } catch (e) {
        return String((e as Error).message);
      }
    };
    const legacy = await attempt(Prisma.sql`UPDATE "contract_claims" SET "taxTreatment" = 'LEGACY_UNTAXED'::"ChargeTaxTreatment" WHERE "id" = ${claim.id}`);
    expect(legacy).toContain('contract_claims_legacy_treatment_before_cutover');
    const deduction = await tenantPrisma.runInTenantContext(company.companyId, (tx) => tx.depositDeduction.findFirst({ where: { kind: 'CLEANING' } }));
    expect(deduction).not.toBeNull();
    const untreated = await attempt(Prisma.sql`UPDATE "deposit_deductions" SET "taxTreatment" = NULL WHERE "id" = ${deduction!.id}`);
    expect(untreated).toContain('deposit_deductions_treatment_declared');
  });
});
