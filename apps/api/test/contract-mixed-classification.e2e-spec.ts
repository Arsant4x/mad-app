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
 * ⚖️ **التصنيفُ الثالث والعقدُ المختلط** (السؤالان ٥٩ و٤١٢ · `ق-١٦٠٠` · `ق-١٦٠٩`/د، بحكم صاحب المشروع).
 *
 * · **الإيواءُ المخدومُ أو المؤقّت خاضعٌ ١٥٪** (دليلُ العقارات §6.1 ومثال 7): قيمةُ تصنيفٍ ثالثة، لا تخمينَ من الوحدة.
 * · **العقدُ المختلطُ الواحد يُقسَّم داخلَه** (§6.2 و§6.3 ومثال 9): نسبةُ المعفى يعلنها المؤجّرُ بأساسه، فينقسم كلُّ قسطٍ
 *   بين معفى وخاضع، والضريبةُ على الخاضع وحدَه، والإقرارُ يقرأ الجزأين.
 *
 * والجوابُ محسوبٌ يداً (`ق-٧١٥`): قسطٌ بألف، ونصيبُ المعفى أربعون في المئة.
 *   · غيرُ شامل: الخاضعُ 600 وضريبتُه 90 ⇒ يدين المستأجرُ 1090، والمعفى 400.
 *   · شامل: الضريبةُ 1000 × 0.09 ÷ 1.09 = 82.57 ⇒ الصافي 917.43، منه المعفى 366.97 والخاضعُ 550.46 (و550.46 × 15٪ = 82.57).
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
  gross?: string;
}

