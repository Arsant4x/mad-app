import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { DEFAULT_LANGUAGE, formatMessage, MSG, resolveMessage } from '../src/common/i18n/messages';
import { round2 } from '../src/common/money/rounding';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): لم تُقَس بعد — كُتبت الحزمةُ ولم تُشغَّل (الجهازُ مشغولٌ ببحثٍ جارٍ)؛ سقفٌ معلَن
// يُضبط إلى ثلاثة أضعاف المقيس بعد أوّل تشغيل.
jest.setTimeout(300000);

/**
 * ⚖️ **نقدُ الإيجار بعملةٍ أجنبية بسعر يومه — والفرقُ على `5600` لا في `1000`** (`ق-١٤٨٩` · B7 · B8 · B9).
 *
 * **العطلُ المقيس** (`measure-fx-realized-difference.md` §٢-ب): تحصيلُ المطالبة (`contracts.service.ts` `settleClaim`
 * ⟵ `postClaimPaymentEntry`) وتسويةُ الوديعة (`settleDeposit` ⟵ `postDepositSettlementEntry`) وردُّ المقبوض غير
 * المكتسَب عند الإلغاء (`cancel` ⟵ `postDeferredSettlementEntry`) كانت تُقيِّد النقدَ **بالسعر التاريخيّ** (سعرِ
 * المطالبة/الوديعة/العقد) — فكلُّ فرقٍ بين ذلك السعر وسعر يوم النقد يُطوى في قيمة `1000` بلا أثر. **وفي الوديعة عيبُ
 * تقريبٍ مستقلّ** (البندُ ٢٩ من المراجعة العدائية): الأجزاءُ تُدوَّر كلٌّ على حدة والالتزامُ مرّةً، فيختلّ القيدُ بهللة
 * ويُرفض `journal_entry_unbalanced`.
 *
 * **وما يُثبَت هنا — لكلّ مسارٍ حالة، والأرقامُ محسوبةٌ يداً من الشيفرة في تعليق كلّ توكيد:**
 *   ① B7 — مطالبةٌ بعملةٍ أجنبية: بلا سعرٍ `400` مسمّى بلا أثر، وبسعرٍ النقدُ به والفرقُ على `5600`.
 *   ② B7 — مطالبةٌ بعملة الأساس: لا سعرَ يُطلب، والقيدُ سطران كما كان (لا `5600`).
 *   ③ B8 — وديعةٌ تحتجزها المنشأة بسعرٍ غير سعر العقد: الردُّ بسعر يومه، والذمّةُ بسعر العقد، والدخلُ بسعر الوديعة.
 *   ④ B8 — وديعةٌ لدى «إيجار»: ما تُفرج عنه نقدٌ بسعر يومه، والفرقُ عن الخصم بسعر الوديعة على `5600`.
 *   ⑤ B8 — عيبُ التقريب: وديعةُ `0.03` بسعر `1.5` بثلاثة أجزاءٍ `0.01` — كانت `400` وصارت قيداً متوازناً.
 *   ⑥ B9 — إلغاءُ عقدٍ بعملةٍ أجنبية بردّ المقبوض: بلا سعرٍ `400` بلا أثر، وبسعرٍ النقدُ به والفرقُ على `5600`.
 *
 * منشأةٌ معزولة تُزال في الختام؛ والعملةُ `XTS` — رمزُ ISO 4217 المحجوز للاختبار — غيرُ عملة الأساس أيّاً كانت.
 */
type Claim = { id: string; status: string; currency: string; baseAmount: string; settlementEntryId: string | null };
type Deposit = {
  id: string;
  type: string;
  holder: string;
  status: string;
  baseAmount: string;
  refundAmount: string | null;
  settlementEntryId: string | null;
};
type ContractBody = { id: string; no: string; status: string; installments: { id: string; dueDate: string }[]; claims: Claim[]; deposits: Deposit[] };
type Lines = Record<string, { debit: number; credit: number }>;

