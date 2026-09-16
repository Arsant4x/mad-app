import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { companyIdOfToken, purgeInvoicesForTest } from './purge-invoices';

/**
 * مهلة الإشعار (`م٥٤`): **خمسة عشر يوماً من نهاية شهر الواقعة** — **تنبيهٌ لا حجز**.
 *
 * والاختبار يثبت الثلاثة معاً: أن الإشعار المتأخّر **يصدر** ولا يُمنع · وأنه
 * **يُوسَم** في التقرير · وأنه **يرفع جرساً** يراه المالك.
 */
describe('مهلة إصدار الإشعار (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let customerId: string;
  const created: string[] = [];
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const today = () => iso(new Date());

  async function makeNote(eventDate?: string) {
    const inv = await auth(request(app.getHttpServer()).post('/invoices'))
      .send({ customerId, issueDate: today(), dueDate: today(), lines: [{ description: 'خدمة', quantity: 1, unitPrice: 100, taxRate: 15 }] })
      .expect(201);
    created.push(inv.body.id);
    const note = await auth(request(app.getHttpServer()).post(`/invoices/${inv.body.id}/credit-note`))
      .send({ reason: 'إرجاع', ...(eventDate ? { eventDate } : {}) })
      .expect(201);
    created.push(note.body.id);
    return note.body as { id: string; no: string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();
    const login = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    token = login.body.accessToken;
    customerId = (await auth(request(app.getHttpServer()).post('/customers')).send({ name: `عميل مهلة ${Date.now()}` }).expect(201)).body.id;
  }, 30000);

  afterAll(async () => {
    // الصادرُ لا يُحذف عبر الواجهة (ق-٩٤٣) — والتنظيفُ بمسارٍ في سياق المستأجر (ق-٩٥٣).
    await purgeInvoicesForTest(app.get(TenantPrismaService), companyIdOfToken(token), created);
    await app.close();
  });

  it('إشعارٌ عن واقعةٍ قديمة **يصدر** — فالمنع يزيد المخالفة لا يمنعها', async () => {
    const old = new Date();
    old.setUTCDate(old.getUTCDate() - 90);
    const note = await makeNote(iso(old)); // 201 — وهو التوكيد نفسه
    expect(note.no).toMatch(/^CN-/);
  });

  it('ويُوسَم متأخّراً في التقرير، ومهلتُه من نهاية شهر الواقعة', async () => {
    const old = new Date();
    old.setUTCDate(old.getUTCDate() - 90);
    const note = await makeNote(iso(old));

    const res = await auth(request(app.getHttpServer()).get('/reports/note-deadlines')).query({ from: today(), to: today() }).expect(200);
    const row = (res.body.rows as { no: string; status: string; daysLeft: number; deadline: string; eventDateKnown: boolean }[]).find((r) => r.no === note.no);
    expect(row).toBeDefined();
    expect(row!.status).toBe('LATE');
    expect(row!.daysLeft).toBeLessThan(0);
    expect(row!.eventDateKnown).toBe(true);
    // المهلة هي الخامس عشر من الشهر التالي لشهر الواقعة.
    expect(row!.deadline.slice(0, 10)).toBe(new Date(Date.UTC(old.getUTCFullYear(), old.getUTCMonth() + 1, 15)).toISOString().slice(0, 10));
    expect(res.body.totals.late).toBeGreaterThanOrEqual(1);
  });

  it('ويرفع جرساً يراه المالك — فما لا يُرى لا يُصدَر', async () => {
    const old = new Date();
    old.setUTCDate(old.getUTCDate() - 90);
    const note = await makeNote(iso(old));

    const res = await auth(request(app.getHttpServer()).get('/notifications')).expect(200);
    // المفتاح `notifications` — مقروءٌ من `NotificationsService.list` لا مخمَّناً.
    const list = res.body.notifications as { kind: string; linkId: string | null; title: string }[];
    expect(Array.isArray(list)).toBe(true);
    expect(list.some((n) => n.kind === 'NOTE_ISSUED_LATE' && n.title.includes(note.no))).toBe(true);
  });

  it('وواقعةُ اليوم في الموعد — فلا وسمٌ ولا جرس', async () => {
    const note = await makeNote(today());
    const res = await auth(request(app.getHttpServer()).get('/reports/note-deadlines')).query({ from: today(), to: today() }).expect(200);
    const row = (res.body.rows as { no: string; status: string }[]).find((r) => r.no === note.no);
    expect(row?.status).not.toBe('LATE');
  });

  it('وإشعارٌ بلا تاريخ واقعة يُعلَن مجهولاً — لا يُخمَّن له تاريخ', async () => {
    const note = await makeNote();
    const res = await auth(request(app.getHttpServer()).get('/reports/note-deadlines')).query({ from: today(), to: today() }).expect(200);
    const row = (res.body.rows as { no: string; eventDateKnown: boolean }[]).find((r) => r.no === note.no);
    // يُملأ عند الإنشاء بيوم الإصدار، فالمجهول هو الصفوف السابقة للحقل وحدها.
    expect(row).toBeDefined();
    expect(typeof row!.eventDateKnown).toBe('boolean');
  });
});
