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
 * ⚖️ **عقارُ التشغيل: من المؤجّر؟** (السؤال ٥٧٧ · `ق-١٦٠٠` · `ق-١٦٠٩`/أ، بحكم صاحب المشروع).
 *
 * الفيصلُ عند الهيئة باسم من يُبرم عقدُ الإيجار:
 *   · **المنشأةُ مؤجّرة** (مالكةٌ، أو مستأجرةٌ رئيساً، أو مشغّلٌ وقّع مؤجّراً): الإيجارُ إيرادُها، والتجاريُّ عليه ١٥٪ في إقرارها.
 *   · **المالكُ مؤجّر** والمنشأةُ وكيلٌ معلَن: الإيجارُ أمانةٌ للمالك في حساب التزام لا إيراد، ويخرج السكنيُّ والتجاريُّ
 *     من إقرار المنشأة، **والعمولةُ إيرادُها بضريبة ١٥٪ دائماً**.
 *
 * وكان النظامُ يخلط الحالتين (الإيجارُ كلُّه إيرادُ المنشأة، والتجاريُّ بلا ضريبةٍ وخارجَ الإقرار). والجوابُ هنا محسوبٌ يداً
 * (`ق-٧١٥`): قسطٌ بألف، والعمولةُ عشرةٌ في المئة من الإيجار بلا ضريبة المالك، وضريبتُها خمسةَ عشرَ في المئة منها.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
const dayBefore = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1));
const quarterOf = (d: Date) => ({ year: d.getUTCFullYear(), quarter: Math.floor(d.getUTCMonth() / 3) + 1 });

interface E2eInstallment {
  id: string;
  dueDate: string;
  amount: string | number;
}