const FX = 'XTS';
// الأيامُ بهيئة `@db.Date` (UTC) — كما يقرؤها الخادم (`ق-١١٩٠`).
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('⚖️ نقدُ الإيجار بعملةٍ أجنبية بسعر يومه — والفرقُ على 5600 (ق-١٤٨٩ · B7 · B8 · B9) (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let token: string;
  let tenantPrisma: TenantPrismaService;
  let seq = 0;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const today = iso(new Date());
  /** أوّلُ الشهر بعد القادم — عقدٌ يبدأ فيه لا قسطَ له حلّ اليوم، فلا استحقاقَ يُرحَّل عند إنشائه. */
  const now = new Date();
  const futureStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1));
  const futureEnd = new Date(Date.UTC(futureStart.getUTCFullYear() + 1, futureStart.getUTCMonth(), 0));

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const rateRequired = (currency: string) => resolveMessage(formatMessage(MSG.rent_cash_rate_required, { currency }), DEFAULT_LANGUAGE);

  /** عقدٌ سكنيٌّ (معفى — فلا ضريبةَ في الأرقام) باثني عشر قسطاً بألفٍ من `futureStart`؛ وبلا `fx` بعملة الأساس. */
  async function makeContract(fx?: { currency: string; exchangeRate: number }): Promise<ContractBody> {
    const tag = `${suffix}-${++seq}`;
    const property = (await auth(http().post('/properties')).send({ name: `عقار فرق الصرف ${tag}`, ownership: 'owned' }).expect(201)).body as { id: string };
    const unit = (await auth(http().post('/units')).send({ propertyId: property.id, unitNo: `FXR-${tag}`, type: 'سكني', rentMonthly: 1000 }).expect(201))
      .body as { id: string };
    const customerId = await createTenantCustomer(app, token, `مستأجر فرق الصرف ${tag}`);
    return (
      await auth(http().post('/contracts'))
        .send({
          classification: 'RESIDENTIAL',
          vatInclusion: 'EXCLUSIVE',
          unitId: unit.id,
          customerId,
          value: 12000,
          cycle: 'monthly',
          start: iso(futureStart),
          end: iso(futureEnd),
          ...(fx ?? {}),
        })
        .expect(201)
    ).body as ContractBody;
  }

  const readContract = async (id: string) => (await auth(http().get(`/contracts/${id}`)).expect(200)).body as ContractBody;

  /** سطورُ القيد مجمَّعةً برمز الحساب — تُقرأ من الدفتر نفسِه داخل سياق المنشأة، لا من ردّ الواجهة. */
  async function linesOf(entryId: string): Promise<Lines> {
    const rows = await tenantPrisma.runInTenantContext(company.companyId, (tx) =>
      tx.journalLine.findMany({ where: { journalEntryId: entryId }, select: { debit: true, credit: true, account: { select: { code: true } } } }),
    );
    // مجسٌّ للمجسّ: قيدٌ بلا سطورٍ يعني أن القراءةَ أخفقت (سياقٌ أو معرّف)، لا أن القيدَ فارغ.
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const out: Lines = {};
    for (const r of rows) {
      const prev = out[r.account.code] ?? { debit: 0, credit: 0 };
      out[r.account.code] = { debit: round2(prev.debit + Number(r.debit)), credit: round2(prev.credit + Number(r.credit)) };
    }
    return out;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    company = await registerIsolatedCompany(app, 'rent-cash-fx');
    token = company.token;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('🔴 ① B7 — مطالبةٌ بعملةٍ أجنبية: بلا سعرِ يومٍ تُرفض مسمّاةً بلا أثر، وبسعرٍ يُقيَّد النقدُ به والفرقُ على 5600', async () => {
    const contract = await makeContract({ currency: FX, exchangeRate: 3.75 });
    const created = (
      await auth(http().post(`/contracts/${contract.id}/claims`)).send({ kind: 'MAINTENANCE', amount: 100, description: 'إصلاح تسريب', issuedAt: today }).expect(201)
    ).body as ContractBody;
    const claim = created.claims[0];
    // المطالبةُ ترث عملةَ العقد وسعرَه (`createClaim`): 100 × 3.75 = 375.00 — وهي ما قُيِّد في `1200` عند إصدارها.
    expect(claim.currency).toBe(FX);
    expect(Number(claim.baseAmount)).toBe(375);

    // ⛔ بلا سعر: `400` بالرسالة التي تسمّي العملة — لا سعرُ المطالبة افتراضاً.
    const refused = await auth(http().post(`/contracts/${contract.id}/claims/${claim.id}/pay`)).send({ paidAt: today }).expect(400);
    expect(refused.body.message).toBe(rateRequired(FX));
    // والرفضُ قبل أيّ أثر: المطالبةُ مفتوحةٌ بلا قيد تسوية.
    const untouched = (await readContract(contract.id)).claims.find((c) => c.id === claim.id)!;
    expect(untouched.status).toBe('OPEN');
    expect(untouched.settlementEntryId).toBeNull();

    // بسعر يوم 3.80: النقدُ 100 × 3.80 = 380.00 · الذمّةُ بسعر الإصدار 375.00 · ربحُ الصرف 380 − 375 = 5.00 دائنٌ على 5600.
    // (وقبل الإصلاح: 1000 مدين 375.00 · 1200 دائن 375.00 — والخمسةُ مطويّةٌ في النقدية.)
    const paid = (await auth(http().post(`/contracts/${contract.id}/claims/${claim.id}/pay`)).send({ paidAt: today, exchangeRate: 3.8 }).expect(201))
      .body as ContractBody;
    const settled = paid.claims.find((c) => c.id === claim.id)!;
    expect(settled.status).toBe('PAID');
    expect(await linesOf(settled.settlementEntryId!)).toEqual({
      '1000': { debit: 380, credit: 0 },
      '1200': { debit: 0, credit: 375 },
      '5600': { debit: 0, credit: 5 },
    });
  });

  it('② B7 — مطالبةٌ بعملة الأساس: لا سعرَ يُطلب، والقيدُ سطران كما كان ولا 5600', async () => {
    const contract = await makeContract();
    const created = (
      await auth(http().post(`/contracts/${contract.id}/claims`)).send({ kind: 'LATE_FEE', amount: 100, description: 'غرامة تأخير', issuedAt: today }).expect(201)
    ).body as ContractBody;
    const claim = created.claims[0];
    // عملةُ الأساس بسعر 1 (`resolveCurrencyWithin`): 100 × 1 = 100.00.
    expect(Number(claim.baseAmount)).toBe(100);

    const paid = (await auth(http().post(`/contracts/${contract.id}/claims/${claim.id}/pay`)).send({ paidAt: today }).expect(201)).body as ContractBody;
    const settled = paid.claims.find((c) => c.id === claim.id)!;
    // النقدُ = الذمّة = 100.00 — سطران بالضبط، كما كان `postClaimPaymentEntry` قبل الإصلاح.
    expect(await linesOf(settled.settlementEntryId!)).toEqual({
      '1000': { debit: 100, credit: 0 },
      '1200': { debit: 0, credit: 100 },
    });
  });

  it('🔴 ③ B8 — وديعةٌ تحتجزها المنشأة بسعرٍ غير سعر العقد: الردُّ بسعر يومه، والذمّةُ بسعر العقد، والفرقان على 5600', async () => {
    const contract = await makeContract({ currency: FX, exchangeRate: 3.75 });
    // الوديعةُ بعملة العقد وبسعرها هي 3.70 (`recordDeposit` يقبل سعراً غير سعر العقد): 1000 × 3.70 = 3,700.00 في `2300`.
    const withDeposit = (await auth(http().post(`/contracts/${contract.id}/deposits`)).send({ type: 'RENT', amount: 1000, receivedAt: today, exchangeRate: 3.7 }).expect(201))
      .body as ContractBody;
    const deposit = withDeposit.deposits[0];
    expect(Number(deposit.baseAmount)).toBe(3700);

    const deductions = [
      { kind: 'UNPAID_RENT', amount: 200, reason: 'إيجار شهرٍ لم يُدفع' },
      { kind: 'DAMAGE', amount: 100, reason: 'كسر باب المطبخ' },
    ];
    // ⛔ الردُّ 1000 − 300 = 700 نقدٌ يخرج — بلا سعرِ يومٍ `400` مسمّى، والوديعةُ محتجَزةٌ كما هي.
    const refused = await auth(http().post(`/contracts/${contract.id}/deposits/${deposit.id}/settle`)).send({ settledAt: today, deductions }).expect(400);
    expect(refused.body.message).toBe(rateRequired(FX));
    const held = (await readContract(contract.id)).deposits.find((d) => d.id === deposit.id)!;
    expect(held.status).toBe('HELD');
    expect(held.settlementEntryId).toBeNull();

    const settled = (
      await auth(http().post(`/contracts/${contract.id}/deposits/${deposit.id}/settle`)).send({ settledAt: today, deductions, exchangeRate: 3.8 }).expect(201)
    ).body.deposits.find((d: Deposit) => d.id === deposit.id) as Deposit;
    expect(settled.status).toBe('SETTLED');
    expect(Number(settled.refundAmount)).toBe(700);
    // الأجزاءُ بسعر الوديعة 3.70 (`splitAtDepositRate`): ذمّة 200 ⟵ 740.00 · دخل 100 ⟵ 370.00 · ردّ 700 ⟵ 2,590.00 = 3,700.00 (لا بقيّة).
    // المرحَّل: `2300` مدين 3,700.00 (الالتزامُ كما قُيِّد)
    //           `1200` دائن 200 × 3.75 (سعرُ العقد — سعرُ الذمّة التي يسدّدها) = 750.00
    //           `4300` دائن 370.00 (بسعر الوديعة)
    //           `1000` دائن 700 × 3.80 (سعرُ يوم التسوية) = 2,660.00
    //           `5600` = (740 − 750) + (2,590 − 2,660) = −10 − 70 = −80 ⟵ خسارةٌ مدينة 80.00
    // التوازن: 3,700 + 80 = 3,780 = 750 + 370 + 2,660.
    // (وقبل الإصلاح: 1200 دائن 740 · 4300 دائن 370 · 1000 دائن 2,590 — فالسبعون مطويّةٌ في النقدية والعشرةُ يتيمةٌ في 1200.)
    expect(await linesOf(settled.settlementEntryId!)).toEqual({
      '2300': { debit: 3700, credit: 0 },
      '1200': { debit: 0, credit: 750 },
      '4300': { debit: 0, credit: 370 },
      '1000': { debit: 0, credit: 2660 },
      '5600': { debit: 80, credit: 0 },
    });
  });

  it('④ B8 — وديعةٌ لدى «إيجار»: ما تُفرج عنه نقدٌ بسعر يومه، والفرقُ عن الخصم بسعر الوديعة على 5600', async () => {
    const contract = await makeContract({ currency: FX, exchangeRate: 3.75 });
    // محجوزةٌ لدى إيجار بسعر العقد (افتراضُ `recordDeposit`) — لا قيدَ عند استلامها.
    const withDeposit = (await auth(http().post(`/contracts/${contract.id}/deposits`)).send({ type: 'RENT', amount: 1000, receivedAt: today, holder: 'EJAR' }).expect(201))
      .body as ContractBody;
    const deposit = withDeposit.deposits[0];
    expect(deposit.holder).toBe('EJAR');

    const deductions = [{ kind: 'DAMAGE', amount: 100, reason: 'كسر نافذة' }];
    // ⛔ ما تُفرج عنه إيجار (100) نقدٌ يدخل — بلا سعرِ يومٍ `400` مسمّى.
    const refused = await auth(http().post(`/contracts/${contract.id}/deposits/${deposit.id}/settle`)).send({ settledAt: today, deductions }).expect(400);
    expect(refused.body.message).toBe(rateRequired(FX));

    const settled = (
      await auth(http().post(`/contracts/${contract.id}/deposits/${deposit.id}/settle`)).send({ settledAt: today, deductions, exchangeRate: 3.8 }).expect(201)
    ).body.deposits.find((d: Deposit) => d.id === deposit.id) as Deposit;
    // النقدُ الداخل 100 × 3.80 = 380.00 · الدخلُ بسعر الوديعة 100 × 3.75 = 375.00 · ربحٌ 380 − 375 = 5.00 دائنٌ على 5600.
    // (وقبل الإصلاح: 1000 مدين 375 · 4300 دائن 375 — والخمسةُ مطويّةٌ في النقدية.)
    expect(await linesOf(settled.settlementEntryId!)).toEqual({
      '1000': { debit: 380, credit: 0 },
      '4300': { debit: 0, credit: 375 },
      '5600': { debit: 0, credit: 5 },
    });
  });

  it('🔴 ⑤ B8 — عيبُ التقريب (البندُ ٢٩): وديعةُ 0.03 بسعر 1.5 بثلاثة أجزاءٍ 0.01 — قيدٌ متوازنٌ لا `journal_entry_unbalanced`', async () => {
    const contract = await makeContract({ currency: FX, exchangeRate: 1.5 });
    // الالتزامُ: 0.03 × 1.5 = 0.045 ⟵ `round2` (نصفٌ بعيداً عن الصفر) = 0.05.
    const withDeposit = (await auth(http().post(`/contracts/${contract.id}/deposits`)).send({ type: 'RENT', amount: 0.03, receivedAt: today }).expect(201))
      .body as ContractBody;
    const deposit = withDeposit.deposits[0];
    expect(Number(deposit.baseAmount)).toBe(0.05);

    // ذمّة 0.01 · دخل 0.01 · ردّ 0.03 − 0.02 = 0.01 — وكلٌّ منها بسعر 1.5: 0.015 ⟵ 0.02، فمجموعُها 0.06 مقابل التزامٍ 0.05.
    // قبل الإصلاح: مدين 0.05 ودائنٌ 0.06 ⟵ فرقٌ 0.01 > 0.001 ⟵ `400 journal_entry_unbalanced`.
    const settled = (
      await auth(http().post(`/contracts/${contract.id}/deposits/${deposit.id}/settle`))
        .send({
          settledAt: today,
          exchangeRate: 1.5,
          deductions: [
            { kind: 'UNPAID_RENT', amount: 0.01, reason: 'إيجار' },
            { kind: 'DAMAGE', amount: 0.01, reason: 'ضرر' },
          ],
        })
        .expect(201)
    ).body.deposits.find((d: Deposit) => d.id === deposit.id) as Deposit;
    expect(Number(settled.refundAmount)).toBe(0.01);
    // بقيّةُ التقريب 0.05 − 0.06 = −0.01 يحملها جزءٌ واحد: الأجزاءُ متساوية (0.02) فالدخلُ أوّلاً ⟵ 0.02 − 0.01 = 0.01.
    // الذمّةُ بسعر العقد 1.5: 0.01 × 1.5 = 0.015 ⟵ 0.02 · الردُّ بسعر اليوم 1.5: 0.02 · الفرقُ (0.02 − 0.02) + (0.02 − 0.02) = 0 ⟵ لا 5600.
    // التوازن: 0.05 = 0.02 + 0.01 + 0.02.
    expect(await linesOf(settled.settlementEntryId!)).toEqual({
      '2300': { debit: 0.05, credit: 0 },
      '1200': { debit: 0, credit: 0.02 },
      '4300': { debit: 0, credit: 0.01 },
      '1000': { debit: 0, credit: 0.02 },
    });
  });

  it('🔴 ⑥ B9 — إلغاءُ عقدٍ بعملةٍ أجنبية بردّ المقبوض: بلا سعرٍ `400` بلا أثر، وبسعرٍ يخرج النقدُ به والفرقُ على 5600', async () => {
    const contract = await makeContract({ currency: FX, exchangeRate: 3.75 });
    const last = [...contract.installments].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[contract.installments.length - 1];
    // قبضٌ مقدَّمٌ اليومَ لآخر الأقساط (بعد عامٍ تقريباً) بسعر العقد: 1000 × 3.75 = 3,750.00 التزاماً في `2400` (معفى — لا ضريبة).
    await auth(http().post(`/contracts/${contract.id}/payments`)).send({ installmentId: last.id, date: today, amount: 1000, method: 'CASH' }).expect(201);

    const cancelBody = { cancelDate: today, cancelReason: 'إخلاء مبكر', installmentDisposition: 'cancel', unearnedDisposition: 'refund' };
    // ⛔ المقبوضُ غيرُ المكتسَب يُردّ نقداً — بلا سعرِ يومٍ `400` مسمّى، والعقدُ باقٍ غيرَ ملغى.
    const refused = await auth(http().post(`/contracts/${contract.id}/cancel`)).send(cancelBody).expect(400);
    expect(refused.body.message).toBe(rateRequired(FX));
    expect((await readContract(contract.id)).status).not.toBe('CANCELLED');

    await auth(http().post(`/contracts/${contract.id}/cancel`)).send({ ...cancelBody, exchangeRate: 3.8 }).expect(201);
    expect((await readContract(contract.id)).status).toBe('CANCELLED');

    // قيدُ الإقفال الوحيد لهذا العقد — والرفضُ قبله لم يترك قيداً (معاملتُه أُرجعت).
    const entries = await tenantPrisma.runInTenantContext(company.companyId, (tx) =>
      tx.journalEntry.findMany({
        where: { AND: [{ memo: { startsWith: 'إقفال إيراد مؤجَّل عند الإلغاء' } }, { memo: { contains: contract.no } }] },
        select: { id: true },
      }),
    );
    expect(entries).toHaveLength(1);
    // الالتزامُ بسعر العقد 3,750.00 · المردودُ بعملة العقد 3,750 ÷ 3.75 = 1,000 × 3.80 (سعرُ يوم الإلغاء) = 3,800.00
    // · الفرقُ 3,750 − 3,800 = −50 ⟵ خسارةٌ مدينة 50.00 على 5600. التوازن: 3,750 + 50 = 3,800.
    // (وقبل الإصلاح: 2400 مدين 3,750 · 1000 دائن 3,750 — والخمسون مطويّةٌ في النقدية.)
    expect(await linesOf(entries[0].id)).toEqual({
      '2400': { debit: 3750, credit: 0 },
      '1000': { debit: 0, credit: 3800 },
      '5600': { debit: 50, credit: 0 },
    });
  });
});
