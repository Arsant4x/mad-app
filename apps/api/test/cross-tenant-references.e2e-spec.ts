import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { DEFAULT_LANGUAGE, MSG, resolveMessage } from '../src/common/i18n/messages';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة: منشأتان وتهيئتُهما وسبعُ محاولاتٍ بتوأمها المشروع — ثلاثةُ أضعاف ما يلزم عادةً.
jest.setTimeout(300000);

/**
 * `ق-١٤٦٥` — **الدعوى «أ»: معرّفُ عميلٍ أو صنفٍ من منشأةٍ أخرى يُحقن في مستند** (التوجيه ٢٦٦ §٤أ).
 *
 * «متوقَّعٌ أن تسقط بالمفتاح المركّب؛ فأثبته» — **بمحاولةٍ لا بقراءة**: منشأةُ «أ» تكتب بتوكنها مستنداً يحمل
 * معرّفَ عميلٍ أو صنفٍ أو مورّدٍ من «ب»، ثم يُعدّ ما بقي في «أ» يحمل ذلك المعرّف. **وكلُّ محاولةٍ يسبقها
 * توأمُها المشروع** بمعرّف «أ» ويُوكَّد `201` — فيثبت أن المسار بلغ موضعَ الكتابة، وأن الفرق المعرّفُ وحده
 * (`CLAUDE.md` 2026-08-13: التوكيدُ الواسع وحده يمرّ على `500` من سببٍ آخر).
 *
 * **والمسبارُ مُصادَقٌ قبل أيّ صفر**: العدُّ نفسُه بمعرّف «أ» بعد التوأم المشروع `≥ 1` (يجب أن يجد)،
 * وهو داخل سياق «أ» (`runInTenantContext`) فلا يعمى تحت `FORCE`.
 *
 * **وشكلُ الرفض يُوكَّد حيث سُدَّت البقيّة**: الشراءُ (④ ⑤) كان يخرج `500` من المفتاح المركّب بعد الترقيم، **فصار
 * يُردّ مسمّىً قبله** (`assertPurchaseReferences`) — ويُوكَّد رمزُه ورسالتُه. والباقي يُطبع رمزُه في كلِّ تشغيل.
 */
