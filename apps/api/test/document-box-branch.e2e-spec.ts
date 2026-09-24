import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';
import { createTenantCustomer } from './tenant-customer';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس فأكثر (أطولُ اختبارٍ 0.96 ث · والحزمةُ 52 ث بترجمتها) — معلَنةٌ هنا لا مفترَضة.
jest.setTimeout(60000);

/**
 * 🔴 **فرعُ الصندوق يقيّد فرعَ المستند** (التوجيه ٢٦٤ §٢ ⑦ — `ق-١٤٣٧`).
 *
 * بنصّ المالك: «**فرعُ الصندوق لا يقيّد فرعَ المستند: المخطَّطُ يقول نعم والشيفرةُ لا، فهو مكسورٌ اليوم. ⇒ مستندٌ في فرعٍ
 * لا يستعمل صندوقَ فرعٍ آخر.**» — والمخطَّطُ يقول: «each branch has its own cash box — modelled by pointing the
 * Bank/cash account at a branch» (`Bank.branchId`).
 *
 * **والمقيسُ قبل البناء**: صفرُ مخالفٍ قائمٍ على التطوير والمنشور — فالمنعُ للقادم لا يلمس صفّاً. **والحكمُ**: مستندٌ له فرعٌ
 * وصندوقٌ له فرعٌ آخر ⟸ `409` يسمّي الصندوقَ والفرعين؛ **وصندوقُ المنشأة كلِّها** (بلا فرع) لكلِّ فرع؛ **والمستندُ بلا فرعٍ**
 * خارجُ الحكم (حدٌّ معلَن).
 */