describe('⚖️ عقارُ التشغيل: من المؤجّر (السؤال ٥٧٧) (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;
  let token: string;
  let seq = 0;

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const today = dayEndOf(new Date());
  const todayIso = iso(today);
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
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'lessor');
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

  async function makeUnit(ownership: 'owned' | 'managed', opRate?: number): Promise<string> {
    const tag = `${Date.now()}-${++seq}`;
    const property = await auth(http().post('/properties'))
      .send({ name: `عقار المؤجّر ${tag}`, ownership, ...(opRate !== undefined ? { opRate } : {}) })
      .expect(201);
    const unit = await auth(http().post('/units')).send({ propertyId: property.body.id, unitNo: `L-${tag}`, type: 'شقة', rentMonthly: 1000 }).expect(201);
    return unit.body.id as string;
  }

  async function contractBody(unitId: string, opts: { classification: 'RESIDENTIAL' | 'COMMERCIAL'; vatInclusion?: 'INCLUSIVE' | 'EXCLUSIVE' }) {
    return {
      unitId,
      customerId: await createTenantCustomer(app, token, `مستأجر المؤجّر ${++seq}`),
      value: 12000,
      cycle: 'monthly',
      start: iso(start),
      end: iso(end),
      classification: opts.classification,
      vatInclusion: opts.vatInclusion ?? 'EXCLUSIVE',
    };
  }

  /** قسمُ الإيجار في إقرار الربع الجاري — المالُ نصٌّ بخانتين يُقرأ رقماً هنا. */
  async function rent(): Promise<Record<string, number>> {
    const body = (await auth(http().get('/obligations/vat-declaration')).query(thisQuarter).expect(200)).body;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(body.rent as Record<string, unknown>)) out[k] = Number(v);
    out.salesStandardVat = Number(body.salesStandardVat);
    out.salesStandard = Number(body.salesStandard);
    return out;
  }

  const accrualsOf = (contractId: string) => tenantPrisma.runInTenantContext(company.companyId, (tx) => tx.rentAccrual.count({ where: { contractId } }));

  it('① عقارُ تشغيل: عقدٌ بلا مؤجّرٍ معلَنٍ يُرفض — فالفيصلُ لا يُفترض', async () => {
    const unitId = await makeUnit('managed', 10);
    const res = await auth(http().post('/contracts')).send(await contractBody(unitId, { classification: 'RESIDENTIAL' })).expect(400);
    expect(String(res.body.message)).toContain('المؤجّر');
  });

  it('② المالكُ مؤجّراً على عقارٍ مملوكٍ للمنشأة يُرفض', async () => {
    const unitId = await makeUnit('owned');
    const res = await auth(http().post('/contracts'))
      .send({ ...(await contractBody(unitId, { classification: 'RESIDENTIAL' })), lessor: 'OWNER', ownerName: 'مالكٌ ما' })
      .expect(400);
    expect(String(res.body.message)).toContain('تشغيل');
  });

  it('③ المالكُ مؤجّراً: بلا اسمه يُرفض · والتجاريُّ بلا رقمه الضريبيّ يُرفض · والرقمُ المشوَّه يُرفض · وعقارٌ بلا نسبة عمولةٍ يُرفض', async () => {
    const unitId = await makeUnit('managed', 10);
    const noName = await auth(http().post('/contracts')).send({ ...(await contractBody(unitId, { classification: 'RESIDENTIAL' })), lessor: 'OWNER' }).expect(400);
    expect(String(noName.body.message)).toContain('اسم المالك');
    const noVat = await auth(http().post('/contracts'))
      .send({ ...(await contractBody(unitId, { classification: 'COMMERCIAL' })), lessor: 'OWNER', ownerName: 'مالكٌ تجاريّ' })
      .expect(400);
    expect(String(noVat.body.message)).toContain('الرقم الضريبيّ');
    await auth(http().post('/contracts'))
      .send({ ...(await contractBody(unitId, { classification: 'COMMERCIAL' })), lessor: 'OWNER', ownerName: 'مالكٌ تجاريّ', ownerVatNumber: '123' })
      .expect(400);
    const noRateUnit = await makeUnit('managed');
    const noRate = await auth(http().post('/contracts'))
      .send({ ...(await contractBody(noRateUnit, { classification: 'RESIDENTIAL' })), lessor: 'OWNER', ownerName: 'مالكٌ بلا نسبة' })
      .expect(400);
    expect(String(noRate.body.message)).toContain('العمولة');
  });

  it('⭐ ④ المالكُ مؤجّراً: الإيجارُ أمانةٌ له في 2500 لا إيراد، والعمولةُ إيرادٌ في 4250 بضريبتها، ولا استحقاقَ في دفاتر المنشأة', async () => {
    const before = { cash: await balance('1000'), owner: await balance('2500'), commission: await balance('4250'), vat: await balance('2200'), rent: await balance('4200'), receivable: await balance('1200'), decl: await rent() };

    // سكنيٌّ: القسطُ ألف بلا ضريبة ⇒ العمولة 100 وضريبتُها 15 ⇒ للمالك 885.
    const resUnit = await makeUnit('managed', 10);
    const residential = (
      await auth(http().post('/contracts'))
        .send({ ...(await contractBody(resUnit, { classification: 'RESIDENTIAL' })), lessor: 'OWNER', ownerName: 'مالكُ الشقق' })
        .expect(201)
    ).body as { id: string; lessor: string; ownerName: string; installments: E2eInstallment[] };
    expect(residential.lessor).toBe('OWNER');
    expect(residential.ownerName).toBe('مالكُ الشقق');
    expect(await accrualsOf(residential.id)).toBe(0);
    await auth(http().post(`/contracts/${residential.id}/payments`)).send({ installmentId: residential.installments[0].id, amount: 1000, method: 'CASH', date: todayIso }).expect(201);

    // تجاريٌّ غيرُ شامل: القسطُ ألف وضريبةُ المالك 150 ⇒ يُقبض 1150 ⇒ العمولة على الألف 100 وضريبتُها 15 ⇒ للمالك 1035.
    const comUnit = await makeUnit('managed', 10);
    const commercial = (
      await auth(http().post('/contracts'))
        .send({ ...(await contractBody(comUnit, { classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE' })), lessor: 'OWNER', ownerName: 'مالكُ المحلّات', ownerVatNumber: '300000000000003' })
        .expect(201)
    ).body as { id: string; installments: E2eInstallment[] };
    expect(await accrualsOf(commercial.id)).toBe(0);
    await auth(http().post(`/contracts/${commercial.id}/payments`)).send({ installmentId: commercial.installments[0].id, amount: 1150, method: 'CASH', date: todayIso }).expect(201);

    const after = { cash: await balance('1000'), owner: await balance('2500'), commission: await balance('4250'), vat: await balance('2200'), rent: await balance('4200'), receivable: await balance('1200'), decl: await rent() };

    // الدفتر: الحسابُ الدائنُ رصيدُه موجبٌ في /accounts (طبيعتُه) — والفروقُ محسوبةٌ يداً.
    expect(after.cash - before.cash).toBeCloseTo(2150, 2);
    expect(after.owner - before.owner).toBeCloseTo(885 + 1035, 2);
    expect(after.commission - before.commission).toBeCloseTo(200, 2);
    expect(after.vat - before.vat).toBeCloseTo(30, 2);
    expect(after.rent - before.rent).toBeCloseTo(0, 2);
    expect(after.receivable - before.receivable).toBeCloseTo(0, 2);

    // الإقرار: العمولتان توريدٌ خاضع (الخانة ١) بضريبتهما، وإيجارُ المالكين يُعدّ ولا يدخل.
    expect(after.decl.commissionStandard - before.decl.commissionStandard).toBeCloseTo(200, 2);
    expect(after.decl.commissionStandardVat - before.decl.commissionStandardVat).toBeCloseTo(30, 2);
    expect(after.decl.ownerCollected - before.decl.ownerCollected).toBeCloseTo(2150, 2);
    expect(after.decl.ownerCount - before.decl.ownerCount).toBe(2);
    expect(after.decl.salesStandardVat - before.decl.salesStandardVat).toBeCloseTo(30, 2);
    expect(after.decl.salesStandard - before.decl.salesStandard).toBeCloseTo(200, 2);
    expect(after.decl.exempt - before.decl.exempt).toBeCloseTo(0, 2);
    expect(after.decl.standard - before.decl.standard).toBeCloseTo(0, 2);

    // والقسطُ مسدَّدٌ بإجماليّه (بضريبة المالك للتجاريّ).
    const fetched = (await auth(http().get(`/contracts/${commercial.id}`)).expect(200)).body as { installments: (E2eInstallment & { status: string })[] };
    expect(fetched.installments.find((i) => i.id === commercial.installments[0].id)?.status).toBe('PAID');

    // ولا يُغيَّر المؤجّرُ بعد قبض: فالقبضُ رُحّل على أنه أمانةٌ للمالك.
    const locked = await auth(http().patch(`/contracts/${residential.id}`)).send({ lessor: 'COMPANY' }).expect(409);
    expect(String(locked.body.message)).toContain('المؤجّر');
  });

  it('⑤ المنشأةُ مؤجّرةً على عقار تشغيل: التجاريُّ خاضعٌ في إقرارها كالمملوك', async () => {
    const before = await rent();
    const unitId = await makeUnit('managed', 10);
    const contract = (
      await auth(http().post('/contracts'))
        .send({ ...(await contractBody(unitId, { classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE' })), lessor: 'COMPANY' })
        .expect(201)
    ).body as { id: string; lessor: string; installments: E2eInstallment[] };
    expect(contract.lessor).toBe('COMPANY');
    const due = contract.installments.filter((i) => new Date(i.dueDate) <= today).length;
    expect(due).toBeGreaterThan(0);
    const after = await rent();
    expect(after.standard - before.standard).toBeCloseTo(1000 * due, 2);
    expect(after.standardVat - before.standardVat).toBeCloseTo(150 * due, 2);
    expect(after.managedCount - before.managedCount).toBe(0);
  });

  it('⑥ عقدٌ قديمٌ على عقار تشغيلٍ لم يُعلَن مؤجّرُه: لا يُعدَّل قبل إعلانه، ثم يُعلَن بيدٍ', async () => {
    const unitId = await makeUnit('managed', 10);
    const created = (await auth(http().post('/contracts')).send({ ...(await contractBody(unitId, { classification: 'RESIDENTIAL' })), lessor: 'COMPANY' }).expect(201)).body as { id: string };
    // يُحاكى صفٌّ سبق الهجرة: القيمةُ القديمة مع createdAt قبل لحظة الهجرة — وهو ما يجيزه القيدُ للقديم وحدَه.
    await tenantPrisma.runInTenantContext(company.companyId, (tx) =>
      tx.$executeRaw(Prisma.sql`UPDATE "contracts" SET "lessor" = 'LEGACY_UNDECLARED'::"ContractLessor", "createdAt" = TIMESTAMP '2020-01-01 00:00:00' WHERE "id" = ${created.id}`),
    );
    const blocked = await auth(http().patch(`/contracts/${created.id}`)).send({ services: 'خدمةٌ جديدة' }).expect(400);
    expect(String(blocked.body.message)).toContain('المؤجّر');
    const declared = await auth(http().patch(`/contracts/${created.id}`)).send({ lessor: 'OWNER', ownerName: 'مالكٌ مُعلَن', services: 'خدمةٌ جديدة' }).expect(200);
    expect(declared.body.lessor).toBe('OWNER');
    expect(declared.body.ownerName).toBe('مالكٌ مُعلَن');
  });

  it('⭐ ⑦ الحبسُ في القاعدة: القيمةُ القديمة لصفٍّ جديد، والمالكُ بلا اسمه — يرفضهما قيدان مسمّيان', async () => {
    const unitId = await makeUnit('managed', 10);
    const created = (await auth(http().post('/contracts')).send({ ...(await contractBody(unitId, { classification: 'RESIDENTIAL' })), lessor: 'COMPANY' }).expect(201)).body as { id: string };
    const attempt = async (sql: Prisma.Sql): Promise<string> => {
      try {
        await tenantPrisma.runInTenantContext(company.companyId, (tx) => tx.$executeRaw(sql));
        return '';
      } catch (e) {
        return String((e as Error).message);
      }
    };
    const legacy = await attempt(Prisma.sql`UPDATE "contracts" SET "lessor" = 'LEGACY_UNDECLARED'::"ContractLessor", "createdAt" = clock_timestamp() WHERE "id" = ${created.id}`);
    expect(legacy).toContain('contracts_legacy_lessor_before_cutover');
    const nameless = await attempt(Prisma.sql`UPDATE "contracts" SET "lessor" = 'OWNER'::"ContractLessor", "ownerName" = NULL WHERE "id" = ${created.id}`);
    expect(nameless).toContain('contracts_owner_lessor_named');
  });
});
