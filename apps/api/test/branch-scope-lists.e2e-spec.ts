import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس فأكثر — الحزمةُ 52 ث أوّلَ تشغيلٍ بترجمتها على `mad_app_clean` (فأطولُ اختبارٍ دونها).
jest.setTimeout(240000);

/**
 * 🔴 **القوائمُ بلا ترشيح فرع — تُقاس حيّاً مساراً مساراً** (`ق-١٤٥٢` · كعائلة المعرّف `ق-١٤٤٠`).
 *
 * بنصّ المالك: «**الحضورُ · والإجازات · والسلّة · وأرصدةُ المخزون · والمركزُ المالي. ⇒ والمكسورُ يُصلح في الجلسة، فهو ثغرةُ صلاحية.**»
 *
 * **الحكمُ للقوائم**: موظّفٌ مقيَّدٌ بفرع لا يرى في قائمةٍ صفَّ فرعٍ آخر — وما هو للمنشأة كلِّها (`branchId: null` · مستودعٌ لا يخدم
 * فرعاً) مرئيٌّ للجميع. **وللقوائم المالية**: المعلَنُ في الشيفرة «**لا تُشتقّ قائمةُ دخلٍ من نصف دفتر**» — فقائمةُ المنشأة لا
 * تُرشَّح بفرع، **فلا تُعطى لمن لا يرى فروعَها كلَّها**: تُرفض مسمّاةً وتدلّ على ملخّص الفرع. والمركزُ المالي المسمّى، ومعه
 * أختاه من العائلة نفسِها (قائمةُ الدخل · التدفّقُ النقديّ).
 */
