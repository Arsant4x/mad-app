import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (66.3 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(200000);

/**
 * الحزمة ب (`ق-١٢٦١`) — **الدفعةُ المقدَّمة بمستندٍ ضريبيّ (386)** (④A1): فائضُ سند القبض فوق المخصَّص يُعلَن مصيرُه؛
 * والمعلَنُ دفعةً مقدَّمة يُصدر فاتورةَ 386 يومَ القبض (م٥٣(١)(أ)(٢) · م٥٣(٧)(أ)(٢)) مرحَّلةً التزاماً لا إيراداً، ثم تُطبَّق
 * كاملةً على فاتورة التوريد. جوابٌ محسوبٌ يداً في كل مرحلة — **والدفترُ والأعمارُ والإقرارُ تُقرأ معاً**.
 *
 * الأرقام: قبضٌ `1150` ⟵ مستندُ 386 صافيه `1000` وضريبتُه `150` (`1000 × 1.15 = 1150`)؛ فاتورةُ توريدٍ `2000 + 300 = 2300`
 * يُطبَّق عليها ⟵ المتبقّي `1150`، و`2450` يعود صفراً، و`2200` = `150 + 300 − 150 = 300` (ضريبةُ `2000` مرّةً واحدة).
 */
describe('Prepayment invoice — 386 (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let customerId: string;
  let otherCustomerId: string;
  let bankId: string;
  let receiptId: string;
  let prepaymentId: string;
  let prepaymentNo: string;
  let supplyInvoiceId: string;
  const codes: Record<string, string> = {};

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const http = () => request(app.getHttpServer());
  const today = () => new Date().toISOString().slice(0, 10);
  const ledgerClosing = async (accountId: string) => (await auth(http().get(`/reports/ledger?accountId=${accountId}`)).expect(200)).body.closing as string;
  const accountByCode = async (code: string) => {
    if (!codes[code]) {
      const accounts = (await auth(http().get('/accounts')).expect(200)).body as { id: string; code: string }[];
      const hit = accounts.find((a) => a.code === code);
      if (!hit) throw new Error(`account ${code} missing`);
      codes[code] = hit.id;
    }
    return codes[code];
  };
  const invoiceRow = async (id: string) => {
    const rows = (await auth(http().get('/invoices')).expect(200)).body as { id: string; docType: string; status: string; outstanding: string; subtotal: string; taxTotal: string; total: string; no: string }[];
    const row = rows.find((r) => r.id === id);
    if (!row) throw new Error(`invoice ${id} not listed`);
    return row;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    company = await registerIsolatedCompany(app, 'prepay');
    customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: 'عميل الدفعة المقدَّمة' }).expect(201)).body.id;
    otherCustomerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: 'عميلٌ آخر' }).expect(201)).body.id;
    bankId = (await auth(http().post('/banks')).send({ name: 'صندوق الدفعات', openingBalance: 0, openingDate: '2026-01-01' }).expect(201)).body.id;
  }, 90000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 60000);

  it('[SPEC 4.12] ① an unallocated remainder must be declared — undeclared and uncovered on-account are refused by name; PREPAYMENT issues a 386 posted as a liability, settled by its own receipt', async () => {
    const undeclared = await auth(http().post('/payments')).send({ customerId, date: today(), amount: 1150, method: 'CASH', bankId }).expect(400);
    expect(String(undeclared.body.message)).toContain('1150.00');
    // «على الحساب» بلا فواتيرَ مفتوحةٍ تغطّيه = دفعةٌ مقدَّمة مهما سُمّي.
    const uncovered = await auth(http().post('/payments')).send({ customerId, date: today(), amount: 1150, method: 'CASH', bankId, unallocated: 'ON_ACCOUNT' }).expect(400);
    expect(String(uncovered.body.message)).toContain('1150.00');
    expect(String(uncovered.body.message)).toContain('0.00');

    // ق-١٢٦٤/②: فئةُ ما يُدفع مقدَّماً عنه تُعلَن ولا تُفترض — بلا فئةٍ يُرفض باسمه، وبفئةٍ معفاة بلا سببها كذلك.
    const noTax = await auth(http().post('/payments')).send({ customerId, date: today(), amount: 1150, method: 'CASH', bankId, unallocated: 'PREPAYMENT' }).expect(400);
    expect(String(noTax.body.message)).toContain('تُعلَن ولا تُفترض');
    await auth(http().post('/payments')).send({ customerId, date: today(), amount: 1150, method: 'CASH', bankId, unallocated: 'PREPAYMENT', prepaymentTax: { taxCategory: 'E' } }).expect(400);
    const res = await auth(http().post('/payments')).send({ customerId, date: today(), amount: 1150, method: 'CASH', bankId, unallocated: 'PREPAYMENT', prepaymentTax: { taxCategory: 'S' } }).expect(201);
    receiptId = res.body.id;
    expect(res.body.prepaymentInvoice).toMatchObject({ total: '1150.00', onAccountRemainder: '0.00' });
    expect(String(res.body.prepaymentInvoice.no)).toMatch(/^PP-\d{4}-\d{4}$/);
    prepaymentId = res.body.prepaymentInvoice.id;
    prepaymentNo = res.body.prepaymentInvoice.no;
    // السندُ مخصَّصٌ كلُّه على مستنده — لا فائضَ يبقى.
    expect(res.body).toMatchObject({ allocatedTotal: '1150.00', unallocated: '0.00' });

    const row = await invoiceRow(prepaymentId);
    expect(row).toMatchObject({ docType: 'PREPAYMENT', status: 'PAID', outstanding: '0.00' });
    expect([row.subtotal, row.taxTotal, row.total].map(Number)).toEqual([1000, 150, 1150]);

    // الدفتر: النقدُ دخل، والذمّةُ صفر (السندُ أقفلها ومستندُ 386 فتحها بقدره ثم…) — والالتزامُ `2450` والضريبةُ `2200` قائمان.
    expect(await ledgerClosing(await accountByCode('1200'))).toBe('0.00');
    expect(await ledgerClosing(await accountByCode('2450'))).toBe('1000.00');
    expect(await ledgerClosing(await accountByCode('2200'))).toBe('150.00');
    expect(await ledgerClosing(await accountByCode('4100'))).toBe('0.00');
  }, 60000);

  it('[SPEC 4.12] ② applying the 386 to the supply invoice moves the receipt allocation, closes 2450, reverses its VAT, and leaves the remainder outstanding', async () => {
    const res = await auth(http().post('/invoices'))
      .send({ customerId, issueDate: today(), dueDate: today(), lines: [{ description: 'توريد', quantity: 1, unitPrice: 2000, taxRate: 15 }], prepaymentInvoiceIds: [prepaymentId] })
      .expect(201);
    supplyInvoiceId = res.body.id;
    expect(res.body.status).toBe('PARTIAL');
    expect((await invoiceRow(supplyInvoiceId)).outstanding).toBe('1150.00');
    // مستندُ 386 يبقى مسدَّداً بالبناء وإن انتقل تخصيصُه.
    expect(await invoiceRow(prepaymentId)).toMatchObject({ status: 'PAID', outstanding: '0.00' });
    const receipt = (await auth(http().get(`/payments/${receiptId}`)).expect(200)).body as { allocations: { invoiceId: string; amount: string }[]; unallocated: string };
    expect(receipt.allocations.map((a) => [a.invoiceId, Number(a.amount)])).toEqual([[supplyInvoiceId, 1150]]);
    expect(receipt.unallocated).toBe('0.00');

    expect(await ledgerClosing(await accountByCode('4100'))).toBe('2000.00');
    expect(await ledgerClosing(await accountByCode('2450'))).toBe('0.00');
    // ضريبةُ `2000` مرّةً واحدة: `150` عند القبض + `300` عند التوريد − `150` عند التطبيق.
    expect(await ledgerClosing(await accountByCode('2200'))).toBe('300.00');
    expect(await ledgerClosing(await accountByCode('1200'))).toBe('1150.00');

    // والأعمارُ تطابق الدفتر — مستندُ 386 ليس ذمّةً.
    const aging = (await auth(http().get('/reports/receivables-aging?reconcile=true')).expect(200)).body as { totals: { total: string }; reconciliation: { difference: string } };
    expect(Number(aging.totals.total)).toBeCloseTo(1150, 2);
    expect(Number(aging.reconciliation.difference)).toBeCloseTo(0, 2);

    // وملخّصُ العميل: المفوتَرُ التوريدُ وحدَه، والمقبوضُ ما خُصِّص عليه، ولا مقدَّمَ معلَّقاً.
    const summary = (await auth(http().get(`/customers/${customerId}/summary`)).expect(200)).body;
    expect(summary).toMatchObject({ billed: '2300.00', collected: '1150.00', outstanding: '1150.00', prepaid: '0.00' });
  }, 60000);

  it('[SPEC 4.12] ③ the VAT return counts the 386 once: the applied prepayment is subtracted in the quarter of application', async () => {
    const now = new Date();
    const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
    const d = (await auth(http().get('/obligations/vat-declaration')).query({ year: now.getUTCFullYear(), quarter }).expect(200)).body as {
      salesStandard: string;
      salesStandardVat: string;
      prepaymentsApplied: { count: number; net: string; vat: string };
    };
    expect(d.prepaymentsApplied).toEqual({ count: 1, net: '1000.00', vat: '150.00' });
    // `1000` (مستند 386) + `2000` (التوريد) − `1000` (المطبَّق) = `2000`؛ والضريبةُ `150 + 300 − 150 = 300`.
    expect(d.salesStandard).toBe('2000.00');
    expect(d.salesStandardVat).toBe('300.00');
  }, 30000);

  it('[SPEC 4.12] ④ an on-account remainder is accepted only when open invoices cover it — and a tax-rounding gap stays on account, declared', async () => {
    // المفتوح الآن `1150` — فمئةٌ على الحساب مغطّاة.
    const covered = await auth(http().post('/payments')).send({ customerId, date: today(), amount: 100, method: 'CASH', bankId, unallocated: 'ON_ACCOUNT' }).expect(201);
    expect(covered.body).toMatchObject({ allocatedTotal: '0.00', unallocated: '100.00' });
    // لا مستندَ أُصدر — الحقلُ يصل `null` من ضميمة السند (لا غائباً).
    expect(covered.body.prepaymentInvoice).toBeNull();

    // `0.80` لا يبلغه أيُّ صافٍ (`0.69 ⟵ 0.79` · `0.70 ⟵ 0.81`): يُختار `0.79` والهللةُ تبقى على الحساب معلَنةً — لا تخصيصٌ يفوق المقبوض.
    const gap = await auth(http().post('/payments')).send({ customerId, date: today(), amount: 0.8, method: 'CASH', bankId, unallocated: 'PREPAYMENT', prepaymentTax: { taxCategory: 'S' } }).expect(201);
    expect(gap.body.prepaymentInvoice).toMatchObject({ total: '0.79', onAccountRemainder: '0.01' });
    expect(gap.body).toMatchObject({ allocatedTotal: '0.79', unallocated: '0.01' });
    const row = await invoiceRow(gap.body.prepaymentInvoice.id);
    expect([row.subtotal, row.taxTotal, row.total].map(Number)).toEqual([0.69, 0.1, 0.79]);
    // وفائضٌ دون هللات التدوير يمرّ بلا إعلان.
    const tiny = await auth(http().post('/payments')).send({ customerId, date: today(), amount: 100.03, method: 'CASH', bankId, allocations: [{ invoiceId: supplyInvoiceId, amount: 100 }] }).expect(201);
    expect(tiny.body.unallocated).toBe('0.03');
  }, 60000);

  it('[SPEC 4.12] ⑤ guards: a 386 is applied once, to its own customer, never beyond the invoice total; its receipt is neither re-allocated nor reversed; the document itself is immutable', async () => {
    const line = (price: number) => [{ description: 'توريد', quantity: 1, unitPrice: price, taxRate: 15 }];
    const again = await auth(http().post('/invoices')).send({ customerId, issueDate: today(), dueDate: today(), lines: line(2000), prepaymentInvoiceIds: [prepaymentId] }).expect(409);
    expect(String(again.body.message)).toContain(prepaymentNo);

    const fresh = (await auth(http().post('/payments')).send({ customerId, date: today(), amount: 1150, method: 'CASH', bankId, unallocated: 'PREPAYMENT', prepaymentTax: { taxCategory: 'S' } }).expect(201)).body.prepaymentInvoice as { id: string; no: string };
    const other = await auth(http().post('/invoices')).send({ customerId: otherCustomerId, issueDate: today(), dueDate: today(), lines: line(2000), prepaymentInvoiceIds: [fresh.id] }).expect(400);
    expect(String(other.body.message)).toContain(fresh.no);
    const exceeds = await auth(http().post('/invoices')).send({ customerId, issueDate: today(), dueDate: today(), lines: line(200), prepaymentInvoiceIds: [fresh.id] }).expect(400);
    expect(String(exceeds.body.message)).toContain('1150.00');
    expect(String(exceeds.body.message)).toContain('230.00');
    // ولا فاتورةَ كُتبت من رفضٍ: المستندُ ما زال غيرَ مطبَّق — مع مستند ④ (`0.79`) المعلَّق كذلك.
    expect((await auth(http().get(`/customers/${customerId}/summary`)).expect(200)).body.prepaid).toBe('1150.79');
    // وقائمةُ المعلَّق التي تقرؤها شاشةُ الفاتورة: الاثنان بلا المطبَّق — بأرقامها نصّاً وسندِ كلٍّ منها.
    const open = (await auth(http().get(`/invoices/open-prepayments/${customerId}`)).expect(200)).body as { id: string; total: string; receiptNo: string | null }[];
    expect(open.map((d) => [d.id, d.total])).toEqual(expect.arrayContaining([[fresh.id, '1150.00']]));
    expect(open).toHaveLength(2);
    expect(open.some((d) => d.id === prepaymentId)).toBe(false);
    expect(open.every((d) => typeof d.receiptNo === 'string' && d.receiptNo.length > 0)).toBe(true);

    const realloc = await auth(http().post(`/payments/${receiptId}/allocate`)).send({ allocations: [] }).expect(409);
    expect(String(realloc.body.message)).toContain(prepaymentNo);
    const reversal = await auth(http().post(`/payments/${receiptId}/reverse`)).send({ reason: 'اختبار' }).expect(409);
    expect(String(reversal.body.message)).toContain(prepaymentNo);
    await auth(http().patch(`/invoices/${prepaymentId}`)).send({ notes: 'x' }).expect(400);
    await auth(http().post(`/invoices/${prepaymentId}/credit-note`)).send({ issueDate: today(), reason: 'ردّ' }).expect(409);
    await auth(http().delete(`/invoices/${prepaymentId}`)).expect(409);
  }, 60000);

  it('[SPEC 4.12] ⑥ a prepayment takes the category of what it is paid for — residential rent (E · VATEX-SA-30) issues a 386 without VAT, closes without touching 2200, and enters the return as exempt', async () => {
    // إيجارٌ سكنيٌّ معفى (م٣٠): المقبوضُ مقدَّماً كلُّه صافٍ — لا ضريبةَ تُفوتَر ولا سطرَ 2200.
    const tenant = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: 'مستأجر سكني' }).expect(201)).body.id as string;
    const vat2200Before = Number(await ledgerClosing(await accountByCode('2200')));
    const deferredBefore = Number(await ledgerClosing(await accountByCode('2450')));
    const res = await auth(http().post('/payments'))
      .send({ customerId: tenant, date: today(), amount: 1000, method: 'CASH', bankId, unallocated: 'PREPAYMENT', prepaymentTax: { taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-30' } })
      .expect(201);
    expect(res.body.prepaymentInvoice).toMatchObject({ total: '1000.00', onAccountRemainder: '0.00' });
    const pp = await invoiceRow(res.body.prepaymentInvoice.id);
    expect([pp.subtotal, pp.taxTotal, pp.total].map(Number)).toEqual([1000, 0, 1000]);
    expect(Number(await ledgerClosing(await accountByCode('2200')))).toBe(vat2200Before);
    expect(Number(await ledgerClosing(await accountByCode('2450')))).toBe(deferredBefore + 1000);

    // ثم التوريدُ المعفى (شهرٌ سكنيّ 2000) يطبّق الدفعةَ: قيدُ الإقفال بلا سطر ضريبة، والمتبقّي 1000.
    const supply = await auth(http().post('/invoices'))
      .send({ customerId: tenant, issueDate: today(), dueDate: today(), lines: [{ description: 'إيجار سكني — شهر', quantity: 1, unitPrice: 2000, taxRate: 0, taxCategory: 'E', taxExemptionReasonCode: 'VATEX-SA-30' }], prepaymentInvoiceIds: [res.body.prepaymentInvoice.id] })
      .expect(201);
    expect(supply.body.status).toBe('PARTIAL');
    expect((await invoiceRow(supply.body.id)).outstanding).toBe('1000.00');
    expect(Number(await ledgerClosing(await accountByCode('2450')))).toBe(deferredBefore);
    expect(Number(await ledgerClosing(await accountByCode('2200')))).toBe(vat2200Before);

    // والإقرار: المعفى 1000 (المستند) + 2000 (التوريد) − 1000 (المطبَّق) = 2000 — ولا شيء في الخاضع من هذا المسار.
    const now = new Date();
    const quarter = Math.floor(now.getUTCMonth() / 3) + 1;
    const d = (await auth(http().get('/obligations/vat-declaration')).query({ year: now.getUTCFullYear(), quarter }).expect(200)).body as { salesExempt: string; prepaymentsApplied: { count: number } };
    expect(Number(d.salesExempt)).toBe(2000);
    expect(d.prepaymentsApplied.count).toBe(2);
  }, 60000);
});
