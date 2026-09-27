import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): لم تُقَس بعد (بُنيت على جهازٍ مثقَل بلا تشغيل) — تُعلن سقفاً سخيّاً وتُصحَّح بثلاثة أضعاف المقيس.
jest.setTimeout(300000);

/**
 * **إعادةُ توزيع سند القبض تُرحّل فرقَ ذمّتها** (`ق-١٤٨٩`/B1 — الإصلاح F1 في `measure-fx-realized-difference.md`).
 *
 * كان `POST /payments/:id/allocate` يحذف التخصيصات القديمة ويكتب الجديدة **ولا يُرحّل شيئاً** — والذمّةُ المرحَّلة
 * للسند كلُّ تخصيصٍ بسعر فاتورته وغيرُ المخصَّص بسعر السند؛ فتخصيصُ ما كان «على الحساب» على فاتورةٍ بسعرٍ آخر
 * يترك الربحَ المحقَّق رصيداً يتيماً في `1200` باسم العميل وفاتورتُه مسدَّدة، ثم يعكس العكسُ على `5600` فرقاً
 * لم يُرحَّل أصلُه — شبحاً.
 *
 * **كلُّ رقمٍ هنا محسوبٌ يداً في تعليقه** من الشيفرة: `toBaseAmount = round2(amount × rate)` (`base-amount.util`)،
 * و`baseSettledOf` = التخصيصاتُ بأسعار فواتيرها + غيرُ المخصَّص بسعر السند (`settlement.util`)، و`fxGain = cash − settled`
 * للقبض (`postPartySettlementEntry`). والمقياسان من المسار الحقيقيّ: **`closing` كشف حساب العميل** (سطورُ `1200` التي تحمل
 * بُعدَه — `reports.service.statement`) و**صافي `5600` في ميزان المراجعة** (`creditTotal − debitTotal`) قبل كلِّ مرحلةٍ وبعدها.
 * والنقدُ بلا `bankId` فيقع على `1000` — لا مرآةَ صندوقٍ بعملةٍ أخرى.
 */
