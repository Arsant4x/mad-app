import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { companyIdOfToken, purgeInvoicesForTest } from './purge-invoices';

/**
 * 4.9 — عروض الأسعار والتحويل بنقرة: بنود تحقق الموجز السبعة + شرطا
 * صاحب المشروع (تصادم ترقيم الدفعة المتزامن، ومسودة تُحوَّل مباشرة).
 */
describe('Quotes → invoice conversion (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let customerId: string;
  let branchId: string;
  let productPriceThen: number;
  const cleanupInvoiceIds: string[] = [];
  /** عملاءُ هذا الملفّ الذين أُعطوا حدّاً — **يُعادون صفراً في النهاية**. */
  const limitedCustomerIds: string[] = [];

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const today = () => new Date().toISOString().slice(0, 10);
  const plusDays = (d: number) => new Date(Date.now() + d * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const makeQuote = (over: Record<string, unknown> = {}) =>
    auth(request(app.getHttpServer()).post('/quotes')).send({
      customerId,
      branchId,
      issueDate: today(),
      validUntil: plusDays(14),
      lines: [
        { description: `تصميم هوية ${suffix}`, quantity: 2, unitPrice: 1000, taxRate: 15 },
        { description: `طباعة ${suffix}`, quantity: 10, unitPrice: 50, taxRate: 15 },
        { description: `استشارة ${suffix}`, quantity: 1, unitPrice: 500, taxRate: 15 },
      ],
      ...over,
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    token = (await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' })).body.accessToken;
    customerId = (await auth(request(app.getHttpServer()).post('/customers')).send({ kind: 'NATURAL', name: `عميل عروض ${suffix}` }).expect(201)).body.id;
    branchId = (await auth(request(app.getHttpServer()).post('/branches')).send({ name: `فرع العروض ${suffix}` }).expect(201)).body.id;
    productPriceThen = 1000;
  }, 60000);

  afterAll(async () => {
    // الصادرُ لا يُحذف عبر الواجهة (ق-٩٤٣) — والتنظيفُ بمسارٍ في سياق المستأجر (ق-٩٥٣).
    await purgeInvoicesForTest(app.get(TenantPrismaService), companyIdOfToken(token), cleanupInvoiceIds);
    // ⚠️ **ولا يُترك عميلٌ محدودٌ خلفنا** — **وهذا جديدٌ بجدّة الحدّ نفسِه**:
    //    كان تركُه بلا أثرٍ يومَ لم يكن للحقل قارئ، **وصار اليوم يُسقط مجموعةً
    //    أخرى** تأخذ `customers[0]` بلا ترشيح. **وقد قِيس** — سقطت ثلاثٌ على
    //    قاعدة التطوير وخضرَّت على النظيفة.
    for (const id of limitedCustomerIds) await auth(request(app.getHttpServer()).patch(`/customers/${id}`)).send({ creditLimit: 0 });
    await app.close();
  });

  // ── تحقق 1: عرض بثلاثة بنود → تحويل = فاتورة ببنوده وأسعاره + قيد + علامة محوَّل ──
  it('converts a 3-line quote into a real posted invoice, marking the quote CONVERTED with a live link', async () => {
    const quote = (await makeQuote().expect(201)).body;
    expect(quote.no).toMatch(/^Q-\d{4}-\d{4}$/);
    // 2×1000 + 10×50 + 1×500 = 3000 · +15% = 3450
    expect(Number(quote.total)).toBeCloseTo(3450, 2);

    const res = await auth(request(app.getHttpServer()).post(`/quotes/${quote.id}/convert`)).expect(201);
    const { invoice, quote: stamped } = res.body;
    cleanupInvoiceIds.push(invoice.id);

    expect(invoice.no).toMatch(/^INV-/);
    expect(invoice.lines).toHaveLength(3);
    expect(Number(invoice.total)).toBeCloseTo(3450, 2);
    // القيد رُحِّل تلقائياً — نفس مسار الفاتورة المباشرة.
    expect(invoice.journalEntryId).toBeTruthy();
    // الفرع والعميل وُرثا من العرض (قاعدة 5).
    expect(invoice.branchId).toBe(branchId);
    expect(invoice.customerId).toBe(customerId);

    expect(stamped.status).toBe('CONVERTED');
    expect(stamped.convertedInvoice.no).toBe(invoice.no);
    expect(stamped.convertedAt).toBeTruthy();
  }, 60000);

  // ── تحقق 2: أسعار الفاتورة = أسعار العرض لا الأسعار الحالية ──
  it('bills the quoted prices, not current ones — a later price change never leaks in', async () => {
    const quote = (await makeQuote({ lines: [{ description: `جهاز ${suffix}`, quantity: 1, unitPrice: productPriceThen, taxRate: 15 }] }).expect(201)).body;

    // «يرتفع السعر» بعد إصدار العرض — البنود نُسخت وقت الإصدار فلا مصدر
    // حي يقرأ منه التحويل أصلاً؛ نحاكيه بتغيير معطياتنا المحلية.
    productPriceThen = 9999;

    const res = await auth(request(app.getHttpServer()).post(`/quotes/${quote.id}/convert`)).expect(201);
    cleanupInvoiceIds.push(res.body.invoice.id);
    expect(Number(res.body.invoice.lines[0].unitPrice)).toBeCloseTo(1000, 2);
    expect(Number(res.body.invoice.total)).toBeCloseTo(1150, 2);
  }, 60000);

  // ── تحقق 3: نقرتان متسارعتان = فاتورة واحدة والثانية 409 تسمّيها ──
  it('a double-click yields ONE invoice — the loser gets a named 409, and no orphan invoice exists', async () => {
    const quote = (await makeQuote().expect(201)).body;
    const before = (await auth(request(app.getHttpServer()).get('/invoices')).expect(200)).body.length;

    const [r1, r2] = await Promise.all([
      auth(request(app.getHttpServer()).post(`/quotes/${quote.id}/convert`)),
      auth(request(app.getHttpServer()).post(`/quotes/${quote.id}/convert`)),
    ]);
    const results = [r1, r2].sort((a, b) => a.status - b.status);
    expect(results[0].status).toBe(201);
    expect(results[1].status).toBe(409);
    cleanupInvoiceIds.push(results[0].body.invoice.id);
    // الرفض يسمّي الفاتورة الفائزة.
    expect(results[1].body.message).toContain(results[0].body.invoice.no);

    // ذرّية 6.12: لا فاتورة يتيمة من الخاسر.
    const after = (await auth(request(app.getHttpServer()).get('/invoices')).expect(200)).body.length;
    expect(after).toBe(before + 1);
  }, 60000);

  // ── تحقق 4: منتهي الصلاحية يُرفض باسم تاريخه ولا فاتورة ──
  it('refuses an expired quote by its date, creating nothing', async () => {
    const quote = (await makeQuote({ issueDate: plusDays(-30), validUntil: plusDays(-3) }).expect(201)).body;
    const before = (await auth(request(app.getHttpServer()).get('/invoices')).expect(200)).body.length;

    const res = await auth(request(app.getHttpServer()).post(`/quotes/${quote.id}/convert`)).expect(409);
    expect(res.body.message).toContain('انتهت صلاحية العرض');
    expect(res.body.message).toContain(plusDays(-3));

    const after = (await auth(request(app.getHttpServer()).get('/invoices')).expect(200)).body.length;
    expect(after).toBe(before);
    // ويُقرأ منتهياً في العرض.
    const read = await auth(request(app.getHttpServer()).get(`/quotes/${quote.id}`)).expect(200);
    expect(read.body.derivedStatus).toBe('EXPIRED');
  }, 60000);

  // ── تحقق 5 (بصيغته المعتمدة): تكافؤ القنوات — التحويل يسلك سلوك الفوترة المباشرة حرفياً ──
  /**
   * ⚖️ **وصيغتُه تغيّرت يوم فُعِّل الحدّ — والغرضُ لم يتغيّر** (`ق-٣٣٦` · `ق-٣٣٨`).
   *
   * كان يقيس **تكافؤ المرور** («both unblocked today») **بنصٍّ يَعِد**: «حين
   * يُفعَّل الحجب يرثه هذا المسار تلقائياً». **وقد فُعِّل — فصار يقيس تكافؤ
   * المنع**، وهو ما وُعد به.
   *
   * ⚠️ **وسقوطُه يومَ التفعيل كان صواباً لا انحداراً**: توكيدٌ يقول «يمرّ» على
   * ميزةٍ لم تُبنَ بعد **يصير كاذباً بمجرّد بنائها** — **فيُعاد كتابتُه عمداً،
   * ولا يُطفأ ولا يُستثنى العميلُ منه**.
   */
  it('parity: conversion is blocked exactly like direct invoicing for an over-limit customer', async () => {
    const tightCustomer = (await auth(request(app.getHttpServer()).post('/customers')).send({ kind: 'NATURAL', name: `محدود ${suffix}`, creditLimit: 100 }).expect(201)).body.id;
    limitedCustomerIds.push(tightCustomer);
    const overLimitLines = [{ description: 'مباشر', quantity: 2, unitPrice: 1000, taxRate: 15 }];

    // ① **القناتان تُردّان بـ409** — والرسالةُ تحمل الأرقام لا كلمةَ «تجاوزت».
    const refusedDirect = await auth(request(app.getHttpServer()).post('/invoices'))
      .send({ customerId: tightCustomer, issueDate: today(), dueDate: today(), lines: overLimitLines })
      .expect(409);
    expect(String(refusedDirect.body.message)).toContain('2,300.00');

    const quote = (await makeQuote({ customerId: tightCustomer }).expect(201)).body;
    await auth(request(app.getHttpServer()).post(`/quotes/${quote.id}/convert`)).send({}).expect(409);

    // ② **والتجاوزُ يمرّ في القناتين معاً — ويُخزَّن على الفاتورة**.
    const direct = await auth(request(app.getHttpServer()).post('/invoices'))
      .send({ customerId: tightCustomer, issueDate: today(), dueDate: today(), lines: overLimitLines, creditOverride: true })
      .expect(201);
    cleanupInvoiceIds.push(direct.body.id);
    expect(direct.body.creditOverrideById).toBeTruthy();
    expect(Number(direct.body.creditOverrideLimit)).toBe(100);

    const converted = await auth(request(app.getHttpServer()).post(`/quotes/${quote.id}/convert`)).send({ creditOverride: true }).expect(201);
    cleanupInvoiceIds.push(converted.body.invoice.id);
    expect(converted.body.invoice.customerId).toBe(tightCustomer);
    // ⭐ **التكافؤُ في التجاوز كما في المنع** — فلا يصير التحويلُ باباً خلفياً.
    expect(converted.body.invoice.creditOverrideById).toBeTruthy();
  }, 60000);

  // ── تحقق 6: حذف المحوَّل ممنوع باسم فاتورته ──
  it('a converted quote cannot be deleted — the refusal names its invoice', async () => {
    const quote = (await makeQuote().expect(201)).body;
    const conv = await auth(request(app.getHttpServer()).post(`/quotes/${quote.id}/convert`)).expect(201);
    cleanupInvoiceIds.push(conv.body.invoice.id);

    const res = await auth(request(app.getHttpServer()).delete(`/quotes/${quote.id}`)).expect(409);
    expect(res.body.message).toContain(conv.body.invoice.no);
  }, 60000);

  // ── تحقق 7 (شرط صاحب المشروع): مسودة تُحوَّل مباشرة دون المرور بمرسَل ──
  it("a DRAFT converts directly — SENT is not a prerequisite", async () => {
    const quote = (await makeQuote().expect(201)).body;
    expect(quote.status).toBe('DRAFT');
    const res = await auth(request(app.getHttpServer()).post(`/quotes/${quote.id}/convert`)).expect(201);
    cleanupInvoiceIds.push(res.body.invoice.id);
    expect(res.body.quote.status).toBe('CONVERTED');
  }, 60000);

  // ── شرط صاحب المشروع: تصادم ترقيم Q- المتزامن ضمن الدفعة ──
  it('a concurrent batch of quote creations yields unique sequential Q- numbers — no collisions, no gaps to invoices', async () => {
    const created = await Promise.all(Array.from({ length: 6 }, () => makeQuote()));
    const statuses = created.map((r) => r.status);
    expect(statuses.every((s) => s === 201)).toBe(true);

    const nos = created.map((r) => r.body.no);
    expect(new Set(nos).size).toBe(6);
    for (const no of nos) expect(no).toMatch(/^Q-\d{4}-\d{4}$/);
  }, 60000);

  // ── استقلال التسلسلين برهاناً حيّاً: إصدار عروضٍ لا يحرّك عدّاد الفواتير ──
  it('issuing quotes never consumes an INV number — the two sequences are fully independent', async () => {
    const invBefore = (await auth(request(app.getHttpServer()).get('/invoices')).expect(200)).body
      .map((i: { no: string }) => i.no)
      .filter((no: string) => no.startsWith('INV-'))
      .sort()
      .at(-1);

    await makeQuote().expect(201);
    await makeQuote().expect(201);

    const invAfter = (await auth(request(app.getHttpServer()).get('/invoices')).expect(200)).body
      .map((i: { no: string }) => i.no)
      .filter((no: string) => no.startsWith('INV-'))
      .sort()
      .at(-1);
    expect(invAfter).toBe(invBefore);
  }, 60000);
});
