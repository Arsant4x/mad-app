import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

/**
 * الحزمة ب (`ق-١٢٦١`) — **الخصمُ على السطر** (④B1): مبلغٌ على سطر البيع يدخل الوعاءَ والضريبةَ بدالّة المجاميع الواحدة
 * (BT-131 = الكمية × السعر − BT-136)؛ فالدفترُ والمستندُ والعرضُ والكاشيرُ والإشعارُ كلُّها من صافٍ واحد. جوابٌ محسوبٌ
 * يداً: `2 × 100 − 20 = 180` و`1 × 50` ⟵ صافٍ `230`، ضريبةٌ `34.50`، إجماليٌّ `264.50`.
 */
describe('Line discount (e2e)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  let customerId: string;
  let invoiceId: string;
  const codes: Record<string, string> = {};

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const http = () => request(app.getHttpServer());
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
  const lines = () => [
    { description: 'خدمة أ', quantity: 2, unitPrice: 100, discount: 20, taxRate: 15 },
    { description: 'خدمة ب', quantity: 1, unitPrice: 50, taxRate: 15 },
  ];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    company = await registerIsolatedCompany(app, 'linedisc');
    customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: 'عميل الخصم' }).expect(201)).body.id;
  }, 90000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 60000);

  it('[SPEC 4.11] ① the invoice nets the discount on the line — totals, ledger (4100 · 2200 · 1200) and the stored line agree', async () => {
    const res = await auth(http().post('/invoices')).send({ customerId, issueDate: '2026-06-01', dueDate: '2026-06-30', lines: lines() }).expect(201);
    invoiceId = res.body.id;
    // مجاميعُ الفاتورة تصل كما يكتبها Prisma (نصُّ Decimal بلا تثبيت خانات) — تُقارَن رقماً.
    expect([res.body.subtotal, res.body.taxTotal, res.body.total].map(Number)).toEqual([230, 34.5, 264.5]);
    expect(res.body.lines.map((l: { discount: string }) => Number(l.discount))).toEqual([20, 0]);
    expect(await ledgerClosing(await accountByCode('4100'))).toBe('230.00');
    expect(await ledgerClosing(await accountByCode('2200'))).toBe('34.50');
    expect(await ledgerClosing(await accountByCode('1200'))).toBe('264.50');
  }, 30000);

  it('[SPEC 4.11] ② a discount above the line gross is refused by name — no negative net reaches the books', async () => {
    const refused = await auth(http().post('/invoices'))
      .send({ customerId, issueDate: '2026-06-02', dueDate: '2026-06-30', lines: [{ description: 'خدمة', quantity: 1, unitPrice: 10, discount: 10.01, taxRate: 15 }] })
      .expect(400);
    expect(String(refused.body.message)).toContain('10.01');
    expect(String(refused.body.message)).toContain('10.00');
    // وخصمٌ يساوي الإجماليَّ صافيُه صفر — مقبول.
    const zero = await auth(http().post('/invoices'))
      .send({ customerId, issueDate: '2026-06-02', dueDate: '2026-06-30', lines: [{ description: 'مجاناً', quantity: 1, unitPrice: 10, discount: 10, taxRate: 15 }] })
      .expect(201);
    expect(Number(zero.body.total)).toBe(0);
  }, 30000);

  it('[SPEC 4.11] ③ a quote carries the discount into the converted invoice, and a full credit note mirrors the net — not the gross', async () => {
    // العرضُ ساري الصلاحية بتاريخ اليوم (التحويلُ يرفض المنتهي بـ409) — والردُّ `{ invoice, quote }`.
    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    const quote = await auth(http().post('/quotes')).send({ customerId, issueDate: day(0), validUntil: day(14), lines: lines() }).expect(201);
    expect(Number(quote.body.total)).toBe(264.5);
    const converted = await auth(http().post(`/quotes/${quote.body.id}/convert`)).expect(201);
    expect(Number(converted.body.invoice.total)).toBe(264.5);
    expect(converted.body.invoice.lines.map((l: { discount: string }) => Number(l.discount))).toEqual([20, 0]);

    const note = await auth(http().post(`/invoices/${invoiceId}/credit-note`)).send({ reason: 'تصحيح' }).expect(201);
    expect(Number(note.body.total)).toBe(264.5);
    expect(note.body.lines.map((l: { discount: string }) => Number(l.discount))).toEqual([20, 0]);
    // الإيرادُ يعود إلى ما قبل فاتورة ① — الصافي لا الإجمالي: 230 (①) + 230 (③ المحوَّلة) − 230 (الإشعار) = 230.
    expect(await ledgerClosing(await accountByCode('4100'))).toBe('230.00');
  }, 30000);

  it('[SPEC 4.11] ④ the register applies a line discount through the same path', async () => {
    const productId = (await auth(http().post('/products')).send({ name: 'صنف الكاشير', unitCode: 'H87', expiryTracked: false, taxCategory: 'S', price: 100 }).expect(201)).body.id;
    await auth(http().post('/pos/shifts')).send({ openingFloat: 0 }).expect(201);
    const sale = await auth(http().post('/pos/sales')).send({ lines: [{ productId, quantity: 2, discount: 20 }], paymentMethod: 'CASH' }).expect(201);
    expect([sale.body.subtotal, sale.body.taxTotal, sale.body.total].map(Number)).toEqual([180, 27, 207]);
    await auth(http().post('/pos/sales')).send({ lines: [{ productId, quantity: 1, discount: 100.5 }], paymentMethod: 'CASH' }).expect(400);
  }, 60000);
});