describe('⚖️ التصنيفُ الثالث والعقدُ المختلط (السؤالان ٥٩ و٤١٢) (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
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
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'mixed');
    token = company.token;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  async function makeUnit(ownership: 'owned' | 'managed' = 'owned', opRate?: number): Promise<string> {
    const tag = `${Date.now()}-${++seq}`;
    const property = await auth(http().post('/properties'))
      .send({ name: `عقار التصنيف ${tag}`, ownership, ...(opRate !== undefined ? { opRate } : {}) })
      .expect(201);
    const unit = await auth(http().post('/units')).send({ propertyId: property.body.id, unitNo: `M-${tag}`, type: 'شقة', rentMonthly: 1000 }).expect(201);
    return unit.body.id as string;
  }

  async function contractBody(unitId: string, classification: string, vatInclusion: 'INCLUSIVE' | 'EXCLUSIVE', extra: Record<string, unknown> = {}) {
    return {
      unitId,
      customerId: await createTenantCustomer(app, token, `مستأجر التصنيف ${++seq}`),
      value: 12000,
      cycle: 'monthly',
      start: iso(start),
      end: iso(end),
      classification,
      vatInclusion,
      ...extra,
    };
  }

  /** قسمُ الإيجار في إقرار الربع الجاري — المالُ نصٌّ بخانتين يُقرأ رقماً هنا. */
  async function rent(): Promise<Record<string, number>> {
    const body = (await auth(http().get('/obligations/vat-declaration')).query(thisQuarter).expect(200)).body;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(body.rent as Record<string, unknown>)) out[k] = Number(v);
    return out;
  }

  const dueCount = (installments: E2eInstallment[]) => installments.filter((i) => new Date(i.dueDate) <= today).length;

  it('① الإيواءُ المخدوم قيمةُ تصنيفٍ ثالثة خاضعةٌ ١٥٪ في الإقرار، لا معفاة', async () => {
    const before = await rent();
    const contract = (await auth(http().post('/contracts')).send(await contractBody(await makeUnit(), 'SERVICED_LODGING', 'EXCLUSIVE')).expect(201)).body as {
      classification: string;
      installments: E2eInstallment[];
    };
    expect(contract.classification).toBe('SERVICED_LODGING');
    const due = dueCount(contract.installments);
    expect(due).toBeGreaterThan(0);
    expect(Number(contract.installments[0].gross)).toBeCloseTo(1150, 2);
    const after = await rent();
    expect(after.standard - before.standard).toBeCloseTo(1000 * due, 2);
    expect(after.standardVat - before.standardVat).toBeCloseTo(150 * due, 2);
    expect(after.exempt - before.exempt).toBeCloseTo(0, 2);
  });

  it('② المختلطُ يُعلَن فيه نصيبُ المعفى وأساسُه، ونسبةٌ على غير المختلط تُرفض', async () => {
    const unitId = await makeUnit();
    const missing = await auth(http().post('/contracts')).send(await contractBody(unitId, 'MIXED', 'EXCLUSIVE')).expect(400);
    expect(String(missing.body.message)).toContain('المختلط');
    const noBasis = await auth(http().post('/contracts')).send(await contractBody(unitId, 'MIXED', 'EXCLUSIVE', { exemptSharePercent: 40 })).expect(400);
    expect(String(noBasis.body.message)).toContain('المختلط');
    await auth(http().post('/contracts')).send(await contractBody(unitId, 'MIXED', 'EXCLUSIVE', { exemptSharePercent: 100, exemptShareBasis: 'المساحة' })).expect(400);
    await auth(http().post('/contracts')).send(await contractBody(unitId, 'MIXED', 'EXCLUSIVE', { exemptSharePercent: 0, exemptShareBasis: 'المساحة' })).expect(400);
    const stray = await auth(http().post('/contracts')).send(await contractBody(unitId, 'COMMERCIAL', 'EXCLUSIVE', { exemptSharePercent: 40, exemptShareBasis: 'المساحة' })).expect(400);
    expect(String(stray.body.message)).toContain('المختلط');
  });

  it('⭐ ③ المختلطُ غيرُ الشامل: الضريبةُ على الخاضع وحدَه، والإقرارُ يقرأ الجزأين', async () => {
    const before = await rent();
    const contract = (
      await auth(http().post('/contracts'))
        .send(await contractBody(await makeUnit(), 'MIXED', 'EXCLUSIVE', { exemptSharePercent: 40, exemptShareBasis: 'المساحة: شقّتان من خمس وحدات' }))
        .expect(201)
    ).body as { id: string; exemptSharePercent: string; exemptShareBasis: string; installments: E2eInstallment[] };
    expect(Number(contract.exemptSharePercent)).toBe(40);
    expect(contract.exemptShareBasis).toContain('المساحة');
    const due = dueCount(contract.installments);
    expect(due).toBeGreaterThan(0);
    expect(Number(contract.installments[0].gross)).toBeCloseTo(1090, 2);

    const rows = await tenantPrisma.runInTenantContext(company.companyId, (tx) => tx.rentAccrual.findMany({ where: { contractId: contract.id, kind: 'DUE' } }));
    expect(rows).toHaveLength(due);
    for (const r of rows) {
      expect(Number(r.baseNet)).toBeCloseTo(1000, 2);
      expect(Number(r.baseTax)).toBeCloseTo(90, 2);
      expect(Number((r as unknown as { baseExemptNet: Prisma.Decimal }).baseExemptNet)).toBeCloseTo(400, 2);
    }

    const after = await rent();
    expect(after.standard - before.standard).toBeCloseTo(600 * due, 2);
    expect(after.standardVat - before.standardVat).toBeCloseTo(90 * due, 2);
    expect(after.exempt - before.exempt).toBeCloseTo(400 * due, 2);
  });

  it('④ المختلطُ الشامل: الضريبةُ من الخاضع داخل القسط، والمعفى نصيبُه من الصافي', async () => {
    const before = await rent();
    const contract = (
      await auth(http().post('/contracts'))
        .send(await contractBody(await makeUnit(), 'MIXED', 'INCLUSIVE', { exemptSharePercent: 40, exemptShareBasis: 'القيمةُ السوقية' }))
        .expect(201)
    ).body as { installments: E2eInstallment[] };
    const due = dueCount(contract.installments);
    expect(Number(contract.installments[0].gross)).toBeCloseTo(1000, 2);
    const after = await rent();
    expect(after.standard - before.standard).toBeCloseTo(550.46 * due, 2);
    expect(after.standardVat - before.standardVat).toBeCloseTo(82.57 * due, 2);
    expect(after.exempt - before.exempt).toBeCloseTo(366.97 * due, 2);
  });

  it('⑤ المالكُ مؤجّراً لإيواءٍ مخدوم: توريدُه خاضع فرقمُه الضريبيّ إلزاميّ', async () => {
    const unitId = await makeUnit('managed', 10);
    const res = await auth(http().post('/contracts'))
      .send(await contractBody(unitId, 'SERVICED_LODGING', 'EXCLUSIVE', { lessor: 'OWNER', ownerName: 'مالكُ الشقق المخدومة' }))
      .expect(400);
    expect(String(res.body.message)).toContain('الرقم الضريبيّ');
  });

  it('⭐ ⑥ الحبسُ في القاعدة: مختلطٌ بلا نسبة، ونسبةٌ على غير المختلط — يرفضهما قيدٌ مسمّى', async () => {
    const created = (await auth(http().post('/contracts')).send(await contractBody(await makeUnit(), 'COMMERCIAL', 'EXCLUSIVE')).expect(201)).body as { id: string };
    const attempt = async (sql: Prisma.Sql): Promise<string> => {
      try {
        await tenantPrisma.runInTenantContext(company.companyId, (tx) => tx.$executeRaw(sql));
        return '';
      } catch (e) {
        return String((e as Error).message);
      }
    };
    const shareless = await attempt(Prisma.sql`UPDATE "contracts" SET "classification" = 'MIXED'::"ContractClassification" WHERE "id" = ${created.id}`);
    expect(shareless).toContain('contracts_mixed_share_declared');
    const stray = await attempt(Prisma.sql`UPDATE "contracts" SET "exemptSharePercent" = 40, "exemptShareBasis" = 'المساحة' WHERE "id" = ${created.id}`);
    expect(stray).toContain('contracts_mixed_share_declared');
  });
});
