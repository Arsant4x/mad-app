import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { dayEndOf } from '../src/common/wall-clock.util';
import { RentAccrualService } from '../src/contracts/rent-accrual.service';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): تقديرٌ أوّلٌ قبل أن تُقاس، ويُضبط بثلاثة أضعاف أوّلِ زمنٍ مقيسٍ في السير.
jest.setTimeout(180000);

/**
 * ⚖️ **بنودُ الرسوم على العقد** (السؤالان ٤٩ و٤١٣ · `ق-١٦٠٠` · `ق-١٦٠٩`/د، بحكم صاحب المشروع: «بنودٌ على العقد تُفوتر مع القسط»).
 *
 * الرسمُ المسمّى فوق الإيجار (موقف · نظافة · خدمات) **توريدٌ منفصل خاضعٌ ١٥٪ ولو كان الإيجارُ سكنيّاً معفى** — ومثالُ الهيئة موقفٌ
 * بثلاثمئة خاضعٌ والإيجارُ معفى (دليلُ العقارات §6.1 ومثال 8). فالعقدُ يحمل بنودَ رسومٍ بمبالغها، وكلُّ قسطٍ يحلّ تُطالَب معه رسومُه
 * مطالبةً خاضعة بتاريخ استحقاقه، فتدخل الذمّةَ والإقرارَ كالإيجار.
 *
 * والجوابُ محسوبٌ يداً (`ق-٧١٥`): قسطٌ بألفٍ معفى، وموقفٌ بثلاثمئة وضريبتُه خمسةٌ وأربعون.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
const dayBefore = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1));
const quarterOf = (d: Date) => ({ year: d.getUTCFullYear(), quarter: Math.floor(d.getUTCMonth() / 3) + 1 });

interface E2eContract {
  id: string;
  installments: { id: string; dueDate: string }[];
  fees: { id: string; label: string; amount: string; endedAt: string | null }[];
  claims: { id: string; kind: string; amount: string; taxAmount: string; taxTreatment: string; issuedAt: string; description: string }[];
}

describe('⚖️ بنودُ الرسوم على العقد (السؤالان ٤٩ و٤١٣) (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let token: string;
  let seq = 0;

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const today = dayEndOf(new Date());
  const thisQuarter = quarterOf(today);
  const start = monthStart(today);
  const end = dayBefore(addMonths(start, 12));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    company = await registerIsolatedCompany(app, 'fees');
    token = company.token;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  async function balance(code: string): Promise<number> {
    const accounts = await auth(http().get('/accounts')).expect(200);
    return Number(accounts.body.find((a: { code: string }) => a.code === code)?.balance ?? 0);
  }
  async function rent(): Promise<Record<string, number>> {
    const body = (await auth(http().get('/obligations/vat-declaration')).query(thisQuarter).expect(200)).body;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(body.rent as Record<string, unknown>)) out[k] = Number(v);
    return out;
  }
  async function makeContract(fees?: { label: string; amount: number }[]): Promise<E2eContract> {
    const tag = `${Date.now()}-${++seq}`;
    const property = await auth(http().post('/properties')).send({ name: `عقار الرسوم ${tag}`, ownership: 'owned' }).expect(201);
    const unit = await auth(http().post('/units')).send({ propertyId: property.body.id, unitNo: `F-${tag}`, type: 'شقة', rentMonthly: 1000 }).expect(201);
    return (
      await auth(http().post('/contracts'))
        .send({
          unitId: unit.body.id,
          customerId: await createTenantCustomer(app, token, `مستأجر الرسوم ${tag}`),
          value: 12000,
          cycle: 'monthly',
          start: iso(start),
          end: iso(end),
          classification: 'RESIDENTIAL',
          vatInclusion: 'EXCLUSIVE',
          ...(fees ? { fees } : {}),
        })
        .expect(201)
    ).body as E2eContract;
  }
  const readContract = async (id: string) => (await auth(http().get(`/contracts/${id}`)).expect(200)).body as E2eContract;
  const dueCount = (c: E2eContract) => c.installments.filter((i) => new Date(i.dueDate) <= today).length;
  const feeClaims = (c: E2eContract) => c.claims.filter((x) => x.kind === 'FEE');

  it('⭐ ① الرسمُ على عقدٍ سكنيّ خاضعٌ وحدَه: كلُّ قسطٍ حلّ تُطالَب معه رسومُه بضريبتها، والإيجارُ معفى', async () => {
    const before = { receivable: await balance('1200'), other: await balance('4300'), vat: await balance('2200'), r: await rent() };
    const contract = await makeContract([{ label: 'موقف سيارة', amount: 300 }]);
    expect(contract.fees).toHaveLength(1);
    expect(contract.fees[0].label).toBe('موقف سيارة');
    const due = dueCount(contract);
    expect(due).toBeGreaterThan(0);

    const claims = feeClaims(contract);
    expect(claims).toHaveLength(due);
    for (const c of claims) {
      expect(Number(c.amount)).toBeCloseTo(300, 2);
      expect(Number(c.taxAmount)).toBeCloseTo(45, 2);
      expect(c.taxTreatment).toBe('TAXABLE_SERVICE');
      expect(c.description).toContain('موقف سيارة');
    }
    // تاريخُ المطالبة تاريخُ استحقاق قسطها — الرسمُ يُفوتر مع القسط.
    const dueDates = contract.installments.filter((i) => new Date(i.dueDate) <= today).map((i) => i.dueDate.slice(0, 10)).sort();
    expect(claims.map((c) => c.issuedAt.slice(0, 10)).sort()).toEqual(dueDates);

    const after = { receivable: await balance('1200'), other: await balance('4300'), vat: await balance('2200'), r: await rent() };
    // الذمّةُ: الإيجارُ المعفى ألفٌ والرسمُ بضريبته 345 لكلِّ قسطٍ حلّ.
    expect(after.receivable - before.receivable).toBeCloseTo(1345 * due, 2);
    expect(after.other - before.other).toBeCloseTo(300 * due, 2);
    expect(after.vat - before.vat).toBeCloseTo(45 * due, 2);
    expect(after.r.chargesStandard - before.r.chargesStandard).toBeCloseTo(300 * due, 2);
    expect(after.r.chargesStandardVat - before.r.chargesStandardVat).toBeCloseTo(45 * due, 2);
    expect(after.r.exempt - before.r.exempt).toBeCloseTo(1000 * due, 2);
  });

  it('② الكنسُ المكرَّر لا يُطالب الرسمَ مرّتين', async () => {
    const contract = await makeContract([{ label: 'نظافة', amount: 50 }]);
    const due = dueCount(contract);
    await app.get(RentAccrualService).runForCompany(company.companyId);
    await app.get(RentAccrualService).runForCompany(company.companyId);
    expect(feeClaims(await readContract(contract.id))).toHaveLength(due);
  });

  it('③ رسمٌ يُضاف لعقدٍ قائم يُطالَب لما حلّ من أقساطه منذ سريانه، وإنهاؤه يوقف ما بعده', async () => {
    const contract = await makeContract();
    expect(feeClaims(contract)).toHaveLength(0);
    const due = dueCount(contract);

    // الردُّ البندُ وحدَه بعدد ما رُفع معه (`CreatedContractFeeResponse` · ق-١٤٣٨)، والعقدُ يُقرأ بعده.
    type FeeReply = { id: string; amount: string; endedAt: string | null; raisedClaims?: number };
    const added = (await auth(http().post(`/contracts/${contract.id}/fees`)).send({ label: 'خدمات', amount: 100, effectiveFrom: iso(start) }).expect(201)).body as FeeReply;
    expect({ amount: added.amount, raisedClaims: added.raisedClaims }).toEqual({ amount: '100.00', raisedClaims: due });
    const afterAdd = await readContract(contract.id);
    expect(afterAdd.fees).toHaveLength(1);
    expect(feeClaims(afterAdd)).toHaveLength(due);

    // إنهاؤه اليومَ: لا يُطالَب لقسطٍ يحلّ بعده — ولو كُنس حتى نهاية العقد.
    const ended = (await auth(http().post(`/contracts/${contract.id}/fees/${added.id}/end`)).send({ endedAt: iso(today) }).expect(201)).body as FeeReply;
    expect(ended.endedAt).toBe(iso(today));
    await app.get(RentAccrualService).runForCompany(company.companyId, end);
    expect(feeClaims(await readContract(contract.id))).toHaveLength(due);
  });

  it('④ الرسمُ يُسمّى وله مبلغٌ موجب', async () => {
    const contract = await makeContract();
    await auth(http().post(`/contracts/${contract.id}/fees`)).send({ label: '   ', amount: 100 }).expect(400);
    await auth(http().post(`/contracts/${contract.id}/fees`)).send({ label: 'موقف', amount: 0 }).expect(400);
  });
});
