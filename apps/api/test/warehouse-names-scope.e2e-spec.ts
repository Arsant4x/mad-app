import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): منشأةٌ وفرعان وثلاثةُ مستودعات وموظّف؛ لم تُقَس بعد، فالسقفُ مئةٌ وعشرون ثانية معلنةً هنا.
jest.setTimeout(120000);

interface WarehouseRow {
  id: string;
  name: string;
  location: string | null;
  itemCount: number | null;
  totalQty: number | null;
  otherBranch?: boolean;
  archived?: boolean;
}
interface TrashGroup {
  entity: string;
  items: { id: string }[];
}
const rowsOf = <T>(body: unknown): T[] => (Array.isArray(body) ? (body as T[]) : (body as { items: T[] }).items);

/**
 * ⚖️ **المستودعاتُ للمقيَّد بأسمائها لا بكمّياتها** (توجيه ٢٧٦ · ٢هـ · `ق-١٦٠٤`، بحكم صاحب المشروع: «يرى المقيَّدُ أسماءَ مستودعات الفروع
 * الأخرى ليحوّل إليها، ولا يرى كمّياتها ولا أرصدتَها»).
 *
 * كانت قائمةُ `GET /warehouses` تُرجع كلَّ مستودعٍ بعدد أصنافه ومجموع كمّيته لكلِّ قارئ، فيرى موظّفُ الشمال كمّياتِ مستودع الجنوب.
 * والجوابُ محسوبٌ يداً: ٥ وحداتٍ في مستودع الجنوب و٣ في الشمال، ومستودعٌ ثالثٌ بلا فرعٍ (للمنشأة كلِّها) فيه ٢.
 * موظّفُ الشمال يرى الأسماءَ الثلاثة، وكمّيةَ الشمال (٣) والمشترك (٢)، **ولا يرى كمّيةَ الجنوب**؛ والمالكُ يرى الثلاث.
 */
