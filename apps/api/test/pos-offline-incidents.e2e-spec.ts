import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { purgeInvoicesForTest } from './purge-invoices';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';

interface IncidentRow {
  id: string;
  startedAt: string;
  endedAt: string;
  firstSyncedAt: string;
  gapMinutes: number;
  durationMinutes: number;
  salesCount: number;
}
interface IncidentReport {
  inferred: boolean;
  gapMinutes: number;
  items: IncidentRow[];
}

/**
 * (ج) `ق-١٩٢` · `ق-٢٠١` — **وقائعُ الانقطاع تُستنتَج على الخادم** من أزمنة رنّ البيوع
 * المزامَنة: لا هويةَ طرفيةٍ عندنا، فبيعٌ رنَّ قبل مزامنته بأكثر من حدّ الفصل وقع في
 * انقطاع. الحدّ إعدادُ المنشأة (افتراضه دقيقتان) ويُعرَض في التقرير: **استنتاجٌ لا قياس**.
 *
 * والسؤال الثالث في التوجيه — «ماذا لو زُومنت البيوع بترتيبٍ مختلف عن رنّها؟ قِسه ولا
 * تفترض ترتيباً» — يُقاس هنا مرتَين: وصولٌ مبعثر متتابع (①)، ووصولٌ متزامن (⑥).
 */
