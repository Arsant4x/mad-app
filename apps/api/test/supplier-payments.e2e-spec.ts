import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (52.7 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(160000);

/**
 * سنداتُ الصرف للمورّدين وتخصيصُها على فواتير الشراء (`ق-٨٦٦` · `ق-٨٧١` · `ق-٨٧٢` · `ق-٨٧٥`).
 *
 * **الحارسُ الحيُّ الذي اشترطه المالك شرطَ قبول — بأربع مراحله والعكس**: شراءٌ `1,000` ⇒ `2100 = 1,000`
 * · سندٌ `400` ⇒ `2100 = 600` و`PARTIAL` · سندٌ `600` ⇒ `2100 = 0` و`PAID` · عكسُ الثاني ⇒ `600`
 * و`PARTIAL`. **وجوابُ كلِّ مرحلةٍ محسوبٌ يداً** لا مقارنةَ شكلٍ بشكل (`§8.30` — الوجه الثاني).
 *
 * **وتقريرُ التدفّق النقديّ يُقرأ في المراحل نفسِها** — فهو الذي يُنتج رقماً يقرؤه التاجر ويبني
 * عليه قرارَه، ولا يُعلَن «مبنيّ» حتى يستقيم (`ق-٨٧٥` — الشرطُ الثاني).
 *
 * كلُّ رقمٍ هنا يُقرأ من المسار الحقيقيّ (`/accounts` · `/reports/cash-flow` · `/journal` · `/banks`)
 * لا من حقلٍ مخزَّن — والمنشأةُ معزولةٌ تصنع صفوفَها وتزيلها (`ق-٧٢٢`).
 */
describe('Supplier payments + allocations (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let supplierId: string;
  let branchId: string;
  let cashBoxId: string;
  let cashBoxAccountId: string;

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const today = () => new Date().toISOString().slice(0, 10);

  /** فاتورةُ شراءٍ معفاة بإجماليٍّ محدَّد — فالحسابُ صريح: الإجماليُّ هو ما يُقيَّد على `2100`. */
  const makePurchase = async (total: number, currency?: string, exchangeRate?: number): Promise<{ id: string; no: string; journalEntryId: string | null }> => {
    const res = await auth(request(app.getHttpServer()).post('/purchases'))
      .send({
        supplierId,
        branchId,
        date: today(),
        category: `بند ${suffix}`,
        subtotal: total,
        exempt: true,
        ...(currency ? { currency, exchangeRate } : {}),
      })
      .expect(201);
    return { id: res.body.id, no: res.body.no, journalEntryId: res.body.journalEntryId as string | null };
  };

  const purchaseOf = async (id: string) => {
    const rows = (await auth(request(app.getHttpServer()).get('/purchases')).expect(200)).body as {
      id: string;
      no: string;
      status: string;
      total: string;
      /** ② نصٌّ بخانتين (`ق-١٢٣٥`) — يُقارَن حرفاً. */
      allocated: string;
      remaining: string;
    }[];
    return rows.find((r) => r.id === id)!;
  };

  /** رصيدُ حسابٍ برمزه كما يعرضه الدليل — الأستاذُ نفسُه لا حقلٌ على المستند. */
  const balanceOf = async (code: string): Promise<number> => {
    const accounts = (await auth(request(app.getHttpServer()).get('/accounts')).expect(200)).body as { code: string; balance: string }[];
    return Number(accounts.find((a) => a.code === code)!.balance);
  };

  const bankBalance = async (): Promise<number> => {
    const banks = (await auth(request(app.getHttpServer()).get('/banks')).expect(200)).body as { id: string; balance: string }[];
    return Number(banks.find((b) => b.id === cashBoxId)!.balance);
  };

  /** ② التدفّقُ يخرج نصّاً بخانتين (`ق-١٢٣٥`) — يُثبَت شكلُه ثم يُقرأ رقماً، فالفروقُ أدناه على الأرقام كما كانت. */
  const MONEY_TEXT = /^-?\d+\.\d{2}$/;
  const n = (text: string): number => {
    expect(text).toMatch(MONEY_TEXT);
    return Number(text);
  };
  const cashFlow = async () => {
    const body = (await auth(request(app.getHttpServer()).get('/reports/cash-flow')).expect(200)).body as {
      netProfit: string;
      payablesChange: string;
      operatingCashFlow: string;
      netCashChange: string;
    };
    return { netProfit: n(body.netProfit), payablesChange: n(body.payablesChange), operatingCashFlow: n(body.operatingCashFlow), netCashChange: n(body.netCashChange) };
  };

  const entryOf = async (journalEntryId: string, paymentNo: string) => {
    const res = (await auth(request(app.getHttpServer()).get(`/journal?search=${encodeURIComponent(paymentNo)}&pageSize=50`)).expect(200)).body;
    const rows = res.items as { id: string }[];
    return rows.find((r) => r.id === journalEntryId) as unknown as {
      id: string;
      branchId: string | null;
      memo: string;
      lines: { accountId: string; debit: string; credit: string; supplierId: string | null; customerId: string | null; account: { code: string } }[];
    };
  };

  const sums = (lines: { debit: string; credit: string }[]) => ({
    debit: lines.reduce((s, l) => s + Number(l.debit), 0),
    credit: lines.reduce((s, l) => s + Number(l.credit), 0),
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'supplier-payments');
    token = company.token;
    supplierId = (await auth(request(app.getHttpServer()).post('/suppliers')).send({ name: `مورّد سداد ${suffix}` }).expect(201)).body.id;
    branchId = (await auth(request(app.getHttpServer()).post('/branches')).send({ name: `فرع السداد ${suffix}` }).expect(201)).body.id;
    const box = (await auth(request(app.getHttpServer()).post('/banks'))
      .send({ name: `صندوق ${suffix}`, openingBalance: 5000, openingDate: today(), branchId })
      .expect(201)).body as { id: string; accountId: string };
    cashBoxId = box.id;
    cashBoxAccountId = box.accountId;
  }, 90000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 60000);

  // ── الحارسُ الحيّ: أربعُ مراحل والعكس — و`2100` والتدفّقُ يُقرآن في كلٍّ منها ──
  it('[SPEC 5.3 10.3] 1,000 purchase → 400 payment (600 · PARTIAL) → 600 payment (0 · PAID) → reversal (600 · PARTIAL): 2100 and the cash-flow report follow every step', async () => {
    const payablesBefore = await balanceOf('2100');
    const boxBefore = await bankBalance();
    const flowBefore = await cashFlow();

    // ١. الشراء: ذمّةٌ على `2100` بكامل الإجمالي — والتدفّقُ صفر (مصروفٌ ١٬٠٠٠ يقابله التزامٌ ١٬٠٠٠).
    const purchase = await makePurchase(1000);
    expect((await purchaseOf(purchase.id)).status).toBe('DUE');
    expect(await balanceOf('2100')).toBeCloseTo(payablesBefore + 1000, 2);
    const flowAfterPurchase = await cashFlow();
    expect(flowAfterPurchase.payablesChange - flowBefore.payablesChange).toBeCloseTo(1000, 2);
    expect(flowAfterPurchase.netCashChange - flowBefore.netCashChange).toBeCloseTo(0, 2);

    // ٢. سندٌ ٤٠٠: `2100` ينقص ٤٠٠ — للمرّة الأولى في تاريخ هذا المسار (ق-٨٦٣: صفرُ مدينٍ قبله).
    const first = await auth(request(app.getHttpServer()).post('/supplier-payments'))
      .send({ supplierId, branchId, date: today(), amount: 400, method: 'CASH', bankId: cashBoxId, allocations: [{ purchaseId: purchase.id, amount: 400 }] })
      .expect(201);
    expect(first.body.no).toMatch(/^PAY-\d{4}-\d{4}$/);
    expect(first.body.journalEntryId).toBeTruthy();

    let row = await purchaseOf(purchase.id);
    expect({ status: row.status, allocated: row.allocated, remaining: row.remaining }).toEqual({ status: 'PARTIAL', allocated: '400.00', remaining: '600.00' });
    expect(await balanceOf('2100')).toBeCloseTo(payablesBefore + 600, 2);
    expect(await bankBalance()).toBeCloseTo(boxBefore - 400, 2);

    // بُعدُ الطرف (ق-٨٧٣): قيدُ الشراء وقيدُ السداد يحملان المورّدَ على كلِّ سطر — مختوماً من `resolveDimensions()`.
    expect(purchase.journalEntryId).toBeTruthy();
    const purchaseEntry = await entryOf(purchase.journalEntryId!, purchase.no);
    expect(purchaseEntry.lines.map((l) => l.supplierId)).toEqual(purchaseEntry.lines.map(() => supplierId));

    // القيدُ: مدين `2100` ٤٠٠ · دائن حسابُ الصندوق نفسِه ٤٠٠ — لا `1000` ولا مصروف.
    const entry = await entryOf(first.body.journalEntryId, first.body.no);
    expect(entry.lines.map((l) => l.supplierId)).toEqual(entry.lines.map(() => supplierId));
    expect(entry.lines.every((l) => l.customerId === null)).toBe(true);
    expect(sums(entry.lines)).toEqual({ debit: 400, credit: 400 });
    expect(entry.branchId).toBe(branchId);
    expect(entry.lines.some((l) => l.account.code === '2100' && Number(l.debit) === 400)).toBe(true);
    expect(entry.lines.some((l) => l.accountId === cashBoxAccountId && Number(l.credit) === 400)).toBe(true);
    expect(entry.lines.map((l) => l.account.code)).not.toContain('5300');

    // التدفّق: الذممُ الدائنة زادت ٦٠٠ لا ١٬٠٠٠، والنقدُ خرج ٤٠٠.
    const flowAfterFirst = await cashFlow();
    expect(flowAfterFirst.payablesChange - flowBefore.payablesChange).toBeCloseTo(600, 2);
    expect(flowAfterFirst.netCashChange - flowBefore.netCashChange).toBeCloseTo(-400, 2);

    // ٣. سندٌ ٦٠٠: الذمّةُ صفر، والفاتورةُ `PAID`.
    const second = await auth(request(app.getHttpServer()).post('/supplier-payments'))
      .send({ supplierId, branchId, date: today(), amount: 600, method: 'CASH', bankId: cashBoxId, allocations: [{ purchaseId: purchase.id, amount: 600 }] })
      .expect(201);
    row = await purchaseOf(purchase.id);
    expect({ status: row.status, allocated: row.allocated, remaining: row.remaining }).toEqual({ status: 'PAID', allocated: '1000.00', remaining: '0.00' });
    expect(await balanceOf('2100')).toBeCloseTo(payablesBefore, 2);
    const flowAfterSecond = await cashFlow();
    expect(flowAfterSecond.payablesChange - flowBefore.payablesChange).toBeCloseTo(0, 2);
    expect(flowAfterSecond.netCashChange - flowBefore.netCashChange).toBeCloseTo(-1000, 2);

    // ٤. العكس: `PAID → PARTIAL` والـ٤٠٠ الأولى باقية، والقيدُ المضادّ متوازن، والصندوقُ يستعيد ٦٠٠.
    const reversal = await auth(request(app.getHttpServer()).post(`/supplier-payments/${second.body.id}/reverse`))
      .send({ reason: `تصحيح ${suffix}`, date: today() })
      .expect(201);
    expect(Number(reversal.body.amount)).toBeCloseTo(-600, 2);
    row = await purchaseOf(purchase.id);
    expect({ status: row.status, allocated: row.allocated, remaining: row.remaining }).toEqual({ status: 'PARTIAL', allocated: '400.00', remaining: '600.00' });
    expect(await balanceOf('2100')).toBeCloseTo(payablesBefore + 600, 2);
    expect(await bankBalance()).toBeCloseTo(boxBefore - 400, 2);

    const reversalEntry = await entryOf(reversal.body.journalEntryId, reversal.body.no);
    expect(sums(reversalEntry.lines)).toEqual({ debit: 600, credit: 600 });
    expect(reversalEntry.lines.some((l) => l.account.code === '2100' && Number(l.credit) === 600)).toBe(true);
    expect(reversalEntry.lines.some((l) => l.accountId === cashBoxAccountId && Number(l.debit) === 600)).toBe(true);

    const flowAfterReversal = await cashFlow();
    expect(flowAfterReversal.payablesChange - flowBefore.payablesChange).toBeCloseTo(600, 2);
    expect(flowAfterReversal.netCashChange - flowBefore.netCashChange).toBeCloseTo(-400, 2);

    // ولا يُعكس العكس، ولا يُعاد عكسُ الأصل مرّتين — والرفضُ يسمّي السندَ العاكس.
    await auth(request(app.getHttpServer()).post(`/supplier-payments/${reversal.body.id}/reverse`)).send({}).expect(409);
    const again = await auth(request(app.getHttpServer()).post(`/supplier-payments/${second.body.id}/reverse`)).send({}).expect(409);
    expect(String(again.body.message)).toContain(reversal.body.no);

    // 🔴 ولا يُعاد توزيعُ سندٍ عُكس — المرآةُ نفسُها (`ق-١١٩٨`/⑤): كان يُمرَّر `null` فيمرّ `201`.
    const other = await makePurchase(600);
    const realloc = await auth(request(app.getHttpServer()).post(`/supplier-payments/${second.body.id}/allocate`))
      .send({ allocations: [{ purchaseId: other.id, amount: 600 }] })
      .expect(409);
    expect(String(realloc.body.message)).toContain(reversal.body.no);
  }, 120000);

  // ── الفائضُ «دفعةٌ على الحساب»: يمدين `2100` كاملاً — رصيدٌ مدينٌ للمورّد لا أصلٌ ثانٍ (ق-٨٧٢) ──
  it('an unallocated payment debits 2100 in full — the supplier carries a debit balance until it is allocated', async () => {
    const payablesBefore = await balanceOf('2100');
    const onAccount = await auth(request(app.getHttpServer()).post('/supplier-payments'))
      .send({ supplierId, branchId, date: today(), amount: 250, method: 'CASH', bankId: cashBoxId })
      .expect(201);
    expect(onAccount.body.allocations).toHaveLength(0);
    expect(await balanceOf('2100')).toBeCloseTo(payablesBefore - 250, 2);

    // ثم يُخصَّص على شراءٍ لاحق فتُغلق الدفعةُ على الحساب من `2100` نفسِه — لا حركةَ قيدٍ جديدة.
    const purchase = await makePurchase(250);
    await auth(request(app.getHttpServer()).post(`/supplier-payments/${onAccount.body.id}/allocate`))
      .send({ allocations: [{ purchaseId: purchase.id, amount: 250 }] })
      .expect(201);
    expect((await purchaseOf(purchase.id)).status).toBe('PAID');
    expect(await balanceOf('2100')).toBeCloseTo(payablesBefore, 2);
  }, 90000);

  // ── الحدود: فوق المتبقّي، فوق مبلغ السند، مورّدٌ آخر — رفضٌ مسمّىً وبلا أثر ──
  it('refuses over-allocation, allocation above the payment amount, and another supplier’s invoice — named, and nothing is written', async () => {
    const purchase = await makePurchase(500);
    const before = (await auth(request(app.getHttpServer()).get('/supplier-payments')).expect(200)).body.length;

    const over = await auth(request(app.getHttpServer()).post('/supplier-payments'))
      .send({ supplierId, branchId, date: today(), amount: 900, method: 'CASH', bankId: cashBoxId, allocations: [{ purchaseId: purchase.id, amount: 900 }] })
      .expect(400);
    expect(over.body.message).toContain(purchase.no);
    expect(over.body.message).toContain('500.00');

    const above = await auth(request(app.getHttpServer()).post('/supplier-payments'))
      .send({ supplierId, branchId, date: today(), amount: 100, method: 'CASH', bankId: cashBoxId, allocations: [{ purchaseId: purchase.id, amount: 200 }] })
      .expect(400);
    expect(above.body.message).toContain('يتجاوز مبلغ السند');

    const other = (await auth(request(app.getHttpServer()).post('/suppliers')).send({ name: `مورّد آخر ${suffix}` }).expect(201)).body.id;
    const wrong = await auth(request(app.getHttpServer()).post('/supplier-payments'))
      .send({ supplierId: other, branchId, date: today(), amount: 100, method: 'CASH', bankId: cashBoxId, allocations: [{ purchaseId: purchase.id, amount: 100 }] })
      .expect(400);
    expect(wrong.body.message).toContain(purchase.no);

    const after = (await auth(request(app.getHttpServer()).get('/supplier-payments')).expect(200)).body.length;
    expect(after).toBe(before);
    expect((await purchaseOf(purchase.id)).status).toBe('DUE');
  }, 90000);

  // ── التزامن: سندان معاً على فاتورةٍ واحدة لا يتجاوزان المتبقّي (قفلُ الصفّ — 6.12) ──
  it('two concurrent payments on one purchase never exceed the remaining', async () => {
    const purchase = await makePurchase(1000);
    const body = { supplierId, branchId, date: today(), amount: 1000, method: 'CASH', bankId: cashBoxId, allocations: [{ purchaseId: purchase.id, amount: 1000 }] };
    const [r1, r2] = await Promise.all([
      auth(request(app.getHttpServer()).post('/supplier-payments')).send(body),
      auth(request(app.getHttpServer()).post('/supplier-payments')).send(body),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses[0]).toBe(201);
    expect(statuses[1]).toBeGreaterThanOrEqual(400);
    const loser = r1.status === 201 ? r2 : r1;
    expect(String(loser.body.message)).toContain(purchase.no);

    const row = await purchaseOf(purchase.id);
    expect({ status: row.status, allocated: row.allocated }).toEqual({ status: 'PAID', allocated: '1000.00' });
  }, 90000);

  // ── العملة: الذمّةُ بسعر فاتورة الشراء، والنقدُ بسعر يوم السداد، والفارقُ خسارةُ صرفٍ على 5600 ──
  it('a foreign-currency payment settles 2100 at the purchase rate and posts the difference on 5600', async () => {
    // شراءٌ ١٠٠ دولار بسعر 3.70 (ذمّةٌ ٣٧٠)، سُدِّد بسعر 3.80 (نقدٌ ٣٨٠) — خسارةُ صرفٍ محقَّقة ١٠.
    const purchase = await makePurchase(100, 'USD', 3.7);
    const pay = await auth(request(app.getHttpServer()).post('/supplier-payments'))
      .send({ supplierId, branchId, date: today(), amount: 100, method: 'CASH', bankId: cashBoxId, currency: 'USD', exchangeRate: 3.8, allocations: [{ purchaseId: purchase.id, amount: 100 }] })
      .expect(201);

    const entry = await entryOf(pay.body.journalEntryId, pay.body.no);
    const byCode = new Map(entry.lines.map((l) => [l.account.code, { debit: Number(l.debit), credit: Number(l.credit) }]));
    expect(byCode.get('2100')!.debit).toBeCloseTo(370, 2);
    expect(byCode.get('5600')!.debit).toBeCloseTo(10, 2);
    const cashLine = entry.lines.find((l) => l.accountId === cashBoxAccountId)!;
    expect(Number(cashLine.credit)).toBeCloseTo(380, 2);
    const s = sums(entry.lines);
    expect(s.debit).toBeCloseTo(s.credit, 2);
    expect((await purchaseOf(purchase.id)).status).toBe('PAID');

    // وتخصيصُ سندٍ بعملةٍ تخالف عملةَ الفاتورة مرفوضٌ صراحةً لا صامتاً.
    const sarPurchase = await makePurchase(100);
    const mismatch = await auth(request(app.getHttpServer()).post('/supplier-payments'))
      .send({ supplierId, branchId, date: today(), amount: 100, method: 'CASH', bankId: cashBoxId, currency: 'USD', exchangeRate: 3.8, allocations: [{ purchaseId: sarPurchase.id, amount: 100 }] })
      .expect(400);
    expect(String(mismatch.body.message)).toContain(sarPurchase.no);
  }, 90000);

  // ── الشراءُ المسدَّد لا يُحذف ولا يُنزَل إجماليُّه تحت مسدَّده — رفضٌ مسمّىً؛ والعلَمُ القديم مرفوض ──
  it('a purchase with payments cannot be deleted or shrunk below what was paid; the old paid flag is rejected', async () => {
    const purchase = await makePurchase(300);
    await auth(request(app.getHttpServer()).post('/supplier-payments'))
      .send({ supplierId, branchId, date: today(), amount: 200, method: 'CASH', bankId: cashBoxId, allocations: [{ purchaseId: purchase.id, amount: 200 }] })
      .expect(201);

    const del = await auth(request(app.getHttpServer()).delete(`/purchases/${purchase.id}`)).expect(409);
    expect(String(del.body.message)).toContain(purchase.no);

    const shrink = await auth(request(app.getHttpServer()).patch(`/purchases/${purchase.id}`)).send({ subtotal: 150 }).expect(409);
    expect(String(shrink.body.message)).toContain('200.00');

    // ورفعُه يبقي الحالةَ مشتقّةً من التخصيصات: ٢٠٠ من ٤٠٠ ⇒ ما زال جزئياً.
    await auth(request(app.getHttpServer()).patch(`/purchases/${purchase.id}`)).send({ subtotal: 400 }).expect(200);
    const row = await purchaseOf(purchase.id);
    expect({ status: row.status, remaining: row.remaining }).toEqual({ status: 'PARTIAL', remaining: '200.00' });

    await auth(request(app.getHttpServer()).patch(`/purchases/${purchase.id}`)).send({ paid: true }).expect(400);
  }, 90000);

  // ── حارسُ الانحراف: المخزَّن يطابق المحسوبَ من التخصيصات لكل فاتورةٍ لُمست ──
  it('after a sequence of operations the stored status matches the one computed from allocations for every purchase', async () => {
    const a = await makePurchase(1000);
    const b = await makePurchase(400);

    const p1 = await auth(request(app.getHttpServer()).post('/supplier-payments'))
      .send({ supplierId, branchId, date: today(), amount: 1000, method: 'CASH', bankId: cashBoxId, allocations: [{ purchaseId: a.id, amount: 1000 }] })
      .expect(201);
    expect((await purchaseOf(a.id)).status).toBe('PAID');

    await auth(request(app.getHttpServer()).post(`/supplier-payments/${p1.body.id}/allocate`))
      .send({ allocations: [{ purchaseId: a.id, amount: 600 }, { purchaseId: b.id, amount: 400 }] })
      .expect(201);
    await auth(request(app.getHttpServer()).post(`/supplier-payments/${p1.body.id}/allocate`)).send({ allocations: [] }).expect(201);
    await auth(request(app.getHttpServer()).post('/supplier-payments'))
      .send({ supplierId, branchId, date: today(), amount: 150, method: 'CASH', bankId: cashBoxId, allocations: [{ purchaseId: b.id, amount: 150 }] })
      .expect(201);

    const payments = (await auth(request(app.getHttpServer()).get(`/supplier-payments?supplierId=${supplierId}`)).expect(200)).body as {
      allocations: { purchaseId: string; amount: string }[];
    }[];
    const allocatedByPurchase = new Map<string, number>();
    for (const p of payments) for (const al of p.allocations) allocatedByPurchase.set(al.purchaseId, (allocatedByPurchase.get(al.purchaseId) ?? 0) + Number(al.amount));

    for (const purchase of [a, b]) {
      const row = await purchaseOf(purchase.id);
      const allocated = Math.round((allocatedByPurchase.get(purchase.id) ?? 0) * 100) / 100;
      const total = Math.round(Number(row.total) * 100) / 100;
      const computed = allocated >= total - 0.005 ? 'PAID' : allocated > 0.005 ? 'PARTIAL' : 'DUE';
      expect({ purchase: purchase.no, status: row.status, allocated: row.allocated }).toEqual({ purchase: purchase.no, status: computed, allocated: allocated.toFixed(2) });
    }
  }, 120000);

  // ── العزل: سندُ منشأةٍ لا يُرى من أخرى — 404 لا 403 (لا يُسرَّب وجودُه) ──
  it('[SPEC 1.2] a supplier payment is invisible to another company', async () => {
    const other = await registerIsolatedCompany(app, 'supplier-payments-b');
    try {
      const purchase = await makePurchase(120);
      const pay = await auth(request(app.getHttpServer()).post('/supplier-payments'))
        .send({ supplierId, branchId, date: today(), amount: 120, method: 'CASH', bankId: cashBoxId, allocations: [{ purchaseId: purchase.id, amount: 120 }] })
        .expect(201);
      await request(app.getHttpServer()).get(`/supplier-payments/${pay.body.id}`).set('Authorization', `Bearer ${other.token}`).expect(404);
      const list = (await request(app.getHttpServer()).get('/supplier-payments').set('Authorization', `Bearer ${other.token}`).expect(200)).body as { id: string }[];
      expect(list.some((p) => p.id === pay.body.id)).toBe(false);
    } finally {
      await removeIsolatedCompany(app, other);
    }
  }, 90000);
});