describe('الحقنُ العابر للمنشآت يُرفض — ولا يبقى في «أ» صفٌّ بمعرّف «ب» (ق-١٤٦٥)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let a: IsolatedCompany;
  let b: IsolatedCompany;
  const suffix = `${Date.now()}`;
  const today = new Date().toISOString().slice(0, 10);
  const http = () => request(app.getHttpServer());
  const as = (c: IsolatedCompany) => (r: request.Test) => r.set('Authorization', `Bearer ${c.token}`);

  type Refs = { customer: string; product: string; supplier: string; warehouse: string };
  const refs: Partial<Record<'a' | 'b', Refs>> = {};
  const observed: string[] = [];

  const setup = async (c: IsolatedCompany, tag: string): Promise<Refs> => {
    const auth = as(c);
    const customer = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل ${tag} ${suffix}` }).expect(201)).body.id;
    const product = (
      await auth(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف ${tag} ${suffix}`, price: 100, cost: 40 }).expect(201)
    ).body.id;
    const supplier = (await auth(http().post('/suppliers')).send({ name: `مورّد ${tag} ${suffix}` }).expect(201)).body.id;
    const warehouse = (await auth(http().post('/warehouses')).send({ name: `مستودع ${tag} ${suffix}` }).expect(201)).body.id;
    return { customer, product, supplier, warehouse };
  };

  /** عددُ صفوف «أ» في `table` التي عمودُها `col` يساوي `id` — داخل سياق «أ». */
  const countInA = async (table: string, col: string, id: string): Promise<number> =>
    tenantPrisma.runInTenantContext(a.companyId, async (tx) => {
      const [{ ctx }] = await tx.$queryRaw<{ ctx: string }[]>`SELECT current_setting('app.company_id', true) AS ctx`;
      if (ctx !== a.companyId) throw new Error(`السياقُ لم يُضبط: ${ctx}`);
      const rows = await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${table}" WHERE "${col}" = $1`, id);
      return rows[0].n;
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    a = await registerIsolatedCompany(app, 'xtr-a');
    b = await registerIsolatedCompany(app, 'xtr-b');
    refs.a = await setup(a, 'أ');
    refs.b = await setup(b, 'ب');
  });

  afterAll(async () => {
    // eslint-disable-next-line no-console
    console.log(`رموزُ الرفض المقيسة (ق-١٤٦٥):\n  ${observed.join('\n  ')}`);
    await removeIsolatedCompany(app, a);
    await removeIsolatedCompany(app, b);
    await app.close();
  });

  /**
   * حالةٌ واحدة: التوأمُ المشروع بمعرّف «أ» ⇒ `201` وعدُّه `≥ 1` (المسبارُ يرى)، ثم المحاولةُ بمعرّف «ب» ⇒
   * رفضٌ (`4xx`/`5xx`) وعدُّ «أ» بمعرّف «ب» = `0`.
   */
  const attempt = async (
    label: string,
    send: (r: Refs) => request.Test,
    table: string,
    col: string,
    idOf: (r: Refs) => string,
    named?: { status: number; message: string },
  ): Promise<void> => {
    await send(refs.a!).expect(201);
    expect({ label, probeSees: (await countInA(table, col, idOf(refs.a!))) >= 1 }).toEqual({ label, probeSees: true });

    const res = await send({ ...refs.a!, ...pick(refs.b!, idOf) });
    observed.push(`${label}: ${res.status} ${String(res.body?.message ?? '').slice(0, 80)}`);
    expect({ label, rejected: res.status >= 400 }).toEqual({ label, rejected: true });
    if (named) expect({ label, status: res.status, message: String(res.body?.message ?? '') }).toEqual({ label, status: named.status, message: named.message });
    expect({ label, rowsInAWithBId: await countInA(table, col, idOf(refs.b!)) }).toEqual({ label, rowsInAWithBId: 0 });
  };

  /** يأخذ من «ب» المعرّفَ الذي تقيسه الحالة وحدَه — والباقي من «أ» — فالفرقُ معرّفٌ واحد. */
  const pick = (bRefs: Refs, idOf: (r: Refs) => string): Partial<Refs> => {
    const key = (Object.keys(bRefs) as (keyof Refs)[]).find((k) => bRefs[k] === idOf(bRefs));
    return key ? { [key]: bRefs[key] } : {};
  };

  it('[SPEC 1.2] ① فاتورةٌ بعميل «ب»', () =>
    attempt(
      'invoice.customerId',
      (r) => as(a)(http().post('/invoices')).send({ customerId: r.customer, issueDate: today, dueDate: today, lines: [{ description: `بند ${suffix}`, quantity: 1, unitPrice: 100, taxRate: 15 }] }),
      'invoices',
      'customerId',
      (r) => r.customer,
    ));

  it('[SPEC 1.2] ② سطرُ فاتورةٍ بصنف «ب»', () =>
    attempt(
      'invoice_line.productId',
      (r) => as(a)(http().post('/invoices')).send({ customerId: refs.a!.customer, issueDate: today, dueDate: today, lines: [{ description: `بند ${suffix}`, productId: r.product, quantity: 1, unitPrice: 100, taxRate: 15 }] }),
      'invoice_lines',
      'productId',
      (r) => r.product,
    ));

  it('[SPEC 1.2] ③ عرضُ سعرٍ بعميل «ب»', () =>
    attempt(
      'quote.customerId',
      (r) => as(a)(http().post('/quotes')).send({ customerId: r.customer, issueDate: today, validUntil: today, lines: [{ description: `بند ${suffix}`, quantity: 1, unitPrice: 50, taxRate: 15 }] }),
      'quotes',
      'customerId',
      (r) => r.customer,
    ));

  it('[SPEC 1.2] ④ شراءٌ بمورّد «ب»', () =>
    attempt(
      'purchase.supplierId',
      (r) => as(a)(http().post('/purchases')).send({ supplierId: r.supplier, date: today, subtotal: 200 }),
      'purchases',
      'supplierId',
      (r) => r.supplier,
      { status: 404, message: resolveMessage(MSG.supplier_not_found, DEFAULT_LANGUAGE) },
    ));

  it('[SPEC 1.2] ⑤ سطرُ شراءٍ بصنف «ب»', () =>
    attempt(
      'purchase_line.productId',
      (r) =>
        as(a)(http().post('/purchases')).send({
          supplierId: refs.a!.supplier,
          date: today,
          subtotal: 100,
          receiveNow: false,
          lines: [{ description: `بند ${suffix}`, productId: r.product, quantity: 1, unitPrice: 100 }],
        }),
      'purchase_lines',
      'productId',
      (r) => r.product,
      { status: 400, message: resolveMessage(MSG.product_not_found, DEFAULT_LANGUAGE) },
    ));

  it('[SPEC 1.2] ⑥ سندُ قبضٍ بعميل «ب»', () =>
    attempt(
      'payment.customerId',
      (r) =>
        as(a)(http().post('/payments')).send({ customerId: r.customer, amount: 50, method: 'CASH', date: today, unallocated: 'PREPAYMENT', prepaymentTax: { taxCategory: 'S' } }),
      'payments',
      'customerId',
      (r) => r.customer,
    ));

  it('[SPEC 1.2] ⑦ حركةُ مخزونٍ بصنف «ب»', () =>
    attempt(
      'stock_movement.productId',
      (r) => as(a)(http().post('/inventory/movements')).send({ productId: r.product, warehouseId: refs.a!.warehouse, type: 'IN', qty: 2, unitCost: 10, date: today, reason: `اختبار ${suffix}` }),
      'stock_movements',
      'productId',
      (r) => r.product,
    ));
});