describe('POS offline incidents — inferred on the server (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let companyId: string;
  let tenantPrisma: TenantPrismaService;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let productId: string;
  let shiftId: string;
  const invoiceIds: string[] = [];
  const startedTestAt = Date.now();

  // يومٌ ثابت لا تستعمله حزمةٌ أخرى للوقائع، وساعةٌ ودقيقةٌ عشوائيتان كي لا تتقاطع
  // نوافذُ تشغيلَين على قاعدةٍ واحدة (٠٦..١٩ كي تبقى «قبلها بثلاث ساعات» في اليوم نفسه).
  const base = Date.UTC(2026, 7, 20, 6 + Math.floor(Math.random() * 14), Math.floor(Math.random() * 60), 0);
  const at = (minutes: number) => new Date(base + Math.round(minutes * 60_000)).toISOString();

  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const http = () => request(app.getHttpServer());

  /** مزامنةُ بيعٍ رنَّ في `ringAt` بتوقيت الرياض — أو بلا لحظةٍ إن لم تُمرَّر. */
  const sync = async (ringAt?: string) => {
    const res = await auth(http().post('/pos/sales/sync'))
      .send({ clientSaleId: randomUUID(), ...(ringAt ? { ringAt, ringOffsetMin: 180 } : {}), lines: [{ productId, quantity: 1 }], paymentMethod: 'CASH' })
      .expect(201);
    invoiceIds.push(res.body.id);
    return res.body as { id: string };
  };
  /** الواقعة المربوطة بالفاتورة — تُقرأ من القائمة بعد المزامنة (لا مسارَ لفاتورةٍ واحدة)، فالاستنتاج يقع بعد التزام البيع لا قبله. */
  const incidentOf = async (invoiceId: string): Promise<string | null> => {
    const list = (await auth(http().get('/invoices')).expect(200)).body as { id: string; offlineIncidentId?: string | null }[];
    const inv = list.find((i) => i.id === invoiceId);
    if (!inv) throw new Error(`invoice ${invoiceId} not in list`);
    return inv.offlineIncidentId ?? null;
  };
  const report = async (): Promise<IncidentReport> => (await auth(http().get('/pos/incidents')).expect(200)).body;
  const row = (rep: IncidentReport, id: string | null) => {
    const r = rep.items.find((i) => i.id === id);
    if (!r) throw new Error(`incident ${id} not in report`);
    return r;
  };
  /** حقلٌ واحد في `PATCH` — وما لم يُرسَل يبقى كما هو؛ فلا نلمس بقيةَ ملف منشأة العرض. */
  const setGap = (minutes: number) => auth(http().patch('/company-profile')).send({ posOfflineGapMinutes: minutes });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    tenantPrisma = app.get(TenantPrismaService);

    const login = await http().post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    token = login.body.accessToken;
    companyId = login.body.user.companyId;
    productId = (await auth(http().post('/products')).send({ name: `عصير برتقال ${suffix}`, price: 12 }).expect(201)).body.id;
    shiftId = (await auth(http().post('/pos/shifts')).send({ openingFloat: 100 }).expect(201)).body.id;

    const profile = (await auth(http().get('/company-profile')).expect(200)).body;
    expect(profile.posOfflineGapMinutes).toBe(2); // الافتراض دقيقتان (ق-٢٠١/٢).
  }, 60000);

  afterAll(async () => {
    await setGap(2);
    await auth(http().post(`/pos/shifts/${shiftId}/close`)).send({ declaredClosing: 0 });
    // الصادرُ لا يُحذف عبر الواجهة (ق-٩٤٣) — والتنظيفُ بمسارٍ في سياق المستأجر (ق-٩٥٣).
    await purgeInvoicesForTest(tenantPrisma, companyId, invoiceIds);
    await auth(http().delete(`/products/${productId}`));
    await auth(http().delete(`/trash/products/${productId}`));

    /**
     * 🔴 **وما استُنبط يُحذف مع ما أنشأه** (`ق-٤٩٥`).
     *
     * **الفاتورةُ تُحذف والواقعةُ تبقى**: `onDelete: SetNull` يفكّ الرابط ولا
     * يمسّها، **ولا مسارَ في الواجهة يحذف واقعة** — فهي مستنبَطة لا مُدخَلة.
     *
     * **والمقيس** (2026-09-10): **٦١ واقعةً متراكمة عبر ثلاثة أيام**، **٢٦
     * منها من تشغيلات يومٍ واحد**.
     *
     * ⚠️ **والعشوائيةُ دفاعٌ يضعف بالتراكم**: الأساسُ يُعشَّى في أربعَ عشرةَ
     * ساعة، **ونافذةُ التشغيل الواحد تمتدّ ثلاثَ ساعاتٍ** (الحالةُ ② قبل
     * الأساس بـ١٨٠ دقيقة) — **فاحتمالُ التقاطع مع واقعةٍ متروكة يقترب من
     * اليقين كلّما تراكمت**. **فالتنظيفُ حتميٌّ والعشوائيةُ للتزامن وحده.**
     *
     * ⚠️ **ولا يُمسّ إلا ما أنشأته هذه المجموعة**: **اليومُ الصناعيّ
     * `2026-08-20` لها وحدها** — بنصّ تعليقها عند اختيار الأساس. **وحذفٌ
     * أوسعُ يمحو وقائعَ منشأةٍ حقيقية، وهي بياناتٌ لا أثرُ تشغيل.**
     */
    const dayStart = new Date(Date.UTC(2026, 7, 20, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(2026, 7, 21, 0, 0, 0));
    await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.posOfflineIncident.deleteMany({ where: { startedAt: { gte: dayStart, lt: dayEnd } } }),
    );

    await app.close();
  });

  it('① ثلاث بيوعٍ رنّت متتابعةً وزُومنت مبعثرةً — واقعةٌ واحدة من أزمنة الرنّ لا من ترتيب الوصول (ق-٢٠١/٣)', async () => {
    // الوصول: الأحدث أولاً، ثم الأقدم، ثم الأوسط.
    const s2 = await sync(at(2));
    const s0 = await sync(at(0));
    const s1 = await sync(at(1));

    const ids = await Promise.all([s0, s1, s2].map((s) => incidentOf(s.id)));
    expect(ids[0]).toBeTruthy();
    expect(new Set(ids).size).toBe(1);

    const rep = await report();
    expect(rep.inferred).toBe(true);
    expect(rep.gapMinutes).toBe(2);
    const inc = row(rep, ids[0]);
    expect(new Date(inc.startedAt).toISOString()).toBe(at(0));
    expect(new Date(inc.endedAt).toISOString()).toBe(at(2));
    expect(inc.durationMinutes).toBe(2);
    expect(inc.salesCount).toBe(3);
    expect(inc.gapMinutes).toBe(2);
    const firstSyncedAt = new Date(inc.firstSyncedAt).getTime();
    expect(firstSyncedAt).toBeGreaterThanOrEqual(startedTestAt - 1000);
    expect(firstSyncedAt).toBeLessThanOrEqual(Date.now() + 1000);
  }, 60000);

  it('② بيعٌ رنَّ قبلها بثلاث ساعات — واقعةٌ مستقلة لا تمتدّ الأولى إليه', async () => {
    const s = await sync(at(-180));
    const id = await incidentOf(s.id);
    expect(id).toBeTruthy();
    const rep = await report();
    const inc = row(rep, id);
    expect(inc.salesCount).toBe(1);
    expect(inc.durationMinutes).toBe(0);
    expect(new Date(inc.startedAt).toISOString()).toBe(at(-180));
    expect(new Date(inc.endedAt).toISOString()).toBe(at(-180));
    // والأولى لم تتغيّر.
    const first = rep.items.find((i) => new Date(i.startedAt).toISOString() === at(0));
    expect(first?.salesCount).toBe(3);
    expect(first?.id).not.toBe(id);
  }, 60000);

  it('③ بيعٌ حيٌّ، وبيعٌ مزامَن تأخّرُه دون الحدّ — لا واقعة: بطءُ شبكةٍ لا غيابُها', async () => {
    const live = await auth(http().post('/pos/sales')).send({ lines: [{ productId, quantity: 1 }], paymentMethod: 'CASH' }).expect(201);
    invoiceIds.push(live.body.id);
    const recent = await sync(new Date(Date.now() - 30_000).toISOString());
    expect(await incidentOf(live.body.id)).toBeNull();
    expect(await incidentOf(recent.id)).toBeNull();
  }, 60000);

  it('④ جَسْر: بيعٌ متأخّر يقع بين واقعتَين فيدمجهما — والبيوع تُعاد إلى الباقية قبل حذف المدموجة', async () => {
    const a = await sync(at(10));
    const b = await sync(at(13));
    const ia = await incidentOf(a.id);
    const ib = await incidentOf(b.id);
    expect(ia).toBeTruthy();
    expect(ib).toBeTruthy();
    expect(ia).not.toBe(ib); // ثلاث دقائق بينهما > حدّ الدقيقتَين.

    const bridge = await sync(at(11.5));
    const ids = await Promise.all([a, b, bridge].map((s) => incidentOf(s.id)));
    expect(new Set(ids).size).toBe(1);
    expect(ids[0]).toBe(ia); // الباقية أولاهما زمناً.

    const rep = await report();
    expect(rep.items.find((i) => i.id === ib)).toBeUndefined(); // المدموجة حُذفت — بعد إعادة بيوعها.
    const inc = row(rep, ia);
    expect(new Date(inc.startedAt).toISOString()).toBe(at(10));
    expect(new Date(inc.endedAt).toISOString()).toBe(at(13));
    expect(inc.durationMinutes).toBe(3);
    expect(inc.salesCount).toBe(3);
  }, 60000);

  it('⑤ حدُّ الفصل إعدادٌ للمنشأة لا ثابت (ق-٢٠١/٢أ): يُحفظ في الملف، يظهر في التقرير، ويغيّر الاستنتاج', async () => {
    await setGap(0).expect(400);
    await setGap(1441).expect(400);
    expect((await setGap(10).expect(200)).body.posOfflineGapMinutes).toBe(10);
    expect((await report()).gapMinutes).toBe(10);

    // تأخّرُ خمس دقائق: لا انقطاعَ بحدّ عشر …
    const under = await sync(new Date(Date.now() - 5 * 60_000).toISOString());
    expect(await incidentOf(under.id)).toBeNull();

    // … وانقطاعٌ بحدّ دقيقتَين — والواقعة تحمل حدَّ استنتاجها هي.
    await setGap(2).expect(200);
    const over = await sync(new Date(Date.now() - 5 * 60_000).toISOString());
    const id = await incidentOf(over.id);
    expect(id).toBeTruthy();
    const rep = await report();
    expect(rep.gapMinutes).toBe(2);
    expect(row(rep, id).gapMinutes).toBe(2);
  }, 60000);

  it('⑥ ثلاث بيوعٍ تصل متزامنةً لا متتابعة — واقعةٌ واحدة لا ثلاث (قياسُ التزامن لا افتراضُ الترتيب)', async () => {
    const [c1, c0, c2] = await Promise.all([sync(at(31)), sync(at(30)), sync(at(32))]);
    const ids = await Promise.all([c0, c1, c2].map((s) => incidentOf(s.id)));
    expect(ids[0]).toBeTruthy();
    expect(new Set(ids).size).toBe(1);
    const inc = row(await report(), ids[0]);
    expect(new Date(inc.startedAt).toISOString()).toBe(at(30));
    expect(new Date(inc.endedAt).toISOString()).toBe(at(32));
    expect(inc.salesCount).toBe(3);
  }, 60000);
});
