import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { purgeInvoicesForTest } from './purge-invoices';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (23.5 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(75000);

/**
 * ⚖️ **الفاتورةُ الصادرة لا تُعدَّل ولا تُحذف — مختومةً كانت أو لا** (`ق-٩٤٣`)، **والإشعارُ
 * الخاطئ يُصحَّح بإشعارٍ مقابل** (`ق-٩٥٢`) — حارسٌ حيّ على المسار الحقيقيّ:
 *
 *   ① صادرةٌ خدميةٌ غيرُ مختومة: تعديلُ محتواها يُرفض **بالرسالة قبل أي كتابة** — الصفُّ وقيدُه كما هما.
 *   ② صادرةٌ مخزنيةٌ غيرُ مختومة: تعديلُها وحذفُها يُرفضان **بالرسالة لا بخطأ قاعدة** — مسارُ المفتاح
 *      الأجنبيّ (بندُ ① من المراجعة الخارجية) لا يُبلَغ.
 *   ③ الملاحظاتُ وحالةُ السداد تمرّ — لا تدخلان المستندَ الموقَّع.
 *   ④ مدينٌ يصحّح دائناً زائداً — ولا يتجاوز ما بقي منه؛ ودائنٌ يصحّح مديناً؛ ولا إشعارَ على إشعارٍ من نوعه.
 *   ⑤ الإشعارُ لا يُعدَّل ولا يُحذف — ورسالتُه تسمّي الإشعارَ المقابل لا الحذف.
 *
 * والتنظيفُ بمسارٍ في سياق المستأجر (`ق-٩٥٣`) — لا استثناءَ للاختبار من الحارس.
 */
describe('الفاتورةُ الصادرة لا تُعدَّل ولا تُحذف — والإشعارُ يُصحَّح بإشعارٍ مقابل (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let token: string;
  let companyId: string;
  let customerId: string;
  let otherCustomerId: string;
  let branchId: string;
  let warehouseId: string;
  let productId: string;
  const created: string[] = [];
  const today = () => new Date().toISOString().slice(0, 10);
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  const SERVICE_LINE = { description: 'خدمةُ صيانة', quantity: 1, unitPrice: 100, taxRate: 15 };

  async function makeInvoice(lines: Record<string, unknown>[] = [SERVICE_LINE]) {
    const res = await auth(request(app.getHttpServer()).post('/invoices'))
      .send({ customerId, branchId, issueDate: today(), dueDate: today(), lines })
      .expect(201);
    created.push(res.body.id);
    return res.body as { id: string; no: string; total: string; journalEntryId: string; lines: { id: string }[] };
  }

  function snapshot(id: string) {
    return tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const inv = await tx.invoice.findUniqueOrThrow({ where: { id }, include: { lines: { orderBy: { createdAt: 'asc' } } } });
      const moves = await tx.stockMovement.count({ where: { invoiceLineId: { in: inv.lines.map((l) => l.id) } } });
      return {
        no: inv.no,
        total: inv.total.toString(),
        customerId: inv.customerId,
        journalEntryId: inv.journalEntryId,
        lines: inv.lines.map((l) => ({ id: l.id, qty: l.quantity.toString(), price: l.unitPrice.toString() })),
        moves,
      };
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);

    const login = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    token = login.body.accessToken;
    companyId = login.body.user.companyId;

    const suffix = Date.now();
    customerId = (await auth(request(app.getHttpServer()).post('/customers')).send({ kind: 'NATURAL', name: `عميل الصادرة ${suffix}` }).expect(201)).body.id;
    otherCustomerId = (await auth(request(app.getHttpServer()).post('/customers')).send({ kind: 'NATURAL', name: `عميل الصادرة ب ${suffix}` }).expect(201)).body.id;
    warehouseId = (await auth(request(app.getHttpServer()).post('/warehouses')).send({ name: `مستودع الصادرة ${suffix}` }).expect(201)).body.id;
    branchId = (await auth(request(app.getHttpServer()).post('/branches')).send({ name: `فرع الصادرة ${suffix}`, warehouseId }).expect(201)).body.id;
    productId = (await auth(request(app.getHttpServer()).post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف الصادرة ${suffix}`, price: 100, cost: 40 }).expect(201)).body.id;
    const supplierId = (await auth(request(app.getHttpServer()).post('/suppliers')).send({ name: `مورّد الصادرة ${suffix}` }).expect(201)).body.id;
    // طبقةٌ حقيقية بعشر وحدات — فالفاتورةُ المخزنية تحرّك المخزونَ فعلاً (`م٥`).
    await auth(request(app.getHttpServer()).post('/purchases'))
      .send({ supplierId, date: today(), subtotal: 400, warehouseId, branchId, lines: [{ description: 'صنفٌ مخزني', productId, quantity: 10, unitPrice: 40, taxRate: 15 }] })
      .expect(201);
  }, 60000);

  afterAll(async () => {
    await purgeInvoicesForTest(tenantPrisma, companyId, created);
    await app.close();
  });

  it('① صادرةٌ خدميةٌ غيرُ مختومة: تعديلُ محتواها يُرفض بالرسالة — والصفُّ وقيدُه كما هما', async () => {
    const inv = await makeInvoice();
    const before = await snapshot(inv.id);

    for (const body of [
      { lines: [{ ...SERVICE_LINE, unitPrice: 200 }] },
      { customerId: otherCustomerId },
      { issueDate: '2026-01-15' },
      { dueDate: '2026-12-31' },
      { currency: 'USD', exchangeRate: 3.75 },
    ]) {
      const res = await auth(request(app.getHttpServer()).patch(`/invoices/${inv.id}`)).send(body).expect(409);
      // ⭐ الرسالةُ تسمّي الفعلَ الممنوعَ والمخرجَ بنوعَيه (`ق-٢٦٥` · `ق-٩٥٠`).
      expect(res.body.message).toContain('صدرت');
      expect(res.body.message).toContain('إشعار دائن');
      expect(res.body.message).toContain('إشعار مدين');
    }
    expect(await snapshot(inv.id)).toEqual(before);
  }, 30000);

  it('② صادرةٌ مخزنيةٌ غيرُ مختومة: التعديلُ والحذفُ يُرفضان بالرسالة لا بخطأ قاعدة — والحركةُ كما هي', async () => {
    const inv = await makeInvoice([{ description: 'صنفٌ مخزني', productId, quantity: 3, unitPrice: 100, taxRate: 15 }]);
    const before = await snapshot(inv.id);
    expect(before.moves).toBe(1);

    const edit = await auth(request(app.getHttpServer()).patch(`/invoices/${inv.id}`))
      .send({ lines: [{ description: 'صنفٌ مخزني', productId, quantity: 2, unitPrice: 100, taxRate: 15 }] })
      .expect(409);
    expect(edit.body.message).toContain('إشعار دائن');

    const del = await auth(request(app.getHttpServer()).delete(`/invoices/${inv.id}`)).expect(409);
    expect(del.body.message).toContain('إشعار دائن');

    expect(await snapshot(inv.id)).toEqual(before);
  }, 30000);

  it('③ الملاحظاتُ تمرّ وحالةُ السداد تتحرّك بالقبض — ولا يدخل أيٌّ منهما المستندَ الموقَّع', async () => {
    const inv = await makeInvoice();
    const before = await snapshot(inv.id);
    const notes = await auth(request(app.getHttpServer()).patch(`/invoices/${inv.id}`)).send({ notes: 'ملاحظةٌ بعد الإصدار' }).expect(200);
    expect(notes.body.notes).toBe('ملاحظةٌ بعد الإصدار');
    // الحالةُ ليست حقلَ تعديل (`ق-١١٩٨`/②) — تُشتقّ من التخصيصات، فالقبضُ هو ما يحرّكها.
    await auth(request(app.getHttpServer()).patch(`/invoices/${inv.id}`)).send({ status: 'PAID' }).expect(400);
    await auth(request(app.getHttpServer()).post('/payments'))
      .send({ customerId, date: today(), amount: Number(inv.total), method: 'CASH', allocations: [{ invoiceId: inv.id, amount: Number(inv.total) }] })
      .expect(201);
    const rows = (await auth(request(app.getHttpServer()).get('/invoices')).expect(200)).body as { id: string; status: string }[];
    expect(rows.find((r) => r.id === inv.id)!.status).toBe('PAID');
    expect(await snapshot(inv.id)).toEqual(before);
  });

  it('④ مدينٌ يصحّح دائناً زائداً ولا يتجاوز ما بقي منه؛ ودائنٌ يصحّح مديناً؛ ولا إشعارَ على إشعارٍ من نوعه', async () => {
    const inv = await makeInvoice([{ ...SERVICE_LINE, unitPrice: 1000 }]); // 1150
    // دائنٌ كاملٌ أُصدر خطأً بألفٍ وقد كان الصوابُ ثمانمئة: يُصحَّح بمدينٍ على الدائن بمئتين.
    const credit = await auth(request(app.getHttpServer()).post(`/invoices/${inv.id}/credit-note`)).send({ reason: 'إلغاءٌ بالخطأ', issueDate: today() }).expect(201);
    created.push(credit.body.id);
    expect(credit.body.docType).toBe('CREDIT_NOTE');

    const fix = await auth(request(app.getHttpServer()).post(`/invoices/${credit.body.id}/debit-note`))
      .send({ reason: 'تصحيحُ إشعارٍ دائن زائد', issueDate: today(), lines: [{ description: 'ما زاد في الإشعار الدائن', quantity: 1, unitPrice: 200, taxRate: 15 }] })
      .expect(201);
    created.push(fix.body.id);
    expect(fix.body.docType).toBe('DEBIT_NOTE');
    expect(fix.body.relatedInvoice.id).toBe(credit.body.id);
    expect(Number(fix.body.total)).toBeCloseTo(230, 2);

    // ⛔ لا يتجاوز ما بقي من الدائن: 1150 − 230 = 920 — فألفٌ صافية (1150) تُرفض.
    const over = await auth(request(app.getHttpServer()).post(`/invoices/${credit.body.id}/debit-note`))
      .send({ reason: 'تجاوز', issueDate: today(), lines: [{ description: 'زيادة', quantity: 1, unitPrice: 1000, taxRate: 15 }] })
      .expect(400);
    // الرسالةُ معرَّبةٌ هنا (`HttpExceptionFilter`) — فتُطابَق بنصّها لا بمفتاحها.
    expect(over.body.message).toContain('تتجاوز المتبقي من المستند الذي يصحّحه');

    // دائنٌ يصحّح مديناً: مدينٌ على الفاتورة بخمسمئة، ثم دائنٌ عليه بكامله.
    const debit = await auth(request(app.getHttpServer()).post(`/invoices/${inv.id}/debit-note`))
      .send({ reason: 'شحنٌ غيرُ مفوتر', issueDate: today(), lines: [{ description: 'شحن', quantity: 1, unitPrice: 500, taxRate: 15 }] })
      .expect(201);
    created.push(debit.body.id);
    const undo = await auth(request(app.getHttpServer()).post(`/invoices/${debit.body.id}/credit-note`)).send({ reason: 'الشحنُ لم يقع', issueDate: today() }).expect(201);
    created.push(undo.body.id);
    expect(undo.body.docType).toBe('CREDIT_NOTE');
    expect(undo.body.relatedInvoice.id).toBe(debit.body.id);
    expect(Number(undo.body.total)).toBeCloseTo(575, 2);
    // والمدينُ المصحَّح لم يعد مستحقّاً.
    // ② الحقلان نصٌّ بخانتين (`ق-١٢٣٥`) — يُقارَنان حرفاً.
    const list = (await auth(request(app.getHttpServer()).get('/invoices')).expect(200)).body as { id: string; outstanding: string; creditedTotal: string }[];
    const debitRow = list.find((r) => r.id === debit.body.id)!;
    expect(debitRow.outstanding).toBe('0.00');
    expect(debitRow.creditedTotal).toBe('575.00');

    // ⛔ لا من نوعه: دائنٌ على دائن، ومدينٌ على مدين.
    const cc = await auth(request(app.getHttpServer()).post(`/invoices/${credit.body.id}/credit-note`)).send({ reason: 'دائنٌ على دائن' }).expect(400);
    expect(cc.body.message).toContain('لا على إشعار من نوعه');
    const dd = await auth(request(app.getHttpServer()).post(`/invoices/${debit.body.id}/debit-note`))
      .send({ reason: 'مدينٌ على مدين', lines: [{ description: 'x', quantity: 1, unitPrice: 1, taxRate: 15 }] })
      .expect(400);
    expect(dd.body.message).toContain('لا على إشعار من نوعه');
  }, 60000);

  it('⑤ الإشعارُ لا يُعدَّل ولا يُحذف — ورسالتُه تسمّي الإشعارَ المقابل لا الحذف', async () => {
    const inv = await makeInvoice();
    const credit = await auth(request(app.getHttpServer()).post(`/invoices/${inv.id}/credit-note`)).send({ reason: 'إلغاء' }).expect(201);
    created.push(credit.body.id);

    const edit = await auth(request(app.getHttpServer()).patch(`/invoices/${credit.body.id}`)).send({ notes: 'تعديلُ إشعار' }).expect(400);
    expect(edit.body.message).toContain('إشعار مقابل');
    const del = await auth(request(app.getHttpServer()).delete(`/invoices/${credit.body.id}`)).expect(409);
    expect(del.body.message).toContain('إشعار مقابل');
    expect(del.body.message).not.toContain('احذفه');
    // والفاتورةُ التي عليها إشعار — كذلك.
    const delInv = await auth(request(app.getHttpServer()).delete(`/invoices/${inv.id}`)).expect(409);
    expect(delInv.body.message).toContain('صدرت');
  }, 30000);
});
