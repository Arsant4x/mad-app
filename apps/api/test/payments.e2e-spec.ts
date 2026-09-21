import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { dayStartOf } from '../src/common/wall-clock.util';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

/**
 * المقبوضات وتخصيصها (4.5) — بنود تحقق الموجز السبعة + الثامن (الانحراف).
 *
 * القاعدة التي تحرسها هذه المجموعة: «المدفوع» و«المتبقي» يُحسبان من
 * التخصيصات دائماً، والحالة المخزَّنة مجرد مرآة لها — إن انحرفت المرآة عن
 * الأصل يوماً، فالاختبار الثامن هو من يكشفه.
 */
describe('Customer payments + allocations (e2e)', () => {
  let app: INestApplication;
  let token: string;
  // منشأةٌ معزولة (ق-٧٢٢): الصندوقُ (بنكٌ) يُنشأ في منشأةٍ يصنعها الاختبارُ ويزيلها — لا في منشأة العرض.
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let customerId: string;
  let branchId: string;
  let cashBoxId: string;

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const today = () => new Date().toISOString().slice(0, 10);

  /** فاتورة بإجمالي محدَّد: بند واحد بلا ضريبة يجعل الحساب صريحاً. */
  const makeInvoice = async (total: number, currency?: string, exchangeRate?: number): Promise<{ id: string; no: string }> => {
    const res = await auth(request(app.getHttpServer()).post('/invoices'))
      .send({
        customerId,
        branchId,
        issueDate: today(),
        dueDate: today(),
        ...(currency ? { currency, exchangeRate } : {}),
        lines: [{ description: `بند ${suffix}`, quantity: 1, unitPrice: total, taxRate: 0, taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-29' }],
      })
      .expect(201);
    return { id: res.body.id, no: res.body.no };
  };

  /** لا مسار تفصيل مفرد للفواتير هنا — نقرأ الصفّ من القائمة. */
  const invoiceOf = async (id: string) => {
    const rows = (await auth(request(app.getHttpServer()).get('/invoices')).expect(200)).body as { id: string }[];
    return rows.find((r) => r.id === id) as unknown as { id: string; no: string; status: string; total: string; dueDate: string };
  };
  const invoiceStatus = async (id: string): Promise<string> => (await invoiceOf(id)).status;

  /** المتبقي كما يعرضه الخادم — محسوباً من التخصيصات لا من حقل مخزَّن.
   *  ② يصل نصّاً بخانتين (`ق-١٢٣٥`) وشكلُه يُثبَت حرفاً، ثم يُقرأ رقماً للمقارنة؛ والفاتورةُ المسدَّدة تغيب من القائمة فصفر. */
  const remainingOf = async (invoiceId: string): Promise<number> => {
    const rows = (await auth(request(app.getHttpServer()).get(`/payments/open-invoices/${customerId}`)).expect(200)).body as { id: string; remaining: string; allocated: string }[];
    const row = rows.find((r) => r.id === invoiceId);
    if (!row) return 0;
    expect(row.remaining).toMatch(/^-?\d+\.\d{2}$/);
    expect(row.allocated).toMatch(/^-?\d+\.\d{2}$/);
    return Number(row.remaining);
  };

  const bankBalance = async (): Promise<number> => {
    const banks = (await auth(request(app.getHttpServer()).get('/banks')).expect(200)).body as { id: string; balance: string }[];
    return Number(banks.find((b) => b.id === cashBoxId)!.balance);
  };

  /** كذلك القيود: يُبحث عنها في الدفتر برقم السند (بحثٌ في المذكّرة). */
  const entryOf = async (journalEntryId: string, paymentNo: string) => {
    const res = (await auth(request(app.getHttpServer()).get(`/journal?search=${encodeURIComponent(paymentNo)}&pageSize=50`)).expect(200)).body;
    const rows = res.items as { id: string }[];
    // `accountId` معلَنٌ في النوع: القيدُ يُقرأ بحسابه لا برمزه وحده — فرموزُ
    // الصناديق والبنوك تُولَّد لكلٍّ على حدة (ق-٢٧٧).
    return rows.find((r) => r.id === journalEntryId) as unknown as {
      id: string;
      branchId: string | null;
      lines: { accountId: string; debit: string; credit: string; customerId: string | null; supplierId: string | null; account: { code: string } }[];
    };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'payments');
    token = company.token;
    customerId = (await auth(request(app.getHttpServer()).post('/customers')).send({ name: `عميل مقبوضات ${suffix}` }).expect(201)).body.id;
    branchId = (await auth(request(app.getHttpServer()).post('/branches')).send({ name: `فرع المقبوضات ${suffix}` }).expect(201)).body.id;
    cashBoxId = (await auth(request(app.getHttpServer()).post('/banks'))
      .send({ name: `صندوق ${suffix}`, openingBalance: 0, openingDate: today(), branchId })
      .expect(201)).body.id;
  }, 90000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 60000);

  // ── 1: 1000 → دفعة 400 ⇒ PARTIAL والمتبقي 600 ──
  it('a 400 payment against a 1000 invoice leaves it PARTIAL with 600 remaining', async () => {
    const inv = await makeInvoice(1000);
    expect(await invoiceStatus(inv.id)).toBe('DUE');

    const pay = await auth(request(app.getHttpServer()).post('/payments'))
      .send({ customerId, branchId, date: today(), amount: 400, method: 'CASH', bankId: cashBoxId, allocations: [{ invoiceId: inv.id, amount: 400 }] })
      .expect(201);
    expect(pay.body.no).toMatch(/^RCV-\d{4}-\d{4}$/);

    expect(await invoiceStatus(inv.id)).toBe('PARTIAL');
    expect(await remainingOf(inv.id)).toBeCloseTo(600, 2);

    // ── 2 (تتمة): دفعة 600 ⇒ PAID ──
    await auth(request(app.getHttpServer()).post('/payments'))
      .send({ customerId, branchId, date: today(), amount: 600, method: 'CASH', bankId: cashBoxId, allocations: [{ invoiceId: inv.id, amount: 600 }] })
      .expect(201);
    expect(await invoiceStatus(inv.id)).toBe('PAID');
    expect(await remainingOf(inv.id)).toBe(0);
  }, 90000);

  // ── 3: دفعة واحدة توزَّع على فاتورتين ──
  it('one payment splits across two invoices', async () => {
    const a = await makeInvoice(300);
    const b = await makeInvoice(700);

    const pay = await auth(request(app.getHttpServer()).post('/payments'))
      .send({
        customerId,
        branchId,
        date: today(),
        amount: 1000,
        method: 'CASH',
        bankId: cashBoxId,
        allocations: [
          { invoiceId: a.id, amount: 300 },
          { invoiceId: b.id, amount: 700 },
        ],
      })
      .expect(201);

    expect(pay.body.allocations).toHaveLength(2);
    expect(await invoiceStatus(a.id)).toBe('PAID');
    expect(await invoiceStatus(b.id)).toBe('PAID');
  }, 90000);

  // ── 4: تخصيص أكثر من المتبقي ⇒ رفض مسمّى، وبلا أثر ──
  it('refuses allocating more than an invoice’s remaining — named, and nothing is written', async () => {
    const inv = await makeInvoice(500);
    const before = (await auth(request(app.getHttpServer()).get('/payments')).expect(200)).body.length;

    const res = await auth(request(app.getHttpServer()).post('/payments'))
      .send({ customerId, branchId, date: today(), amount: 900, method: 'CASH', bankId: cashBoxId, allocations: [{ invoiceId: inv.id, amount: 900 }] })
      .expect(400);
    expect(res.body.message).toContain(inv.no);
    expect(res.body.message).toContain('500.00');

    const after = (await auth(request(app.getHttpServer()).get('/payments')).expect(200)).body.length;
    expect(after).toBe(before);
    expect(await invoiceStatus(inv.id)).toBe('DUE');

    // ومجموع التخصيصات فوق مبلغ السند مرفوض كذلك.
    const over = await auth(request(app.getHttpServer()).post('/payments'))
      .send({ customerId, branchId, date: today(), amount: 100, method: 'CASH', bankId: cashBoxId, allocations: [{ invoiceId: inv.id, amount: 200 }] })
      .expect(400);
    expect(over.body.message).toContain('يتجاوز مبلغ السند');
  }, 90000);

  // ── 5: دفعتان متزامنتان على نفس الفاتورة ⇒ واحدة تنجح والأخرى 409/400 مسمّاة ──
  it('two concurrent payments on one invoice never exceed the remaining', async () => {
    const inv = await makeInvoice(1000);

    const [r1, r2] = await Promise.all([
      auth(request(app.getHttpServer()).post('/payments')).send({ customerId, branchId, date: today(), amount: 1000, method: 'CASH', bankId: cashBoxId, allocations: [{ invoiceId: inv.id, amount: 1000 }] }),
      auth(request(app.getHttpServer()).post('/payments')).send({ customerId, branchId, date: today(), amount: 1000, method: 'CASH', bankId: cashBoxId, allocations: [{ invoiceId: inv.id, amount: 1000 }] }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses[0]).toBe(201);
    expect(statuses[1]).toBeGreaterThanOrEqual(400);

    const loser = r1.status === 201 ? r2 : r1;
    expect(String(loser.body.message)).toContain(inv.no);

    // الحقيقة النهائية: المخصَّص = 1000 بالضبط، لا 2000.
    expect(await invoiceStatus(inv.id)).toBe('PAID');
    expect(await remainingOf(inv.id)).toBe(0);
  }, 90000);

  // ── 6: القيد متوازن والصندوق زاد بفرع الدفعة ──
  it('[SPEC 3.3 7.3 7.5] posts a balanced entry (debit cash / credit A-R) and raises the branch cash box', async () => {
    const inv = await makeInvoice(250);
    const before = await bankBalance();

    const pay = await auth(request(app.getHttpServer()).post('/payments'))
      .send({ customerId, branchId, date: today(), amount: 250, method: 'CASH', bankId: cashBoxId, allocations: [{ invoiceId: inv.id, amount: 250 }] })
      .expect(201);
    expect(pay.body.journalEntryId).toBeTruthy();

    const entry = await entryOf(pay.body.journalEntryId, pay.body.no);
    // بُعدُ الطرف (ق-٨٧٣): قيدُ القبض يحمل العميلَ على كلِّ سطر — مختوماً من `resolveDimensions()` لا بيد.
    expect(entry.lines.map((l) => l.customerId)).toEqual(entry.lines.map(() => customerId));
    expect(entry.lines.every((l) => l.supplierId === null)).toBe(true);
    const debit = entry.lines.reduce((s: number, l: { debit: string }) => s + Number(l.debit), 0);
    const credit = entry.lines.reduce((s: number, l: { credit: string }) => s + Number(l.credit), 0);
    expect(debit).toBeCloseTo(credit, 2);
    expect(debit).toBeCloseTo(250, 2);
    expect(entry.branchId).toBe(branchId);
    // لا إيراد في قيد التحصيل — الإيراد اعتُرف يوم الفاتورة.
    const codes = entry.lines.map((l: { account: { code: string } }) => l.account.code);
    expect(codes).toContain('1200');
    expect(codes).not.toContain('4100');

    // ⚠️ (ق-٢٧٦ · ق-٢٧٧) **الطرفُ المدين حسابُ الصندوق نفسِه لا `1000`**: كان
    //    هذا التوكيد يشترط `1000` — أي أن نقدَ كل صندوقٍ وبنكٍ يُلمّ في حسابٍ
    //    واحد، وهو العطلُ الذي أُغلق. والدفعةُ هنا تُقبض على صندوق فرعٍ (Bank)،
    //    فيَدين حسابُه هو.
    const boxes = (await auth(request(app.getHttpServer()).get('/banks')).expect(200)).body as { id: string; accountId: string }[];
    const box = boxes.find((b) => b.id === cashBoxId)!;
    expect(entry.lines.some((l: { accountId: string; debit: string }) => l.accountId === box.accountId && Number(l.debit) === 250)).toBe(true);

    expect(await bankBalance()).toBeCloseTo(before + 250, 2);
  }, 90000);

  // ── 7 (تنبيه ١): العكس يعيد الحالة السابقة · قيد متوازن · والصندوق ينقص ──
  it('a reversal restores the previous status, balances its own entry, and lowers the cash box', async () => {
    const inv = await makeInvoice(800);
    await auth(request(app.getHttpServer()).post('/payments'))
      .send({ customerId, branchId, date: today(), amount: 300, method: 'CASH', bankId: cashBoxId, allocations: [{ invoiceId: inv.id, amount: 300 }] })
      .expect(201);
    const second = await auth(request(app.getHttpServer()).post('/payments'))
      .send({ customerId, branchId, date: today(), amount: 500, method: 'CASH', bankId: cashBoxId, allocations: [{ invoiceId: inv.id, amount: 500 }] })
      .expect(201);
    expect(await invoiceStatus(inv.id)).toBe('PAID');

    const beforeBalance = await bankBalance();
    const rev = await auth(request(app.getHttpServer()).post(`/payments/${second.body.id}/reverse`)).send({ reason: `تصحيح ${suffix}` }).expect(201);

    // PAID → PARTIAL: الـ300 الأولى باقية.
    expect(await invoiceStatus(inv.id)).toBe('PARTIAL');
    expect(await remainingOf(inv.id)).toBeCloseTo(500, 2);

    expect(Number(rev.body.amount)).toBeCloseTo(-500, 2);
    const revEntry = await entryOf(rev.body.journalEntryId, rev.body.no);
    const rd = revEntry.lines.reduce((s: number, l: { debit: string }) => s + Number(l.debit), 0);
    const rc = revEntry.lines.reduce((s: number, l: { credit: string }) => s + Number(l.credit), 0);
    expect(rd).toBeCloseTo(rc, 2);
    expect(rd).toBeCloseTo(500, 2);

    expect(await bankBalance()).toBeCloseTo(beforeBalance - 500, 2);

    // ولا يُعكس العكس، ولا يُعاد عكس الأصل مرتين.
    await auth(request(app.getHttpServer()).post(`/payments/${rev.body.id}/reverse`)).send({}).expect(409);
    const again = await auth(request(app.getHttpServer()).post(`/payments/${second.body.id}/reverse`)).send({}).expect(409);
    expect(String(again.body.message)).toContain(rev.body.no);

    // 🔴 ولا يُعاد توزيعُ سندٍ عُكس (`ق-١١٩٨`/⑤ — مراجعةٌ خارجية): كان يمرّ `201` فتُختم فاتورةٌ
    //    أخرى مسدَّدةً بمالٍ رُدّ، وعكسُه يحمل مرآةَ التوزيع القديم على الفاتورة الأولى.
    const other = await makeInvoice(500);
    const realloc = await auth(request(app.getHttpServer()).post(`/payments/${second.body.id}/allocate`))
      .send({ allocations: [{ invoiceId: other.id, amount: 500 }] })
      .expect(409);
    expect(String(realloc.body.message)).toContain(rev.body.no);
    expect(await invoiceStatus(other.id)).toBe('DUE');
    expect(await invoiceStatus(inv.id)).toBe('PARTIAL');
  }, 90000);

  // ── 8 (تنبيه ٢): عملة غير الأساسية ⇒ الترحيل بالأساسية والفرق على 5600 ──
  it('a foreign-currency payment posts in base currency with the difference on 5600', async () => {
    // فاتورة بالدولار بسعر 3.70، ثم تحصيلها بسعر 3.80 — فرق محقَّق 10 ريالات
    // على 100 دولار: يُرحَّل على 5600 لا يتضخّم به النقد ولا الذمّة.
    const inv = await makeInvoice(100, 'USD', 3.7);
    const pay = await auth(request(app.getHttpServer()).post('/payments'))
      .send({ customerId, branchId, date: today(), amount: 100, method: 'CASH', bankId: cashBoxId, currency: 'USD', exchangeRate: 3.8, allocations: [{ invoiceId: inv.id, amount: 100 }] })
      .expect(201);

    const entry = await entryOf(pay.body.journalEntryId, pay.body.no);
    const byCode = new Map<string, { debit: number; credit: number }>(
      entry.lines.map((l: { account: { code: string }; debit: string; credit: string }) => [l.account.code, { debit: Number(l.debit), credit: Number(l.credit) }]),
    );
    // النقد بسعر الدفعة، والذمّة بسعر فاتورتها، والفارق على 5600.
    // (ق-٢٧٧) والنقدُ في حساب الصندوق المستقبِل لا في `1000` — يُقرأ بمعرّفه
    // لا برمزٍ ثابت، فالرمزُ يُولَّد لكل صندوق.
    const boxesFx = (await auth(request(app.getHttpServer()).get('/banks')).expect(200)).body as { id: string; accountId: string }[];
    const boxFx = boxesFx.find((b) => b.id === cashBoxId)!;
    const cashLine = entry.lines.find((l: { accountId: string }) => l.accountId === boxFx.accountId)!;
    expect(Number(cashLine.debit)).toBeCloseTo(380, 2);
    expect(byCode.get('1200')!.credit).toBeCloseTo(370, 2);
    expect(byCode.get('5600')!.credit).toBeCloseTo(10, 2);

    const debit = entry.lines.reduce((s: number, l: { debit: string }) => s + Number(l.debit), 0);
    const credit = entry.lines.reduce((s: number, l: { credit: string }) => s + Number(l.credit), 0);
    expect(debit).toBeCloseTo(credit, 2);

    expect(await invoiceStatus(inv.id)).toBe('PAID');

    // وتخصيص دفعةٍ بعملة تخالف عملة الفاتورة مرفوض صراحةً لا صامتاً.
    const sarInvoice = await makeInvoice(100);
    const mismatch = await auth(request(app.getHttpServer()).post('/payments'))
      .send({ customerId, branchId, date: today(), amount: 100, method: 'CASH', bankId: cashBoxId, currency: 'USD', exchangeRate: 3.8, allocations: [{ invoiceId: sarInvoice.id, amount: 100 }] })
      .expect(400);
    expect(String(mismatch.body.message)).toContain(sarInvoice.no);
  }, 90000);

  // ── 9 (الاختبار الثامن المتفق عليه): لا انحراف بين المخزَّن والمحسوب ──
  it('after a sequence of operations the stored status matches the computed one for every invoice', async () => {
    const a = await makeInvoice(1000);
    const b = await makeInvoice(400);

    // دفعة → تخصيص كامل لـa
    const p1 = await auth(request(app.getHttpServer()).post('/payments'))
      .send({ customerId, branchId, date: today(), amount: 1000, method: 'CASH', bankId: cashBoxId, allocations: [{ invoiceId: a.id, amount: 1000 }] })
      .expect(201);
    expect(await invoiceStatus(a.id)).toBe('PAID');

    // إعادة توزيع: نصفها لـa والباقي لـb
    await auth(request(app.getHttpServer()).post(`/payments/${p1.body.id}/allocate`))
      .send({ allocations: [{ invoiceId: a.id, amount: 600 }, { invoiceId: b.id, amount: 400 }] })
      .expect(201);

    // إلغاء التخصيص كلياً (دفعة على الحساب)
    await auth(request(app.getHttpServer()).post(`/payments/${p1.body.id}/allocate`)).send({ allocations: [] }).expect(201);

    // دفعة أخرى تُخصَّص جزئياً لـb
    await auth(request(app.getHttpServer()).post('/payments'))
      .send({ customerId, branchId, date: today(), amount: 150, method: 'CASH', bankId: cashBoxId, allocations: [{ invoiceId: b.id, amount: 150 }] })
      .expect(201);

    // المقارنة: المخزَّن مقابل المحسوب من التخصيصات لكل فاتورة لمسناها.
    const payments = (await auth(request(app.getHttpServer()).get(`/payments?customerId=${customerId}`)).expect(200)).body as {
      allocations: { invoiceId: string; amount: string }[];
    }[];
    const allocatedByInvoice = new Map<string, number>();
    for (const p of payments) {
      for (const al of p.allocations) allocatedByInvoice.set(al.invoiceId, (allocatedByInvoice.get(al.invoiceId) ?? 0) + Number(al.amount));
    }

    for (const inv of [a, b]) {
      const detail = await invoiceOf(inv.id);
      const allocated = Math.round((allocatedByInvoice.get(inv.id) ?? 0) * 100) / 100;
      const total = Math.round(Number(detail.total) * 100) / 100;
      // «متأخّرة» بيومِ الخادم المعلَن (`dayStartOf` · ق-١١٩٠) لا بمنتصف الليل المحلّي (`new Date(d.toDateString())`):
      // بين `21:00` و`24:00 UTC` على جهازٍ بتوقيت الرياض كان الحسابُ هنا يسبق الخادمَ بيوم، فسقط هذا التوكيدُ في `test:clean`.
      const computed = allocated >= total - 0.005 ? 'PAID' : allocated > 0.005 ? 'PARTIAL' : new Date(detail.dueDate) < dayStartOf(new Date()) ? 'OVERDUE' : 'DUE';
      expect({ invoice: inv.no, status: detail.status }).toEqual({ invoice: inv.no, status: computed });
    }
  }, 120000);
});