describe('Receipt reallocation posts its FX settlement difference (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let branchId: string;

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const today = () => new Date().toISOString().slice(0, 10);

  /** سنةٌ بعيدة لمسار قفل الفترات (③) — فلا تتقاطع فتراتُها مع تواريخ اليوم في ① و②. */
  const YEAR = 2091;
  const REALLOCATION_MEMO = 'إعادة توزيع مقبوض';

  const makeCustomer = async (tag: string): Promise<string> =>
    (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل إعادة التوزيع ${tag} ${suffix}` }).expect(201)).body.id as string;

  /** فاتورةٌ بالدولار ببندٍ واحدٍ معفى بـ100 — فأساسُها `100 × السعر` صريحاً. */
  const makeUsdInvoice = async (customerId: string, rate: number, date = today()): Promise<{ id: string; no: string }> => {
    const res = await auth(http().post('/invoices'))
      .send({
        customerId,
        branchId,
        issueDate: date,
        dueDate: date,
        currency: 'USD',
        exchangeRate: rate,
        lines: [{ description: `بند ${suffix}`, quantity: 1, unitPrice: 100, taxRate: 0, taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-29' }],
      })
      .expect(201);
    return { id: res.body.id as string, no: res.body.no as string };
  };

  /** سندُ قبضٍ 100 دولار بسعر 3.80 نقداً (`1000`). */
  const makeUsdReceipt = async (customerId: string, extra: Record<string, unknown>, date = today()): Promise<{ id: string; no: string }> => {
    const res = await auth(http().post('/payments'))
      .send({ customerId, branchId, date, amount: 100, method: 'CASH', currency: 'USD', exchangeRate: 3.8, ...extra })
      .expect(201);
    return { id: res.body.id as string, no: res.body.no as string };
  };

  /** رصيدُ العميل في `1200` كما يعرضه كشفُ حسابه — نصٌّ بخانتين يُقارَن حرفاً. */
  const closingOf = async (customerId: string): Promise<string> =>
    (await auth(http().get(`/reports/statement?customerId=${customerId}`)).expect(200)).body.closing as string;

  /** صافي `5600` في ميزان المراجعة: الدائنُ ربح — والغائبُ صفر (منشأةٌ لم يُرحَّل عليها فرقٌ بعد). */
  const net5600 = async (): Promise<number> => {
    const tb = (await auth(http().get('/reports/trial-balance')).expect(200)).body as { rows: { code: string; debitTotal: string; creditTotal: string }[] };
    const row = tb.rows.find((r) => r.code === '5600');
    return row ? Number(row.creditTotal) - Number(row.debitTotal) : 0;
  };

  const statusOf = async (invoiceId: string): Promise<string> => {
    const rows = (await auth(http().get('/invoices')).expect(200)).body as { id: string; status: string }[];
    const row = rows.find((r) => r.id === invoiceId);
    expect(row).toBeDefined();
    return row!.status;
  };

  interface JournalItem {
    id: string;
    date: string;
    memo: string;
    branchId: string | null;
    lines: { debit: string; credit: string; customerId: string | null; account: { code: string } }[];
  }

  /** قيودُ فرق إعادة التوزيع لسندٍ — بمذكّرتها التي تسمّيه (`postCustomerPaymentEntry` بـ`reallocation`). */
  const reallocationEntriesOf = async (paymentNo: string): Promise<JournalItem[]> => {
    const body = (await auth(http().get(`/journal?search=${encodeURIComponent(paymentNo)}&pageSize=50`)).expect(200)).body as { items: JournalItem[] };
    return body.items.filter((e) => e.memo.startsWith(`${REALLOCATION_MEMO} — سند ${paymentNo} —`));
  };

  /** سطورُ القيد برموزها مرتّبةً — فشكلُه كلُّه يُقارَن مرّةً واحدة (ولا سطرَ نقدٍ صفريّ يختبئ). */
  const shapeOf = (entry: JournalItem) =>
    entry.lines
      .map((l) => ({ code: l.account.code, debit: Number(l.debit), credit: Number(l.credit) }))
      .sort((a, b) => a.code.localeCompare(b.code, 'en'));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'realloc-fx');
    token = company.token;
    branchId = (await auth(http().post('/branches')).send({ name: `فرع إعادة التوزيع ${suffix}` }).expect(201)).body.id as string;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('① «على الحساب» ثم تخصيصٌ على فاتورةٍ بسعرٍ آخر ⇒ الربحُ على 5600 و1200 صفر — والعكسُ يعيد 5600 إلى بدايته بلا شبح', async () => {
    const customerId = await makeCustomer('①');
    // الفاتورة A: 100 USD @3.70 ⟵ مدين 1200 = round2(100 × 3.70) = 370.
    const a = await makeUsdInvoice(customerId, 3.7);
    const start = await net5600();

    // السند: 100 USD @3.80 على الحساب ⟵ الذمّة = baseSettledOf(100, 3.8, [], ∅) = round2(100 × 3.80) = 380،
    // والنقد 380 ⟵ fxGain = 380 − 380 = 0: مدين 1000 380 · دائن 1200 380 — ولا سطرَ 5600.
    const p = await makeUsdReceipt(customerId, { unallocated: 'ON_ACCOUNT' });
    // 1200 للعميل = 370 − 380 = −10.
    expect(await closingOf(customerId)).toBe('-10.00');
    expect((await net5600()) - start).toBeCloseTo(0, 2);
    expect(await reallocationEntriesOf(p.no)).toHaveLength(0);

    // التوزيع على A: قبل = 380 (لا تخصيص) · بعد = baseSettledOf(100, 3.8, [{A,100}], {A:3.70}) = 370 ⟵ الفرق = 370 − 380 = −10
    // ⟵ قيدٌ بلا نقد: مدين 1200 10 · دائن 5600 10 (fxGain = 0 − (−10) = +10، ربح).
    await auth(http().post(`/payments/${p.id}/allocate`)).send({ allocations: [{ invoiceId: a.id, amount: 100 }] }).expect(201);
    // 1200 = −10 + 10 = 0 — لا رصيدَ يتيم باسم العميل وفاتورتُه مسدَّدة.
    expect(await closingOf(customerId)).toBe('0.00');
    // 5600 = +10 (ربحُ الصرف المحقَّق: 380 − 370) — يومَ التوزيع لا يومَ العكس.
    expect((await net5600()) - start).toBeCloseTo(10, 2);
    expect(await statusOf(a.id)).toBe('PAID');

    // شكلُ القيد كلُّه: سطران لا ثلاثة (لا سطرَ نقدٍ صفريّ)، والعميلُ مختومٌ على سطوره، وفرعُه فرعُ السند.
    const entries = await reallocationEntriesOf(p.no);
    expect(entries).toHaveLength(1);
    expect(shapeOf(entries[0])).toEqual([
      { code: '1200', debit: 10, credit: 0 },
      { code: '5600', debit: 0, credit: 10 },
    ]);
    expect(entries[0].lines.every((l) => l.customerId === customerId)).toBe(true);
    expect(entries[0].branchId).toBe(branchId);

    // العكس: الذمّة = −baseSettledOf(100, 3.8, [{A,100}], {A:3.70}) = −370 · النقد = round2(−100 × 3.80) = −380
    // ⟵ fxGain = −380 − (−370) = −10: دائن 1000 380 · مدين 1200 370 · مدين 5600 10.
    await auth(http().post(`/payments/${p.id}/reverse`)).send({}).expect(201);
    // 1200 = 0 + 370 = 370 = رصيدُ الفاتورة المفتوحة كاملاً (كان 360 قبل الإصلاح: ناقصاً 10).
    expect(await closingOf(customerId)).toBe('370.00');
    // 5600 = +10 − 10 = 0 — يعود إلى بدايته (كان −10 قبل الإصلاح: خسارةٌ شبحية).
    expect((await net5600()) - start).toBeCloseTo(0, 2);
    expect(await statusOf(a.id)).toBe('DUE');
  });

  it('② نقلُ التخصيص من فاتورة @3.70 إلى فاتورة @3.60 ⇒ الفرقُ من التخصيص القديم لا من «على الحساب» — والعكسُ مرآةٌ تامّة', async () => {
    const customerId = await makeCustomer('②');
    // A2: مدين 1200 = round2(100 × 3.70) = 370 · B: مدين 1200 = round2(100 × 3.60) = 360 ⟵ 1200 = 730.
    const a2 = await makeUsdInvoice(customerId, 3.7);
    const b = await makeUsdInvoice(customerId, 3.6);
    const start = await net5600();

    // السند مخصَّصٌ عند إنشائه على A2: الذمّة = 370 · النقد = 380 ⟵ fxGain = +10: مدين 1000 380 · دائن 1200 370 · دائن 5600 10.
    const p = await makeUsdReceipt(customerId, { allocations: [{ invoiceId: a2.id, amount: 100 }] });
    // 1200 = 730 − 370 = 360 · 5600 = +10.
    expect(await closingOf(customerId)).toBe('360.00');
    expect((await net5600()) - start).toBeCloseTo(10, 2);

    // النقل إلى B: قبل = baseSettledOf(100, 3.8, [{A2,100}], {A2:3.70}) = 370 — **تُقرأ قبل حذف القديمة** ·
    // بعد = baseSettledOf(100, 3.8, [{B,100}], {B:3.60}) = 360 ⟵ الفرق = 360 − 370 = −10 ⟵ مدين 1200 10 · دائن 5600 10.
    await auth(http().post(`/payments/${p.id}/allocate`)).send({ allocations: [{ invoiceId: b.id, amount: 100 }] }).expect(201);
    // 1200 = 360 + 10 = 370 = A2 المفتوحة وحدَها. (بلا إصلاح: 360. ولو قُرئ «قبل» بعد الحذف = round2(100 × 3.80) = 380
    // لصار الفرق 360 − 380 = −20 ⟵ 1200 = 380 و5600 = +30.)
    expect(await closingOf(customerId)).toBe('370.00');
    // 5600 = +10 + 10 = +20 = النقد 380 − ذمّة B 360: الربحُ الحقيقيّ للسند كما وُزِّع الآن.
    expect((await net5600()) - start).toBeCloseTo(20, 2);
    expect(await statusOf(a2.id)).toBe('DUE');
    expect(await statusOf(b.id)).toBe('PAID');
    const entries = await reallocationEntriesOf(p.no);
    expect(entries).toHaveLength(1);
    expect(shapeOf(entries[0])).toEqual([
      { code: '1200', debit: 10, credit: 0 },
      { code: '5600', debit: 0, credit: 10 },
    ]);

    // العكس: الذمّة = −baseSettledOf(100, 3.8, [{B,100}], {B:3.60}) = −360 · النقد = −380 ⟵ fxGain = −380 − (−360) = −20
    // ⟵ دائن 1000 380 · مدين 1200 360 · مدين 5600 20.
    await auth(http().post(`/payments/${p.id}/reverse`)).send({}).expect(201);
    // 1200 = 370 + 360 = 730 = الفاتورتان مفتوحتان كاملاً.
    expect(await closingOf(customerId)).toBe('730.00');
    // 5600 = +20 − 20 = 0 — مرآةٌ تامّة للإنشاء والتوزيع معاً.
    expect((await net5600()) - start).toBeCloseTo(0, 2);
    expect(await statusOf(a2.id)).toBe('DUE');
    expect(await statusOf(b.id)).toBe('DUE');
  });

  // ⚠️ **آخرُ الحزمة عمداً**: السنةُ المالية تُنشأ هنا، وبعدها يُرفض كلُّ قيدٍ بتاريخٍ خارج فتراتها (`fiscal_no_period_for_date`)
  //    — فلا يسبق ① و② وقيودُهما بيوم اليوم.
  it('③ فرقُ التوزيع مؤرَّخٌ بيوم الطلب وخاضعٌ لقفل الفترات — الرفضُ يُسقط التوزيعَ كلَّه ويُبقي القديم', async () => {
    const year = (await auth(http().post('/fiscal-years')).send({ name: `سنة ${YEAR} ${suffix}`, start: `${YEAR}-01-01`, end: `${YEAR}-12-31` }).expect(201))
      .body as { periods: { id: string; month: number; year: number }[] };
    const april = year.periods.find((pr) => pr.month === 4 && pr.year === YEAR);
    expect(april).toBeDefined();

    const customerId = await makeCustomer('③');
    const inMarch = `${YEAR}-03-10`;
    // A3: مدين 1200 = 370 · B3: مدين 1200 = 360.
    const a3 = await makeUsdInvoice(customerId, 3.7, inMarch);
    const b3 = await makeUsdInvoice(customerId, 3.6, inMarch);
    const start = await net5600();
    // السند على A3 في مارس: دائن 1200 370 · دائن 5600 10 ⟵ 1200 = 730 − 370 = 360 · 5600 = +10.
    const p = await makeUsdReceipt(customerId, { allocations: [{ invoiceId: a3.id, amount: 100 }] }, inMarch);
    expect(await closingOf(customerId)).toBe('360.00');
    expect((await net5600()) - start).toBeCloseTo(10, 2);

    await auth(http().patch(`/fiscal-years/periods/${april!.id}/close`)).expect(200);

    // النقلُ إلى B3 بيومٍ في أبريل المقفل: الفرقُ (−10) يُرحَّل بذلك اليوم ⟵ `assertPeriodOpen` يرفض بـ409 مسمّياً الفترة.
    const refused = await auth(http().post(`/payments/${p.id}/allocate`))
      .send({ allocations: [{ invoiceId: b3.id, amount: 100 }], date: `${YEAR}-04-15` })
      .expect(409);
    expect(String(refused.body.message)).toContain(`04/${YEAR}`);
    // والمعاملةُ كلُّها سقطت: التخصيصُ القديم باقٍ على A3 (الحذفُ سبق القيدَ ورجع معه)، ولا قيدَ فرق، والأرصدةُ كما كانت.
    const kept = (await auth(http().get(`/payments/${p.id}`)).expect(200)).body as { allocatedTotal: string; allocations: { invoiceId: string }[] };
    expect(kept.allocatedTotal).toBe('100.00');
    expect(kept.allocations.map((al) => al.invoiceId)).toEqual([a3.id]);
    expect(await statusOf(a3.id)).toBe('PAID');
    expect(await statusOf(b3.id)).toBe('DUE');
    expect(await reallocationEntriesOf(p.no)).toHaveLength(0);
    expect(await closingOf(customerId)).toBe('360.00');
    expect((await net5600()) - start).toBeCloseTo(10, 2);

    // ويومٌ في مايو المفتوح يمرّ: الفرق −10 ⟵ مدين 1200 10 · دائن 5600 10، **بذلك اليوم لا يوم الخادم**.
    await auth(http().post(`/payments/${p.id}/allocate`))
      .send({ allocations: [{ invoiceId: b3.id, amount: 100 }], date: `${YEAR}-05-15` })
      .expect(201);
    // 1200 = 360 + 10 = 370 · 5600 = +10 + 10 = +20.
    expect(await closingOf(customerId)).toBe('370.00');
    expect((await net5600()) - start).toBeCloseTo(20, 2);
    const entries = await reallocationEntriesOf(p.no);
    expect(entries).toHaveLength(1);
    expect(entries[0].date.slice(0, 10)).toBe(`${YEAR}-05-15`);
  });
});