describe('مستندٌ في فرعٍ لا يستعمل صندوقَ فرعٍ آخر (ق-١٤٣٧)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const http = () => request(app.getHttpServer());
  const asOwner = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);

  let northId: string;
  let southId: string;
  let northBox: string;
  let southBox: string;
  let companyBox: string;
  let customerId: string;
  const SOUTH_BOX = `صندوق الجنوب ${suffix}`;

  /** الرفضُ يسمّي الصندوقَ وفرعَه وفرعَ المستند — لا «تعارض» مجرّداً. */
  const expectNamed = (body: { message: string | string[] }) => {
    const message = ([] as string[]).concat(body.message).join(' | ');
    expect(message).toContain(SOUTH_BOX);
    expect(message).toContain(`الجنوب ${suffix}`);
    expect(message).toContain(`الشمال ${suffix}`);
  };
  const invoiceIn = async (branchId: string) =>
    (
      await asOwner(http().post('/invoices'))
        .send({ customerId, branchId, issueDate: '2026-09-20', dueDate: '2026-09-20', lines: [{ description: `بندُ الصندوق ${suffix}`, quantity: 1, unitPrice: 100, taxRate: 15 }] })
        .expect(201)
    ).body as { id: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'box-branch');
    northId = (await asOwner(http().post('/branches')).send({ name: `الشمال ${suffix}`, type: 'فرع' }).expect(201)).body.id;
    southId = (await asOwner(http().post('/branches')).send({ name: `الجنوب ${suffix}`, type: 'فرع' }).expect(201)).body.id;
    const bank = async (name: string, branchId?: string) =>
      (await asOwner(http().post('/banks')).send({ name, openingDate: '2026-01-01', ...(branchId ? { branchId } : {}) }).expect(201)).body.id as string;
    northBox = await bank(`صندوق الشمال ${suffix}`, northId);
    southBox = await bank(SOUTH_BOX, southId);
    companyBox = await bank(`صندوق المنشأة ${suffix}`);
    customerId = await createTenantCustomer(app, company.token, `عميل الصندوق ${suffix}`);
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('[SPEC 2.6] ① سندُ قبضٍ في الشمال بصندوق الجنوب يُرفض مسمّىً — وبصندوق فرعه أو صندوق المنشأة يمضي', async () => {
    const invoice = await invoiceIn(northId);
    const refused = await asOwner(http().post('/payments'))
      .send({ customerId, branchId: northId, date: '2026-09-21', amount: 10, method: 'BANK', bankId: southBox, allocations: [{ invoiceId: invoice.id, amount: 10 }] })
      .expect(409);
    expectNamed(refused.body);
    await asOwner(http().post('/payments'))
      .send({ customerId, branchId: northId, date: '2026-09-21', amount: 10, method: 'BANK', bankId: northBox, allocations: [{ invoiceId: invoice.id, amount: 10 }] })
      .expect(201);
    await asOwner(http().post('/payments'))
      .send({ customerId, branchId: northId, date: '2026-09-21', amount: 10, method: 'BANK', bankId: companyBox, allocations: [{ invoiceId: invoice.id, amount: 10 }] })
      .expect(201);
  });

  it('[SPEC 2.6] ② وسندُ الصرف للمورّد كذلك', async () => {
    const supplierId = (await asOwner(http().post('/suppliers')).send({ name: `مورّد الصندوق ${suffix}` }).expect(201)).body.id;
    const purchase = (
      await asOwner(http().post('/purchases')).send({ supplierId, branchId: northId, date: '2026-09-20', category: `شراء الصندوق ${suffix}`, subtotal: 40, exempt: true }).expect(201)
    ).body;
    const refused = await asOwner(http().post('/supplier-payments'))
      .send({ supplierId, branchId: northId, date: '2026-09-21', amount: 10, method: 'BANK', bankId: southBox, allocations: [{ purchaseId: purchase.id, amount: 10 }] })
      .expect(409);
    expectNamed(refused.body);
    await asOwner(http().post('/supplier-payments'))
      .send({ supplierId, branchId: northId, date: '2026-09-21', amount: 10, method: 'BANK', bankId: northBox, allocations: [{ purchaseId: purchase.id, amount: 10 }] })
      .expect(201);
  });

  it('[SPEC 2.6] ③ والحركةُ البنكية — إنشاءً، وتعديلاً ينقلها إلى صندوق فرعٍ آخر', async () => {
    const refused = await asOwner(http().post('/transactions')).send({ bankId: southBox, branchId: northId, date: '2026-09-21', description: `حركة ${suffix}`, amount: 5 }).expect(409);
    expectNamed(refused.body);
    const tx = (await asOwner(http().post('/transactions')).send({ bankId: northBox, branchId: northId, date: '2026-09-21', description: `حركة ${suffix}`, amount: 5 }).expect(201)).body;
    const moved = await asOwner(http().patch(`/transactions/${tx.id}`)).send({ bankId: southBox }).expect(409);
    expectNamed(moved.body);
  });

  it('[SPEC 2.6] ④ وإيداعُ درجِ الشمال في صندوق الجنوب — ويمضي في صندوق المنشأة', async () => {
    const drawer = (await asOwner(http().post('/cash-drawers')).send({ name: `درج الشمال ${suffix}`, branchId: northId }).expect(201)).body;
    const revenueId = ((await asOwner(http().get('/accounts')).expect(200)).body as { id: string; code: string }[]).find((a) => a.code === '4100')!.id;
    await asOwner(http().post('/journal'))
      .send({ date: '2026-09-20', memo: `تمويل ${suffix}`, lines: [{ accountId: drawer.account.id, debit: 100, credit: 0 }, { accountId: revenueId, debit: 0, credit: 100 }] })
      .expect(201);
    const refused = await asOwner(http().post('/banks/cash-deposits')).send({ drawerId: drawer.id, bankId: southBox, amount: 10, date: '2026-09-21' }).expect(409);
    expectNamed(refused.body);
    await asOwner(http().post('/banks/cash-deposits')).send({ drawerId: drawer.id, bankId: companyBox, amount: 10, date: '2026-09-21' }).expect(201);
  });

  it('[SPEC 2.6] ⑤ وتسويةُ الشبكة في الشمال على بنك الجنوب', async () => {
    const refused = await asOwner(http().post('/banks/network-settlements'))
      .send({ bankId: southBox, branchId: northId, date: '2026-09-21', periodFrom: '2026-09-01', periodTo: '2026-09-21', feeAmount: 0, feeVatAmount: 0 })
      .expect(409);
    expectNamed(refused.body);
  });

  it('[SPEC 2.6] ⑥ وردُّ إشعارٍ دائنٍ في الشمال من صندوق الجنوب', async () => {
    const invoice = await invoiceIn(northId);
    const note = (await asOwner(http().post(`/invoices/${invoice.id}/credit-note`)).send({ reason: `ردّ ${suffix}` }).expect(201)).body;
    const refused = await asOwner(http().post('/payments/refund')).send({ creditNoteId: note.id, date: '2026-09-21', method: 'BANK', bankId: southBox }).expect(409);
    expectNamed(refused.body);
  });
});
