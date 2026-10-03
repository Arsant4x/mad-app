import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@mad-app/db';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { dayEndOf } from '../src/common/wall-clock.util';
import { DEFERRED_REVENUE_ACCOUNT_CODE } from '../src/journal/deferred-revenue-account.util';
import { OUTPUT_VAT_ACCOUNT } from '../src/journal/auto-posting.util';
import { createTenantCustomer } from './tenant-customer';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (53.6 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(165000);

/**
 * ⭐ **الحارسُ الحيّ لاستحقاق الإيجار — يقرأ الدفترَ والإقرارَ معاً في كلِّ مرحلة**
 * (`ق-٩١٧` · `ق-٩٢٤` · `ق-٩٢٦` · `ق-٩٢٧` — شرطُ المالك: «فلا يُعلَن مبنيٌّ حتى يتطابقا»).
 *
 * سبعُ مراحل، وفي كلٍّ منها **توكيدان لا واحد**: ما يقوله الإقرارُ (`/obligations/vat-declaration`)
 * وما يقوله الدفترُ (`2200` · `1200` · `2400`/`4200`) — **والفرقُ بينهما صفرٌ بالبناء**:
 *
 *   ① عقدٌ تجاريٌّ غيرُ شامل يُنشأ بأقساطٍ حلّت ⇒ تظهر في إقرار ربعها (الصافي · `15%`) وعلى `2200`.
 *   ② قبضٌ مقدَّم قبل الاستحقاق ⇒ في ربع القبض لا ربع الاستحقاق — **بقدره** (`ق-٩٢٤`).
 *   ③ عقدٌ شامل ⇒ الضريبةُ `15/115` والصافي أقلُّ من القسط.
 *   ④ عقدٌ سكنيّ ⇒ صفُّ المعفى بقيمته ولا `2200`.
 *   ⑤ عقدٌ قديم غيرُ مصنَّف ⇒ لا يدخل ويُعدّ؛ **وبعد إعلانه** يدخل الإقرارَ ولا يحمله الدفتر —
 *      «ما سبق اللحظةَ: في الإقرار لا في الدفتر» (`ق-٩٢٦`) بعدِّه ونصِّه.
 *   ⑥ عقارُ تشغيل ⇒ لا `2200` ويُعدّ ويُعلَن.
 *   ⑦ والإلغاءُ يعكس المُسقَط — في الدفتر والإقرار معاً (`ق-٩٢٥/②`).
 *   ⑧ الأعمارُ بصفَّين: القسطُ المستحقُّ غيرُ المقبوض يظهر بعمره ويدخل المطابقةَ، ويخرج بالقبض (`ق-٩٢٥/④`).
 *   ⑨ التدفّقُ بالتزامَين: استحقاقٌ بلا نقدٍ لا يحرّك التشغيليَّ، والقبضُ يحرّكه بقدره (`ق-٩٢٣` · `ق-٩٢٥/③`).
 *   ⑩ علَمُ «قُدِّم»: بعده يُعلَن التغيّرُ لمن قدّم وحدَه — بنصّ م٦٣ (`ق-٩١٩`).
 *
 * ⚠️ **التواريخُ نسبيّةٌ إلى اليوم** لا ثابتة: الاستحقاقُ «حلّ» بالساعة الحقيقية، فاختبارٌ
 * بتاريخٍ ثابتٍ يصدق شهراً ويكذب بعده.
 */
interface E2eInstallment {
  id: string;
  dueDate: string;
  amount: string | number;
}

interface RentSection {
  standard: number;
  standardVat: number;
  exempt: number;
  managedExcluded: number;
  managedCount: number;
  legacyStandard: number;
  legacyStandardVat: number;
  legacyExempt: number;
  legacyCount: number;
  legacyNote: string;
  unclassifiedCount: number;
  unclassifiedNote: string;
  unpostedCount: number;
  accrualCount: number;
}

interface Declaration {
  salesStandard: number;
  salesStandardVat: number;
  salesExempt: number;
  netVat: number;
  rent: RentSection;
}

// الأيامُ على هيئة `@db.Date` (`UTC`) — كما يقرؤها الخادمُ بيومه المعلَن (`ق-١١٩٠`): كانت تُبنى من منطقة العملية،
// فبين `21:00` و`24:00 UTC` على جهازٍ بتوقيت الرياض كان «اليوم» هنا غدَ الخادم — فدفعةٌ «اليوم» تُؤرَّخ في المستقبل
// ولا تكون نقطةَ قبضٍ (②) ولا تدخل الأعمارَ (⑧)؛ سقطتا في `test:clean` لهذا وحدَه (2026-09-20).
const iso = (d: Date) => d.toISOString().slice(0, 10);
const quarterOf = (d: Date) => ({ year: d.getUTCFullYear(), quarter: Math.floor(d.getUTCMonth() / 3) + 1 });
const quarterStart = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) * 3, 1));
const addMonths = (d: Date, n: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
const dayBefore = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1));

