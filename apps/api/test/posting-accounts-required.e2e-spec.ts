import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة: منشأةٌ معزولة وحذفُ حسابَين وإعادتُهما وأربعةُ مستندات — ثلاثةُ أضعاف ما يلزم عادةً.
jest.setTimeout(300000);

/**
 * `ق-١٤٦٦` — **الدعوى «ب»: الترحيلُ الآليُّ يرجع فارغاً إن نقص حسابٌ في الدليل** (التوجيه ٢٦٦ §٤ب).
 *
 * «يُرفض المستندُ برسالة ولا يمرّ بلا قيد.» كان المستندُ يُحفظ `201` بـ`journalEntryId = null`، والمالكُ الذي حذف
 * الحسابَ من شاشته لا يرى شيئاً حتى يفرغ تقريرٌ بعد أسابيع. **والآن**: `409` يسمّي الحسابَ ويدلّ على المخرج، ولا يبقى
 * مستند؛ **ورقمُ الفاتورة لا يُحرق** — فُحصت حساباتُها قبل الترقيم.
 */
describe('المستندُ يُرفض برسالة ولا يمرّ بلا قيد حين ينقص حسابُ ترحيله (ق-١٤٦٦)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let co: IsolatedCompany;
  let customerId: string;
  let supplierId: string;
  const suffix = `${Date.now()}`;
  const today = new Date().toISOString().slice(0, 10);
  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
  const accountId = async (code: string) =>
    (await tenantPrisma.runInTenantContext(co.companyId, (tx) => tx.account.findFirst({ where: { code }, select: { id: true } })))?.id ?? null;
  const invoice = () =>
    auth(http().post('/invoices')).send({ customerId, issueDate: today, dueDate: today, lines: [{ description: `بيع ${suffix}`, quantity: 1, unitPrice: 100, taxRate: 15 }] });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    co = await registerIsolatedCompany(app, 'posting-accounts');
    customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل ${suffix}` }).expect(201)).body.id;
    supplierId = (await auth(http().post('/suppliers')).send({ name: `مورّد ${suffix}` }).expect(201)).body.id;
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, co);
    await app.close();
  });

  it('① فاتورةٌ بلا حساب الإيرادات 4100 تُرفض 409 مسمّاةً — ولا فاتورةَ تبقى، ولا رقمَ يُحرق', async () => {
    // المنشأةُ وليدةٌ بدليلها الكامل (4.7): الحسابُ موجودٌ أوّلاً — والمسبارُ يرى.
    const revenue = await accountId('4100');
    expect(revenue).not.toBeNull();
    await auth(http().delete(`/accounts/${revenue}`)).expect(204);
    expect(await accountId('4100')).toBeNull();

    const refused = await invoice().expect(409);
    expect(String(refused.body.message)).toContain('4100');
    expect(String(refused.body.message)).toContain('شاشة الحسابات');
    const count = await tenantPrisma.runInTenantContext(co.companyId, (tx) => tx.invoice.count());
    expect(count).toBe(0);

    // يُعاد الحسابُ من شاشته — فالفاتورةُ التالية برقمٍ متّصل: الأوّل، لا الثاني.
    await auth(http().post('/accounts')).send({ code: '4100', name: 'إيرادات المبيعات', type: 'revenue' }).expect(201);
    const ok = await invoice().expect(201);
    expect(ok.body.journalEntryId).toBeTruthy();
    expect(String(ok.body.no)).toMatch(/0001$/);
  });

  it('② شراءٌ بلا حساب الموردين 2100 يُرفض 409 مسمّىً — ولا شراءَ يبقى بلا قيد', async () => {
    const payables = await accountId('2100');
    expect(payables).not.toBeNull();
    await auth(http().delete(`/accounts/${payables}`)).expect(204);

    const refused = await auth(http().post('/purchases')).send({ supplierId, date: today, subtotal: 200 }).expect(409);
    expect(String(refused.body.message)).toContain('2100');
    const count = await tenantPrisma.runInTenantContext(co.companyId, (tx) => tx.purchase.count());
    expect(count).toBe(0);

    await auth(http().post('/accounts')).send({ code: '2100', name: 'الموردون', type: 'liability' }).expect(201);
    const ok = await auth(http().post('/purchases')).send({ supplierId, date: today, subtotal: 200 }).expect(201);
    expect(ok.body.journalEntryId).toBeTruthy();
  });

  it('③ الضابط: منشأةٌ بدليلها الكامل تُصدر وتُرحّل — فالرفضُ لغياب الحساب وحدَه', async () => {
    const ok = await invoice().expect(201);
    expect(ok.body.journalEntryId).toBeTruthy();
  });

  it('④ الكاشير: التحضيرُ يرفض قبل أيّ شيء — فمحاولةُ البطاقة لا تشحن لبيعٍ لا يُرحَّل', async () => {
    // منشأةٌ ثانيةٌ وليدة: حسابُ الإيرادات في الأولى صار عليه قيدٌ من ①–③ فلا يُحذف (وهو الصواب) — فالحالةُ على دليلٍ لم يُمسّ.
    const co2 = await registerIsolatedCompany(app, 'posting-accounts-pos');
    const auth2 = (r: request.Test) => r.set('Authorization', `Bearer ${co2.token}`);
    try {
      const productId = (
        await auth2(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف الكاشير ${suffix}`, price: 50 }).expect(201)
      ).body.id as string;
      await auth2(http().post('/pos/shifts')).send({ openingFloat: 0 }).expect(201);
      const revenue = await tenantPrisma.runInTenantContext(co2.companyId, (tx) => tx.account.findFirst({ where: { code: '4100' }, select: { id: true } }));
      expect(revenue).not.toBeNull();
      await auth2(http().delete(`/accounts/${revenue!.id}`)).expect(204);

      const refused = await auth2(http().post('/pos/sales')).send({ lines: [{ productId, quantity: 1 }], paymentMethod: 'CASH' }).expect(409);
      expect(String(refused.body.message)).toContain('4100');
      expect(await tenantPrisma.runInTenantContext(co2.companyId, (tx) => tx.invoice.count())).toBe(0);

      await auth2(http().post('/accounts')).send({ code: '4100', name: 'إيرادات المبيعات', type: 'revenue' }).expect(201);
      await auth2(http().post('/pos/sales')).send({ lines: [{ productId, quantity: 1 }], paymentMethod: 'CASH' }).expect(201);
    } finally {
      await removeIsolatedCompany(app, co2);
    }
  });
});