describe('القوائمُ بلا ترشيح فرع — الحضورُ والإجازاتُ والسلّةُ والمخزونُ والقوائمُ المالية (ق-١٤٥٢)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const http = () => request(app.getHttpServer());
  const asOwner = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  let restrictedToken: string;
  const asRestricted = (r: request.Test) => r.set('Authorization', `Bearer ${restrictedToken}`);

  let northId: string;
  let southId: string;
  let employeeNorth: string;
  let employeeSouth: string;
  let warehouseNorth: string;
  let warehouseSouth: string;
  let productId: string;
  const today = new Date().toISOString().slice(0, 10);

  const ids = (body: unknown): string[] => {
    const rows = (Array.isArray(body) ? body : ((body as { items?: unknown[] }).items ?? [])) as Record<string, unknown>[];
    return rows.map((r) => String(r.employeeId ?? (r.employee as { id?: string } | undefined)?.id ?? r.id ?? ''));
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    company = await registerIsolatedCompany(app, 'scope-lists');

    warehouseNorth = (await asOwner(http().post('/warehouses')).send({ name: `مستودع الشمال ${suffix}` }).expect(201)).body.id;
    warehouseSouth = (await asOwner(http().post('/warehouses')).send({ name: `مستودع الجنوب ${suffix}` }).expect(201)).body.id;
    northId = (await asOwner(http().post('/branches')).send({ name: `الشمال ${suffix}`, type: 'فرع', warehouseId: warehouseNorth }).expect(201)).body.id;
    southId = (await asOwner(http().post('/branches')).send({ name: `الجنوب ${suffix}`, type: 'فرع', warehouseId: warehouseSouth }).expect(201)).body.id;

    const template = await asOwner(http().post('/templates')).send({ name: `القوائم ${suffix}`, allowedScreens: ['dashboard', 'employees', 'audit', 'inventory', 'reports'] }).expect(201);
    await asOwner(http().post('/company-users'))
      .send({ name: 'موظّف الشمال', username: `north-lists-${suffix}`, password: 'ListsPass123!', permissionTemplateId: template.body.id, branchIds: [northId] })
      .expect(201);
    restrictedToken = (await http().post('/auth/login').send({ username: `north-lists-${suffix}`, password: 'ListsPass123!' }).expect(200)).body.accessToken;

    const employee = (fullName: string, branchId: string) => asOwner(http().post('/employees')).send({ fullName, hireDate: '2026-01-01', branchId }).expect(201);
    employeeNorth = (await employee(`موظّف الشمال ${suffix}`, northId)).body.id;
    employeeSouth = (await employee(`موظّف الجنوب ${suffix}`, southId)).body.id;
    for (const employeeId of [employeeNorth, employeeSouth]) {
      await asOwner(http().post('/attendance')).send({ employeeId, date: '2026-01-05', status: 'PRESENT', checkIn: '08:00' }).expect(201);
    }
    const typeId = (await asOwner(http().post('/leaves/types')).send({ name: `سنوية ${suffix}`, annualDays: 21, paid: true }).expect(201)).body.id;
    for (const employeeId of [employeeNorth, employeeSouth]) {
      await asOwner(http().post('/leaves/requests')).send({ employeeId, leaveTypeId: typeId, startDate: '2026-02-01', endDate: '2026-02-02' }).expect(201);
    }

    // السلّة: موظّفٌ وصندوقٌ من كلِّ فرعٍ يُحذفان ناعماً.
    const trashedEmployee = async (name: string, branchId: string) => {
      const id = (await employee(name, branchId)).body.id;
      await asOwner(http().delete(`/employees/${id}`)).expect(204);
    };
    await trashedEmployee(`محذوفُ الشمال ${suffix}`, northId);
    await trashedEmployee(`محذوفُ الجنوب ${suffix}`, southId);
    const trashedBank = async (name: string, branchId: string) => {
      const id = (await asOwner(http().post('/banks')).send({ name, kind: 'CASH_BOX', openingDate: '2026-01-01', branchId }).expect(201)).body.id;
      await asOwner(http().delete(`/banks/${id}`)).expect(204);
    };
    await trashedBank(`صندوقٌ محذوفٌ للشمال ${suffix}`, northId);
    await trashedBank(`صندوقٌ محذوفٌ للجنوب ${suffix}`, southId);

    // المخزون: صنفٌ برصيدٍ في المستودعين.
    productId = (await asOwner(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف القوائم ${suffix}`, price: 10 }).expect(201)).body.id;
    for (const warehouseId of [warehouseNorth, warehouseSouth]) {
      await asOwner(http().post('/inventory/movements')).send({ reason: 'اختبار — رصيد', productId, warehouseId, type: 'IN', qty: 5, unitCost: 2, date: today }).expect(201);
    }
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('[SPEC 2.7] 🔴 ① قائمةُ الحضور — لا صفَّ لموظّف فرعٍ آخر، وصفُّ فرعه حاضر `GET /attendance`', async () => {
    const seen = ids((await asRestricted(http().get('/attendance')).expect(200)).body);
    expect({ north: seen.includes(employeeNorth), south: seen.includes(employeeSouth) }).toEqual({ north: true, south: false });
  });

  it('[SPEC 2.7] 🔴 ② قائمةُ الإجازات ورصيدُ موظّفِ فرعٍ آخر — لا صفَّ، والرصيدُ 404 `GET /leaves/requests` · `GET /leaves/balance`', async () => {
    const seen = ids((await asRestricted(http().get('/leaves/requests')).expect(200)).body);
    const balance = await asRestricted(http().get(`/leaves/balance?employeeId=${employeeSouth}`));
    expect({ north: seen.includes(employeeNorth), south: seen.includes(employeeSouth), southBalance: balance.status }).toEqual({ north: true, south: false, southBalance: 404 });
    await asRestricted(http().get(`/leaves/balance?employeeId=${employeeNorth}`)).expect(200);
  });

  it('[SPEC 2.7] 🔴 ③ السلّة — لا موظّفَ ولا صندوقَ لفرعٍ آخر، وما لفرعه حاضر `GET /trash`', async () => {
    const text = JSON.stringify((await asRestricted(http().get('/trash')).expect(200)).body);
    expect({
      northEmployee: text.includes(`محذوفُ الشمال ${suffix}`),
      southEmployee: text.includes(`محذوفُ الجنوب ${suffix}`),
      northBank: text.includes(`صندوقٌ محذوفٌ للشمال ${suffix}`),
      southBank: text.includes(`صندوقٌ محذوفٌ للجنوب ${suffix}`),
    }).toEqual({ northEmployee: true, southEmployee: false, northBank: true, southBank: false });
  });

  it('[SPEC 2.7] 🔴 ④ أرصدةُ المخزون — لا مستودعَ لفرعٍ آخر، ومستودعُ فرعه حاضر `GET /inventory/stock-levels`', async () => {
    const body = (await asRestricted(http().get('/inventory/stock-levels')).expect(200)).body;
    const rows = (Array.isArray(body) ? body : body.items) as { productId: string; warehouseId: string }[];
    const mine = rows.filter((r) => r.productId === productId).map((r) => r.warehouseId);
    expect({ north: mine.includes(warehouseNorth), south: mine.includes(warehouseSouth) }).toEqual({ north: true, south: false });
  });

  it('[SPEC 2.7] 🔴 ⑤ القوائمُ المالية للمنشأة — تُرفض لمن لا يرى فروعَها كلَّها، مسمّاةً بملخّص الفرع `GET /reports/balance-sheet` · `income-statement` · `cash-flow`', async () => {
    const statuses: Record<string, number> = {};
    for (const route of ['balance-sheet', 'income-statement', 'cash-flow']) {
      const res = await asRestricted(http().get(`/reports/${route}`));
      statuses[route] = res.status;
    }
    expect(statuses).toEqual({ 'balance-sheet': 403, 'income-statement': 403, 'cash-flow': 403 });
    // ملخّصُ الفرع مقصورٌ على فروع القارئ — وهو ما تدلّ عليه الرسالة.
    await asRestricted(http().get('/reports/branch-summary')).expect(200);
  });

  it('[SPEC 2.7] والحالةُ الموجبة: المالكُ يرى الفروعَ كلَّها — القوائمُ والقوائمُ المالية', async () => {
    expect(ids((await asOwner(http().get('/attendance')).expect(200)).body)).toEqual(expect.arrayContaining([employeeNorth, employeeSouth]));
    expect(ids((await asOwner(http().get('/leaves/requests')).expect(200)).body)).toEqual(expect.arrayContaining([employeeNorth, employeeSouth]));
    const stock = (await asOwner(http().get('/inventory/stock-levels')).expect(200)).body;
    const rows = (Array.isArray(stock) ? stock : stock.items) as { productId: string; warehouseId: string }[];
    expect(rows.filter((r) => r.productId === productId).map((r) => r.warehouseId)).toEqual(expect.arrayContaining([warehouseNorth, warehouseSouth]));
    for (const route of ['balance-sheet', 'income-statement', 'cash-flow']) await asOwner(http().get(`/reports/${route}`)).expect(200);
  });
});