describe('⭐ الحارسُ الحيّ: الدفترُ والإقرارُ معاً — استحقاقُ الإيجار (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let companyId: string;
  let tenantPrisma: TenantPrismaService;

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let seq = 0;

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  // آخرُ لحظةٍ من اليوم المعلَن (يومُ UTC بلا إزاحة — `dayEndOf` · ق-١١٩٠): قسطٌ حلّ اليوم (منتصفَ ليل UTC)
  // يُعدّ حالّاً كما يعدّه الخادم — لا بمنطقة العملية.
  const today = dayEndOf(new Date());
  const thisQuarter = quarterOf(today);
  const thisQuarterStart = quarterStart(today);
  const nextQuarterStart = addMonths(thisQuarterStart, 3);
  const nextQuarter = quarterOf(nextQuarterStart);

  async function balance(code: string): Promise<number> {
    const accounts = await auth(http().get('/accounts')).expect(200);
    return Number(accounts.body.find((a: { code: string }) => a.code === code)?.balance ?? 0);
  }

  /**
   * ② المالُ نصّاً بخانتين (`ق-١٢٣٥`): الحقولُ تصل نصّاً (`"1500.00"`) **وتُقرأ رقماً هنا مرّةً واحدة** فتبقى
   * توكيداتُ الفروق حسابيةً كما هي — والشكلُ يُثبَت حرفاً على حقلٍ واحدٍ في كل قراءة.
   */
  const MONEY_FIELDS = ['salesStandard', 'salesStandardVat', 'salesExempt', 'netVat'] as const;
  const RENT_MONEY_FIELDS = ['standard', 'standardVat', 'exempt', 'managedExcluded', 'legacyStandard', 'legacyStandardVat', 'legacyExempt'] as const;
  function numericDeclaration(body: Record<string, unknown>): Declaration {
    expect(String(body.netVat)).toMatch(/^-?\d+\.\d{2}$/);
    const rent = body.rent as Record<string, unknown>;
    const out = { ...body } as unknown as Declaration;
    for (const f of MONEY_FIELDS) out[f] = Number(body[f]);
    out.rent = { ...(rent as unknown as RentSection) };
    for (const f of RENT_MONEY_FIELDS) out.rent[f] = Number(rent[f]);
    return out;
  }
  async function declaration(q: { year: number; quarter: number }): Promise<Declaration> {
    return numericDeclaration((await auth(http().get('/obligations/vat-declaration')).query(q).expect(200)).body);
  }

  async function makeProperty(ownership: 'owned' | 'leased' | 'managed') {
    const tag = `${suffix}-${++seq}`;
    // عقارُ التشغيل بنسبة عمولةٍ معلَنة — شرطُ عقدٍ مؤجّرُه المالك (السؤال ٥٧٧).
    const property = (await auth(http().post('/properties')).send({ name: `عقار الاستحقاق ${tag}`, ownership, ...(ownership === 'managed' ? { opRate: 10 } : {}) }).expect(201)).body;
    const unit = (await auth(http().post('/units')).send({ propertyId: property.id, unitNo: `AC-${tag}`, type: 'تجاري', rentMonthly: 1000 }).expect(201)).body;
    return { property, unit, tag };
  }

  /** عقدٌ شهريٌّ باثني عشر قسطاً من `start`. */
  async function makeContract(opts: {
    classification: 'RESIDENTIAL' | 'COMMERCIAL';
    vatInclusion: 'INCLUSIVE' | 'EXCLUSIVE';
    ownership?: 'owned' | 'leased' | 'managed';
    /** ⚖️ على عقار التشغيل يُعلَن المؤجّر (السؤال ٥٧٧) — وحين المالك: اسمُه ورقمُه. */
    lessor?: 'COMPANY' | 'OWNER';
    start: Date;
    value: number;
  }) {
    const { unit, tag } = await makeProperty(opts.ownership ?? 'owned');
    const end = dayBefore(addMonths(opts.start, 12));
    const contract = (
      await auth(http().post('/contracts'))
        .send({
          classification: opts.classification,
          vatInclusion: opts.vatInclusion,
          ...(opts.lessor ? { lessor: opts.lessor } : {}),
          ...(opts.lessor === 'OWNER' ? { ownerName: `مالك ${tag}`, ownerVatNumber: '300000000000003' } : {}),
          unitId: unit.id,
          customerId: await createTenantCustomer(app, token, `مستأجر الاستحقاق ${tag}`),
          value: opts.value,
          cycle: 'monthly',
          start: iso(opts.start),
          end: iso(end),
        })
        .expect(201)
    ).body as { id: string; no: string; installments: E2eInstallment[] };
    return contract;
  }

  /** ما حلّ من الجدول حتى اليوم — الاستحقاقُ بالساعة الحقيقية. */
  const dueByToday = (c: { installments: E2eInstallment[] }) => c.installments.filter((i) => new Date(i.dueDate) <= today);

  /** لقطةٌ من الدفتر والإقرار معاً — تُقاس قبل الفعل وبعده. */
  async function snapshot(q: { year: number; quarter: number }) {
    const decl = await declaration(q);
    return {
      decl,
      receivable: await balance('1200'),
      outputVat: await balance(OUTPUT_VAT_ACCOUNT),
      deferred: await balance(DEFERRED_REVENUE_ACCOUNT_CODE),
      rent: await balance('4200'),
      cash: await balance('1000'),
    };
  }
  type Snapshot = Awaited<ReturnType<typeof snapshot>>;
  const delta = (a: Snapshot, b: Snapshot) => ({
    receivable: b.receivable - a.receivable,
    outputVat: b.outputVat - a.outputVat,
    revenueAndDeferred: b.deferred + b.rent - (a.deferred + a.rent),
    cash: b.cash - a.cash,
    standard: b.decl.rent.standard - a.decl.rent.standard,
    standardVat: b.decl.rent.standardVat - a.decl.rent.standardVat,
    exempt: b.decl.rent.exempt - a.decl.rent.exempt,
    salesStandardVat: b.decl.salesStandardVat - a.decl.salesStandardVat,
    salesExempt: b.decl.salesExempt - a.decl.salesExempt,
    managedExcluded: b.decl.rent.managedExcluded - a.decl.rent.managedExcluded,
    managedCount: b.decl.rent.managedCount - a.decl.rent.managedCount,
    legacyStandard: b.decl.rent.legacyStandard - a.decl.rent.legacyStandard,
    legacyStandardVat: b.decl.rent.legacyStandardVat - a.decl.rent.legacyStandardVat,
    legacyCount: b.decl.rent.legacyCount - a.decl.rent.legacyCount,
    unclassifiedCount: b.decl.rent.unclassifiedCount - a.decl.rent.unclassifiedCount,
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);

    const login = await http().post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    token = login.body.accessToken;
    companyId = login.body.user.companyId;
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  it('🔴 ① تجاريٌّ غيرُ شامل: ما حلّ من أقساطه في إقرار ربعه بالصافي و15% — وعلى 2200 بالرقم نفسِه', async () => {
    const before = await snapshot(thisQuarter);
    const contract = await makeContract({ classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE', start: thisQuarterStart, value: 12000 });
    const after = await snapshot(thisQuarter);
    const d = delta(before, after);

    const due = dueByToday(contract);
    // مجسٌّ للمجسّ: ربعٌ بدأ فأوّلُ أقساطه حلّ — صفرٌ يعني أن القياس أعمى.
    expect(due.length).toBeGreaterThan(0);
    const net = 1000 * due.length;
    const tax = 150 * due.length;

    // الإقرار.
    expect(d.standard).toBeCloseTo(net, 2);
    expect(d.standardVat).toBeCloseTo(tax, 2);
    expect(d.salesStandardVat).toBeCloseTo(tax, 2);
    // الدفتر.
    expect(d.outputVat).toBeCloseTo(tax, 2);
    expect(d.receivable).toBeCloseTo(net + tax, 2);
    expect(d.revenueAndDeferred).toBeCloseTo(net, 2);
    // ⭐ ومعاً: ما على 2200 هو ما في الإقرار — بالبناء لا بالمصادفة.
    expect(d.outputVat).toBeCloseTo(d.standardVat, 2);
    expect(after.decl.rent.unpostedCount).toBe(0);
  }, 60000);

  it('🔴 ② قبضٌ مقدَّم قبل الاستحقاق: في ربع القبض لا ربع الاستحقاق — وبقدره (ق-٩٢٤)', async () => {
    const contract = await makeContract({ classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE', start: nextQuarterStart, value: 12000 });
    expect(dueByToday(contract)).toHaveLength(0);
    const first = contract.installments[0];

    const beforeThis = await snapshot(thisQuarter);
    const beforeNext = await declaration(nextQuarter);
    // مئةٌ من ألفٍ ومئةٍ وخمسين (الإجماليّ) — قبل الاستحقاق بربعٍ كامل.
    await auth(http().post(`/contracts/${contract.id}/payments`)).send({ installmentId: first.id, date: iso(today), amount: 115, method: 'CASH' }).expect(201);
    const afterThis = await snapshot(thisQuarter);
    const afterNext = await declaration(nextQuarter);
    const d = delta(beforeThis, afterThis);

    // في ربع القبض: 115 إجماليّاً = 100 صافياً + 15 ضريبة — لا القسطُ كلُّه.
    expect(d.standard).toBeCloseTo(100, 2);
    expect(d.standardVat).toBeCloseTo(15, 2);
    // ولا شيءَ في ربع الاستحقاق بعد.
    expect(afterNext.rent.standardVat - beforeNext.rent.standardVat).toBeCloseTo(0, 2);
    // الدفتر: استُحقّ 115 وسُدِّد 115 في اليوم نفسِه — الذمّةُ صفر، والضريبةُ 15، والنقدُ 115.
    expect(d.receivable).toBeCloseTo(0, 2);
    expect(d.outputVat).toBeCloseTo(15, 2);
    expect(d.cash).toBeCloseTo(115, 2);
    expect(d.revenueAndDeferred).toBeCloseTo(100, 2);
    expect(d.outputVat).toBeCloseTo(d.standardVat, 2);
  }, 60000);

  it('🔴 ③ عقدٌ شامل: الضريبةُ 15/115 والصافي أقلُّ من القسط', async () => {
    const before = await snapshot(thisQuarter);
    // 1150 شهرياً شاملةً — فالصافي 1000 والضريبة 150.
    const contract = await makeContract({ classification: 'COMMERCIAL', vatInclusion: 'INCLUSIVE', start: thisQuarterStart, value: 13800 });
    const after = await snapshot(thisQuarter);
    const d = delta(before, after);

    const due = dueByToday(contract);
    expect(Number(due[0].amount)).toBeCloseTo(1150, 2);
    expect(d.standard).toBeCloseTo(1000 * due.length, 2);
    expect(d.standardVat).toBeCloseTo(150 * due.length, 2);
    // والذمّةُ بالقسط نفسِه (شامل) لا أكثر.
    expect(d.receivable).toBeCloseTo(1150 * due.length, 2);
    expect(d.outputVat).toBeCloseTo(d.standardVat, 2);
  }, 60000);

  it('🔴 ④ عقدٌ سكنيّ: صفُّ المعفى بقيمته — ولا 2200؛ وباجتماع المعفى مع الخاضع يُعلَن حدُّ الخصم النسبيّ (ق-١٢٦٠)', async () => {
    const before = await snapshot(thisQuarter);
    // منشأةُ العرض مختلطةٌ أصلاً (سكنيٌّ معفى بجانب التجاريّ) — فالحدُّ يُعلَن هنا في الردّ نفسِه لا في وثيقة؛
    // والحالةُ السالبة (خاضعٌ وحدَه ⟵ لا حدّ) على منشأةٍ معزولة في vat-declaration-limits.e2e-spec.ts.
    const contract = await makeContract({ classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE', start: thisQuarterStart, value: 12000 });
    const after = await snapshot(thisQuarter);
    const d = delta(before, after);
    /**
     * ⑥A1 (`ق-١٣٢٥`) — **حدُّ `ق-١٢٦٠` رُفع ببناء الخصم النسبيّ**، وحلّ محلَّه حدٌّ يقول
     * للتاجر ما يفعل: النسبةُ لم تُعلَن بعد. **والحاجبُ باقٍ حاجباً** — فمكلَّفٌ مختلطٌ
     * لا يُقدِّم إقراراً يخصم مشترياته كاملةً.
     */
    const rawAfter = (await auth(http().get('/obligations/vat-declaration')).query(thisQuarter).expect(200)).body as {
      limits: { code: string; severity: string; message: string }[];
      proportional: { applies: boolean; ratio: number | null };
    };
    expect(rawAfter.proportional.applies).toBe(true);
    const limit = rawAfter.limits.find((l) => l.code === 'PROPORTIONAL_RATIO_NOT_DECLARED');
    expect(limit?.severity).toBe('blocking');
    expect(limit?.message).toContain('م٥١');
    // ⛔ ولا يُقرأ الحدُّ القديم بعد بنائه — فنصٌّ يقول «غيرُ مبنيّ» على مبنيٍّ يُفقد الثقة.
    expect(rawAfter.limits.map((l) => l.code)).not.toContain('PROPORTIONAL_INPUT_VAT_NOT_BUILT');

    const n = dueByToday(contract).length;
    expect(d.exempt).toBeCloseTo(1000 * n, 2);
    expect(d.salesExempt).toBeCloseTo(1000 * n, 2);
    expect(d.standard).toBeCloseTo(0, 2);
    expect(d.outputVat).toBeCloseTo(0, 2);
    expect(d.receivable).toBeCloseTo(1000 * n, 2);
    expect(d.revenueAndDeferred).toBeCloseTo(1000 * n, 2);
  }, 60000);

  it('🔴 ⑤ عقدٌ قديم غيرُ مصنَّف: لا يدخل ويُعدّ — وبعد إعلانه في الإقرار لا في الدفتر (ق-٩٢٦)', async () => {
    // يُنشأ بأقساطٍ مستقبلة (لا استحقاقَ عند الإنشاء) ثم يُردّ قديماً بيدٍ: أقساطُه على أساس
    // القبض بتاريخٍ حلّ في هذا الربع — وهي حالُ ما سبق البناء بعينها.
    const contract = await makeContract({ classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE', start: nextQuarterStart, value: 12000 });
    const shiftDays = Math.round((nextQuarterStart.getTime() - thisQuarterStart.getTime()) / 86400000);
    await tenantPrisma.runInTenantContext(companyId, async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`UPDATE "contracts" SET "classification" = 'LEGACY_UNCLASSIFIED'::"ContractClassification", "vatInclusion" = 'LEGACY_UNDECLARED'::"ContractVatInclusion", "createdAt" = TIMESTAMP '2020-01-01 00:00:00', "start" = "start" - ${shiftDays}::int, "end" = "end" - ${shiftDays}::int WHERE "id" = ${contract.id}`,
      );
      await tx.$executeRaw(
        Prisma.sql`UPDATE "contract_installments" SET "accrualBasis" = 'LEGACY_COLLECTED'::"InstallmentAccrualBasis", "createdAt" = TIMESTAMP '2020-01-01 00:00:00', "dueDate" = "dueDate" - ${shiftDays}::int, "serviceStart" = "serviceStart" - ${shiftDays}::int, "serviceEnd" = "serviceEnd" - ${shiftDays}::int WHERE "contractId" = ${contract.id}`,
      );
    });
    const shifted = (await auth(http().get(`/contracts/${contract.id}`)).expect(200)).body as { installments: E2eInstallment[] };
    const dueInQuarter = dueByToday(shifted).filter((i) => quarterOf(new Date(i.dueDate)).quarter === thisQuarter.quarter);
    expect(dueInQuarter.length).toBeGreaterThan(0);

    // بلا تصنيف: يُعدّ ولا يدخل.
    const unclassified = await snapshot(thisQuarter);
    expect(unclassified.decl.rent.unclassifiedCount).toBeGreaterThanOrEqual(dueInQuarter.length);
    expect(unclassified.decl.rent.unclassifiedNote).toContain('غيرِ مصنَّفة');

    // ثم يُعلَن تجارياً بيدٍ من بطاقته.
    await auth(http().patch(`/contracts/${contract.id}`)).send({ classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE' }).expect(200);
    const declared = await snapshot(thisQuarter);
    const d = delta(unclassified, declared);

    // في الإقرار: يدخل الخاضعَ بنقطة ضريبته (أقساطٌ حلّت ولم تُقبض ⇒ عند استحقاقها).
    expect(d.unclassifiedCount).toBeLessThanOrEqual(-dueInQuarter.length);
    expect(d.legacyCount).toBeGreaterThanOrEqual(dueInQuarter.length);
    expect(d.legacyStandard).toBeCloseTo(1000 * dueInQuarter.length, 2);
    expect(d.legacyStandardVat).toBeCloseTo(150 * dueInQuarter.length, 2);
    expect(d.salesStandardVat).toBeCloseTo(150 * dueInQuarter.length, 2);
    expect(declared.decl.rent.legacyNote).toContain('في الإقرار لا في الدفتر');
    // ⭐ ولا في الدفتر: لا 2200 ولا ذمّة — الاستثناءُ الوحيد، معدوداً بنصّه.
    expect(d.outputVat).toBeCloseTo(0, 2);
    expect(d.receivable).toBeCloseTo(0, 2);
  }, 60000);

  // ⚖️ كانت هذه المرحلةُ تحرس السلوكَ القديم: عقارُ التشغيل كلُّه توريدٌ لمالكه، فالتجاريُّ بلا 2200 ويُستحقّ ذمّةً وإيراداً
  //    للمنشأة. وحكمُ صاحب المشروع (السؤال ٥٧٧ · ق-١٦٠٠): الفيصلُ المؤجّرُ على العقد — فسقطت على الصواب وصُحّحت (§8.14
  //    الوجه الثالث). والمنشأةُ مؤجّرةً على التشغيل، والعمولةُ وإيجارُ المالك في الإقرار، في `contract-lessor.e2e-spec.ts`.
  it('🔴 ⑥ عقارُ تشغيل مؤجّرُه المالك: لا استحقاقَ ولا ذمّةَ ولا 2200 — الإيجارُ أمانةٌ للمالك لا توريدُ المنشأة', async () => {
    const before = await snapshot(thisQuarter);
    const contract = await makeContract({ classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE', ownership: 'managed', lessor: 'OWNER', start: thisQuarterStart, value: 12000 });
    const after = await snapshot(thisQuarter);
    const d = delta(before, after);

    expect(dueByToday(contract).length).toBeGreaterThan(0);
    expect(d.managedExcluded).toBeCloseTo(0, 2);
    expect(d.managedCount).toBe(0);
    expect(d.standard).toBeCloseTo(0, 2);
    expect(d.standardVat).toBeCloseTo(0, 2);
    expect(d.outputVat).toBeCloseTo(0, 2);
    // ولا ذمّةَ للمنشأة: ما يدين به المستأجرُ دَينُ المالك، والمنشأةُ تحصّله وكيلاً.
    expect(d.receivable).toBeCloseTo(0, 2);
  }, 60000);

  /** ② مبالغُ التقريرين نصٌّ بخانتين (`ق-١٢٣٥`): يُثبَت شكلُها ثم تُقرأ رقماً — والفروقُ أدناه على الأرقام كما كانت. */
  const MONEY_TEXT = /^-?\d+\.\d{2}$/;
  const n = (text: string): number => {
    expect(text).toMatch(MONEY_TEXT);
    return Number(text);
  };
  interface AgingReport {
    rentRows: { contractNo: string; installmentId: string; remaining: number; bucket: string }[];
    totals: { total: number; rent: number };
    reconciliation: { difference: number } | null;
  }
  const aging = async (): Promise<AgingReport> => {
    const body = (await auth(http().get('/reports/receivables-aging')).query({ reconcile: '1' }).expect(200)).body as {
      rentRows: { contractNo: string; installmentId: string; remaining: string; bucket: string }[];
      totals: { total: string; rent: string };
      reconciliation: { difference: string } | null;
    };
    return {
      rentRows: body.rentRows.map((r) => ({ ...r, remaining: n(r.remaining) })),
      totals: { total: n(body.totals.total), rent: n(body.totals.rent) },
      reconciliation: body.reconciliation ? { difference: n(body.reconciliation.difference) } : null,
    };
  };

  interface CashFlow {
    netProfit: number;
    receivablesChange: number;
    deferredRevenueChange: number;
    outputVatChange: number;
    operatingCashFlow: number;
  }
  const cashFlow = async (): Promise<CashFlow> => {
    const body = (await auth(http().get('/reports/cash-flow')).expect(200)).body as Record<keyof CashFlow, string>;
    return {
      netProfit: n(body.netProfit),
      receivablesChange: n(body.receivablesChange),
      deferredRevenueChange: n(body.deferredRevenueChange),
      outputVatChange: n(body.outputVatChange),
      operatingCashFlow: n(body.operatingCashFlow),
    };
  };

  it('🔴 ⑧ الأعمارُ بصفَّين: القسطُ المستحقُّ غيرُ المقبوض يظهر بعمره ويدخل المطابقة — ويخرج بالقبض (ق-٩٢٥/④)', async () => {
    const before = await aging();
    const contract = await makeContract({ classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE', start: thisQuarterStart, value: 12000 });
    const due = dueByToday(contract);
    const after = await aging();

    const mine = after.rentRows.filter((r) => r.contractNo === contract.no);
    expect(mine).toHaveLength(due.length);
    for (const r of mine) expect(r.remaining).toBeCloseTo(1150, 2);
    expect(after.totals.rent - before.totals.rent).toBeCloseTo(1150 * due.length, 2);
    expect(after.totals.total - before.totals.total).toBeCloseTo(1150 * due.length, 2);
    // ⭐ والمطابقةُ لا ترى «فرقاً غير منسوب»: الذمّةُ في التقرير كما هي في 1200.
    expect(after.reconciliation!.difference - before.reconciliation!.difference).toBeCloseTo(0, 2);

    // القبضُ يُخرج القسطَ من الصفّ.
    await auth(http().post(`/contracts/${contract.id}/payments`)).send({ installmentId: due[0].id, date: iso(today), amount: 1150, method: 'CASH' }).expect(201);
    const paid = await aging();
    expect(paid.rentRows.filter((r) => r.contractNo === contract.no)).toHaveLength(due.length - 1);
    expect(paid.reconciliation!.difference - before.reconciliation!.difference).toBeCloseTo(0, 2);
  }, 60000);

  it('🔴 ⑨ التدفّقُ بالتزامَين: استحقاقٌ بلا نقدٍ لا يحرّك التشغيليَّ — والقبضُ يحرّكه بقدره (ق-٩٢٣ · ق-٩٢٥/③)', async () => {
    const before = await cashFlow();
    const contract = await makeContract({ classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE', start: thisQuarterStart, value: 12000 });
    const due = dueByToday(contract);
    const accrued = await cashFlow();

    // الاستحقاقُ رفع الربحَ (ما مضى) والذمّةَ (الإجمالي) والالتزامَين (المؤجَّل والضريبة) — ولا نقدَ تحرّك.
    expect(accrued.receivablesChange - before.receivablesChange).toBeCloseTo(1150 * due.length, 2);
    expect(accrued.outputVatChange - before.outputVatChange).toBeCloseTo(150 * due.length, 2);
    expect(accrued.deferredRevenueChange + accrued.netProfit - (before.deferredRevenueChange + before.netProfit)).toBeCloseTo(1000 * due.length, 2);
    expect(accrued.operatingCashFlow - before.operatingCashFlow).toBeCloseTo(0, 2);

    await auth(http().post(`/contracts/${contract.id}/payments`)).send({ installmentId: due[0].id, date: iso(today), amount: 1150, method: 'CASH' }).expect(201);
    const paid = await cashFlow();
    expect(paid.operatingCashFlow - accrued.operatingCashFlow).toBeCloseTo(1150, 2);
  }, 60000);

  it('🔴 ⑩ علَمُ «قُدِّم»: بعده يُعلَن التغيّرُ لمن قدّم وحدَه — بنصّ م٦٣ (ق-٩١٩)', async () => {
    const filedRes = await auth(http().post('/obligations/vat-declaration/filed')).send(thisQuarter).expect(201);
    expect(filedRes.body.filedAt).toBeTruthy();
    const marked = (await auth(http().get('/obligations/vat-declaration')).query(thisQuarter).expect(200)).body as Declaration & {
      filed: { filedAt: string; netVat: string } | null;
      changedSinceFiled: boolean;
      filedNote: string | null;
    };
    expect(marked.filed).not.toBeNull();
    expect(marked.changedSinceFiled).toBe(false);
    expect(marked.filedNote).toBeNull();
    // ② صافي «قُدِّم» نصٌّ بخانتين كصافي الإقرار — يتطابقان حرفاً.
    expect(marked.filed!.netVat).toMatch(/^-?\d+\.\d{2}$/);
    expect(marked.filed!.netVat).toBe(String(marked.netVat));

    // ثم يتغيّر الربعُ بعقدٍ حلّ فيه استحقاق — فتُعرض رسالةُ التصحيح بنصّها.
    await makeContract({ classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE', start: thisQuarterStart, value: 12000 });
    const changed = (await auth(http().get('/obligations/vat-declaration')).query(thisQuarter).expect(200)).body as typeof marked;
    expect(changed.changedSinceFiled).toBe(true);
    expect(String(changed.filedNote)).toContain('م٦٣');
    expect(String(changed.filedNote)).toContain('عشرين يوماً');

    // وإلغاءُ الوسم يُسكت الرسالة — فبلاه لا يعرف النظامُ ما قُدِّم.
    await auth(http().delete('/obligations/vat-declaration/filed')).query(thisQuarter).expect(200);
    const unmarked = (await auth(http().get('/obligations/vat-declaration')).query(thisQuarter).expect(200)).body as typeof marked;
    expect(unmarked.filed).toBeNull();
    expect(unmarked.changedSinceFiled).toBe(false);
  }, 60000);

  it('🔴 ⑦ والإلغاءُ يعكس المُسقَط — في الدفتر والإقرار معاً (ق-٩٢٥/②)', async () => {
    const before = await snapshot(thisQuarter);
    const contract = await makeContract({ classification: 'COMMERCIAL', vatInclusion: 'EXCLUSIVE', start: thisQuarterStart, value: 12000 });
    const accrued = await snapshot(thisQuarter);
    const n = dueByToday(contract).length;
    expect(delta(before, accrued).standardVat).toBeCloseTo(150 * n, 2);

    // إلغاءٌ بتاريخ أوّل الربع وإسقاطُ الأقساط: كلُّ ما حلّ لم يُقبض وأُسقط ⇒ يُعكس.
    await auth(http().post(`/contracts/${contract.id}/cancel`))
      .send({ cancelDate: iso(thisQuarterStart), cancelReason: 'إخلاء', installmentDisposition: 'cancel' })
      .expect(201);
    const reversed = await snapshot(thisQuarter);
    const d = delta(before, reversed);

    // الإقرارُ يعود كما كان، والدفترُ كذلك — والصفوفُ السالبة بتاريخ الإلغاء في الربع نفسِه.
    expect(d.standard).toBeCloseTo(0, 2);
    expect(d.standardVat).toBeCloseTo(0, 2);
    expect(d.outputVat).toBeCloseTo(0, 2);
    expect(d.receivable).toBeCloseTo(0, 2);
    expect(d.revenueAndDeferred).toBeCloseTo(0, 2);
    expect(reversed.decl.rent.accrualCount - accrued.decl.rent.accrualCount).toBe(n);
  }, 60000);
});