describe('المستودعاتُ للمقيَّد بأسمائها لا بكمّياتها (ق-١٦٠٤)', () => {
  let app: INestApplication;
  let company: IsolatedCompany;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const PASSWORD = 'ScopePass123!';
  const http = () => request(app.getHttpServer());
  const asOwner = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  let northToken: string;
  const asNorth = (r: request.Test) => r.set('Authorization', `Bearer ${northToken}`);
  const today = () => new Date().toISOString().slice(0, 10);
  let north: string;
  let south: string;
  let shared: string;
  let east: string;
  let west: string;
  let spare: string;

  const stockIn = async (productId: string, warehouseId: string, qty: number) =>
    asOwner(http().post('/inventory/movements')).send({ productId, warehouseId, type: 'IN', qty, date: today(), reason: `إدخال ${suffix}`, unitCost: 10 }).expect(201);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    company = await registerIsolatedCompany(app, 'warehouse-names');
    north = (await asOwner(http().post('/warehouses')).send({ name: `مستودع الشمال ${suffix}`, location: 'الشمال' }).expect(201)).body.id;
    south = (await asOwner(http().post('/warehouses')).send({ name: `مستودع الجنوب ${suffix}`, location: 'الجنوب' }).expect(201)).body.id;
    shared = (await asOwner(http().post('/warehouses')).send({ name: `المستودع المشترك ${suffix}` }).expect(201)).body.id;
    const northBranch = (await asOwner(http().post('/branches')).send({ name: `فرع الشمال ${suffix}`, warehouseId: north }).expect(201)).body.id as string;
    await asOwner(http().post('/branches')).send({ name: `فرع الجنوب ${suffix}`, warehouseId: south }).expect(201);
    // مستودعاتٌ بلا حركة: الشرقُ والغربُ لفرعين آخرين، والاحتياطيُّ بلا فرع (للمنشأة كلِّها).
    east = (await asOwner(http().post('/warehouses')).send({ name: `مستودع الشرق ${suffix}` }).expect(201)).body.id;
    west = (await asOwner(http().post('/warehouses')).send({ name: `مستودع الغرب ${suffix}` }).expect(201)).body.id;
    spare = (await asOwner(http().post('/warehouses')).send({ name: `المستودع الاحتياطي ${suffix}` }).expect(201)).body.id;
    await asOwner(http().post('/branches')).send({ name: `فرع الشرق ${suffix}`, warehouseId: east }).expect(201);
    await asOwner(http().post('/branches')).send({ name: `فرع الغرب ${suffix}`, warehouseId: west }).expect(201);

    const templateId = (await asOwner(http().post('/templates')).send({ name: `المخزون ${suffix}`, allowedScreens: ['dashboard', 'inventory', 'audit'] }).expect(201)).body.id as string;
    const username = `north-wh-${suffix}`;
    await asOwner(http().post('/company-users')).send({ name: 'موظّف الشمال', username, password: PASSWORD, permissionTemplateId: templateId, branchIds: [northBranch] }).expect(201);
    northToken = (await http().post('/auth/login').send({ username, password: PASSWORD }).expect(200)).body.accessToken;

    const productId = (await asOwner(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف المستودعات ${suffix}`, price: 50 }).expect(201)).body.id as string;
    await stockIn(productId, south, 5);
    await stockIn(productId, north, 3);
    await stockIn(productId, shared, 2);
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  const view = (rows: WarehouseRow[], id: string) => {
    const w = rows.find((r) => r.id === id);
    return w ? { name: w.name.split(' ')[1], location: w.location, itemCount: w.itemCount, totalQty: w.totalQty, otherBranch: w.otherBranch ?? false } : null;
  };

  it('🔴 المقيَّدُ يرى أسماءَ المستودعات كلِّها، وكمّياتِ مستودعات فروعه والمشتركِ وحدَها', async () => {
    const rows = rowsOf<WarehouseRow>((await asNorth(http().get('/warehouses')).expect(200)).body);
    expect({ north: view(rows, north), south: view(rows, south), shared: view(rows, shared) }).toEqual({
      north: { name: 'الشمال', location: 'الشمال', itemCount: 1, totalQty: 3, otherBranch: false },
      south: { name: 'الجنوب', location: 'الجنوب', itemCount: null, totalQty: null, otherBranch: true },
      shared: { name: 'المشترك', location: null, itemCount: 1, totalQty: 2, otherBranch: false },
    });
  });

  /**
   * 🔴 **ما حُجبت كمّيتُه لا يُعدَّل** (توجيه ٢٧٧ · ٢أ · `ق-١٦١٩`، بالقاعدة ٣٧): كانت الرؤيةُ وحدَها محجوبةً في `#720`، والتعديلُ
   * والأرشفةُ والحذفُ تقرأ المستودعَ بمعرّفه وحدَه، فموظّفُ الشمال يغيّر موقعَ مستودع الجنوب ويؤرشفه ويحذف مستودعَ الشرق.
   * والمستودعُ ظاهرٌ له باسمه فالرفضُ `403` مسمّى لا `404`، وكلُّها قبل أيّ كتابة.
   */
  it('🔴 المقيَّدُ لا يعدّل مستودعَ فرعٍ آخر ولا يؤرشفه ولا يحذفه', async () => {
    const statuses = [
      (await asNorth(http().patch(`/warehouses/${south}`)).send({ location: 'غيرُ الجنوب' })).status,
      (await asNorth(http().patch(`/warehouses/${south}/archive`)).send({ archived: true })).status,
      (await asNorth(http().delete(`/warehouses/${east}`))).status,
    ];
    const rows = rowsOf<WarehouseRow>((await asOwner(http().get('/warehouses?includeArchived=true')).expect(200)).body);
    const s = rows.find((r) => r.id === south);
    expect({ statuses, south: { location: s?.location, archived: s?.archived }, eastStays: rows.some((r) => r.id === east) }).toEqual({
      statuses: [403, 403, 403],
      south: { location: 'الجنوب', archived: false },
      eastStays: true,
    });
  });

  it('ويعدّل مستودعَ فرعه والمشتركَ ويؤرشفهما', async () => {
    const statuses = [
      (await asNorth(http().patch(`/warehouses/${north}`)).send({ location: 'الشمال' })).status,
      (await asNorth(http().patch(`/warehouses/${shared}`)).send({ location: 'الوسط' })).status,
      (await asNorth(http().patch(`/warehouses/${shared}/archive`)).send({ archived: true })).status,
      (await asNorth(http().patch(`/warehouses/${shared}/archive`)).send({ archived: false })).status,
    ];
    expect(statuses).toEqual([200, 200, 200, 200]);
  });

  /**
   * 🔴 **وسلّةُ المحذوفات**: المستودعُ لا يحمل عمودَ فرع، فلم يدخل مرشِّحَ السلّة (`branchFilter` على ما يحمل `branchId` وحدَه)،
   * فموظّفُ الشمال يرى مستودعَ الغرب المحذوفَ ويستعيده أو يمحوه. ⟸ يُقرأ في السلّة بفرعه كما في الأرصدة، وما لفرعٍ آخر غيرُ موجودٍ
   * له (`404`، حكمُ السلّة `ق-١٤٤٠`)، والمحذوفُ الذي بلا فرعٍ ظاهرٌ له كما كان.
   */
  it('🔴 ولا يرى في السلّة مستودعَ فرعٍ آخر ولا يستعيده ولا يمحوه', async () => {
    await asOwner(http().delete(`/warehouses/${west}`)).expect(204);
    await asOwner(http().delete(`/warehouses/${spare}`)).expect(204);
    const idsIn = (body: { groups: TrashGroup[] }) => (body.groups.find((g) => g.entity === 'warehouses')?.items ?? []).map((i) => i.id);
    const northIds = idsIn((await asNorth(http().get('/trash')).expect(200)).body);
    const restore = (await asNorth(http().post(`/trash/warehouses/${west}/restore`))).status;
    const purge = (await asNorth(http().delete(`/trash/warehouses/${west}`))).status;
    const ownerIds = idsIn((await asOwner(http().get('/trash')).expect(200)).body);
    expect({ spare: northIds.includes(spare), west: northIds.includes(west), restore, purge, ownerSeesWest: ownerIds.includes(west) }).toEqual({
      spare: true,
      west: false,
      restore: 404,
      purge: 404,
      ownerSeesWest: true,
    });
  });

  it('والمالكُ يرى كمّياتِ المستودعات كلِّها', async () => {
    const rows = rowsOf<WarehouseRow>((await asOwner(http().get('/warehouses')).expect(200)).body);
    expect([view(rows, north)?.totalQty, view(rows, south)?.totalQty, view(rows, shared)?.totalQty, view(rows, south)?.otherBranch]).toEqual([3, 5, 2, false]);
  });
});
