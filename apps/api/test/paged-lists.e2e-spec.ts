import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { LIST_ROUTES } from '../src/common/pagination/list-routes';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (71.4 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(215000);

/**
 * **الترقيمُ بالاختيار على نقاط القائمة الاثنتين والأربعين — على القاعدة الحقيقية** (`ق-١٢٣٦`).
 *
 * لكلِّ مسارٍ في `LIST_ROUTES`: بلا `page` ⟵ **مصفوفة** (العقدُ القائم كما هو) · `?page=1&pageSize=2` ⟵
 * **مغلَّف** `{ items, total, page, pageSize }` بعناصرَ لا تزيد على `2` ومجموعٍ لا يقلّ عنها ·
 * `?pageSize=5` وحدَه ⟵ `400` مسمّى. والقراءةُ بفاعلها: صاحبُ منشأةٍ للتسعة والثلاثين ومديرُ المنصّة للثلاثة.
 * (الموجزُ قال `43` — و`/admin/processing-agreement` يعيد كائناً لا مصفوفة؛ انظر `list-routes.ts`.)
 *
 * ⚠️ القائمةُ لا تُكتب هنا — تُقرأ من `list-routes.ts` نفسِه الذي يقرؤه الحارسُ الساكن؛ فمسارٌ يُضاف هناك
 * يُقاس هنا بلا سطر.
 */
describe('نقاطُ القائمة — مصفوفةٌ بلا page، مغلَّفٌ به، و400 لـpageSize وحدَه (e2e)', () => {
  let app: INestApplication;
  let companyToken: string;
  let platformToken: string;
  let propertyId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    const company = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' }).expect(200);
    companyToken = company.body.accessToken;
    const platform = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan', password: process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD })
      .expect(200);
    platformToken = platform.body.accessToken;

    // `/warranties/cover` يوجب عقاراً — يُقرأ أوّلُ عقارٍ أو يُنشأ واحدٌ للفحص.
    const properties = await request(app.getHttpServer()).get('/properties').set('Authorization', `Bearer ${companyToken}`).expect(200);
    if (Array.isArray(properties.body) && properties.body.length > 0) {
      propertyId = properties.body[0].id;
    } else {
      const created = await request(app.getHttpServer())
        .post('/properties')
        .set('Authorization', `Bearer ${companyToken}`)
        .send({ name: `عقارُ فحص الترقيم ${Date.now()}`, type: 'RESIDENTIAL' })
        .expect(201);
      propertyId = created.body.id;
    }
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  const tokenFor = (actor: 'company' | 'platform') => (actor === 'platform' ? platformToken : companyToken);
  const baseQuery = (r: (typeof LIST_ROUTES)[number]) => {
    const q: Record<string, string> = {};
    for (const [k, v] of Object.entries(r.requiredQuery ?? {})) q[k] = v === '<property>' ? propertyId : v;
    return q;
  };
  /**
   * اثنان وأربعون نداءً متتابعاً في الاختبار الواحد — على قاعدةٍ مملوءة (`/invoices` بآلاف الصفوف بلا `page`)
   * يتجاوز المجموعُ سقفَ الخمس ثوانٍ، فالمهلةُ هنا للدفعة لا للنداء؛ وأبطأُ المسارات يُطبع كي يُقرأ لا يُخمَّن.
   */
  const LOOP_TIMEOUT_MS = 180_000;
  const timed = async <T,>(path: string, call: () => Promise<T>, sink: [string, number][]): Promise<T> => {
    const t0 = Date.now();
    try {
      return await call();
    } finally {
      sink.push([path, Date.now() - t0]);
    }
  };
  const reportSlowest = (label: string, sink: [string, number][]) => {
    const slowest = [...sink].sort((a, b) => b[1] - a[1]).slice(0, 5);
    console.info(`[paged-lists] ${label}: أبطأُ خمسة — ${slowest.map(([p, ms]) => `${p} ${ms}ms`).join(' · ')}`);
  };

  it('يقرأ القائمةَ فعلاً — 42 مساراً، 39 لصاحب المنشأة و3 لمدير المنصّة', () => {
    expect(LIST_ROUTES).toHaveLength(42);
    expect(LIST_ROUTES.filter((r) => r.actor === 'company')).toHaveLength(39);
    expect(LIST_ROUTES.filter((r) => r.actor === 'platform')).toHaveLength(3);
  });

  it('⭐ بلا page: مصفوفةٌ على كلِّ مسار (العقدُ القائم لا يتغيّر)', async () => {
    const notArray: string[] = [];
    const sink: [string, number][] = [];
    for (const r of LIST_ROUTES) {
      const res = await timed(r.path, () => request(app.getHttpServer()).get(r.path).query(baseQuery(r)).set('Authorization', `Bearer ${tokenFor(r.actor)}`), sink);
      if (res.status !== 200 || !Array.isArray(res.body)) notArray.push(`${r.path} ⟵ ${res.status} ${Array.isArray(res.body) ? 'array' : typeof res.body}`);
    }
    reportSlowest('بلا page', sink);
    expect(notArray).toEqual([]);
  }, LOOP_TIMEOUT_MS);

  it('⭐ مع page: مغلَّفٌ بعناصرَ لا تزيد على pageSize ومجموعٍ لا يقلّ عنها — على كلِّ مسار', async () => {
    const wrong: string[] = [];
    const sink: [string, number][] = [];
    for (const r of LIST_ROUTES) {
      const res = await timed(r.path, () => request(app.getHttpServer()).get(r.path).query({ ...baseQuery(r), page: 1, pageSize: 2 }).set('Authorization', `Bearer ${tokenFor(r.actor)}`), sink);
      const b = res.body;
      const ok =
        res.status === 200 &&
        b &&
        !Array.isArray(b) &&
        Array.isArray(b.items) &&
        b.items.length <= 2 &&
        typeof b.total === 'number' &&
        b.total >= b.items.length &&
        b.page === 1 &&
        b.pageSize === 2;
      if (!ok) wrong.push(`${r.path} ⟵ ${res.status} ${JSON.stringify(b).slice(0, 80)}`);
    }
    reportSlowest('مع page', sink);
    expect(wrong).toEqual([]);
  }, LOOP_TIMEOUT_MS);

  it('⛔ pageSize بلا page: 400 مسمّىً على كلِّ مسار — لا تجاهلَ صامت', async () => {
    const wrong: string[] = [];
    for (const r of LIST_ROUTES) {
      const res = await request(app.getHttpServer()).get(r.path).query({ ...baseQuery(r), pageSize: 5 }).set('Authorization', `Bearer ${tokenFor(r.actor)}`);
      if (res.status !== 400) wrong.push(`${r.path} ⟵ ${res.status}`);
    }
    expect(wrong).toEqual([]);
  }, LOOP_TIMEOUT_MS);

  it('search يرشّح ولا يغيّر الشكل: مصفوفةٌ بلا page ومغلَّفٌ به — على صفٍّ من صنع الاختبار لا من البذرة', async () => {
    // الصفُّ يُصنع هنا بلاحقةٍ فريدة (`ق-٦٥٩`: مسبارٌ يقيس على صفوفٍ قائمة يشهد لبيئته) — فالبحثُ عنها يعيد واحداً بالضبط.
    const needle = `بحثُ-الترقيم-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const created = await request(app.getHttpServer()).post('/customers').set('Authorization', `Bearer ${companyToken}`).send({ kind: 'NATURAL', name: `عميل ${needle}` }).expect(201);
    const all = await request(app.getHttpServer()).get('/customers').set('Authorization', `Bearer ${companyToken}`).expect(200);
    expect(Array.isArray(all.body)).toBe(true);
    expect(all.body.some((c: { id: string }) => c.id === created.body.id)).toBe(true);

    const filtered = await request(app.getHttpServer()).get('/customers').query({ search: needle }).set('Authorization', `Bearer ${companyToken}`).expect(200);
    expect(Array.isArray(filtered.body)).toBe(true);
    expect(filtered.body.map((c: { id: string }) => c.id)).toEqual([created.body.id]);

    // غيرُ حسّاسٍ للحالة: الجزءُ اللاتينيُّ من اللاحقة بحروفٍ كبيرة يُصيب الصفَّ نفسَه.
    const upper = await request(app.getHttpServer()).get('/customers').query({ search: needle.slice(-6).toUpperCase() }).set('Authorization', `Bearer ${companyToken}`).expect(200);
    expect(upper.body.some((c: { id: string }) => c.id === created.body.id)).toBe(true);

    const paged = await request(app.getHttpServer()).get('/customers').query({ search: needle, page: 1, pageSize: 1 }).set('Authorization', `Bearer ${companyToken}`).expect(200);
    expect(paged.body).toEqual({ items: [expect.objectContaining({ id: created.body.id })], total: 1, page: 1, pageSize: 1 });

    // ولا صفَّ من صنع البحث يبقى: يُحذف فيعود البحثُ عنه فارغاً — مصفوفةً لا `404`.
    await request(app.getHttpServer()).delete(`/customers/${created.body.id}`).set('Authorization', `Bearer ${companyToken}`).expect(204);
    const gone = await request(app.getHttpServer()).get('/customers').query({ search: needle }).set('Authorization', `Bearer ${companyToken}`).expect(200);
    expect(gone.body).toEqual([]);
  }, 60_000);
});
