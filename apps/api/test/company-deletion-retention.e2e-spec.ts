import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { RETENTION_YEARS } from '../src/companies/company-movement.service';
import { CompanyArchiveService } from '../src/export/company-archive.service';
import { FilesService } from '../src/files/files.service';
import { PersonalDataErasureService } from '../src/deletion-requests/personal-data-erasure.service';
import { hardDeleteCompanyForTest } from './hard-delete-company';
import { grantPlatformDecision, releaseSecondHand } from './platform-decision';

// ⏱️ ميزانيةُ الحزمة: أربعُ منشآتٍ تُغلق كلٌّ بنسختها ثم كنسٌ يعبر المغلقات — ثلاثةُ أضعاف ما يلزم عادةً.
jest.setTimeout(300000);

/**
 * `ق-١٤٧٠` — **الدعوى «و»: حذفُ المنشأة وفيها مستنداتٌ تحت الحفظ** (التوجيه ٢٦٦ §٤و — «وأثبته بمحاولة»).
 *
 * **الدعوى نفسُها ساقطةٌ بالمحاولة** (③): لا مسارَ منتَجٍ يحذف منشأةً إلا الكنسُ عند `retainUntil`، وأجلُ منشأةٍ
 * فيها فاتورةٌ `closedAt + 10` سنوات — فالكنسُ بعد النافذة لا يمسّها. **وفجوتان قائمتان بالقراءة** أُثبتتا هنا
 * بالمحاولة وأُغلقتا:
 *   ① **سجلّاتُ العقار بلا عقود** — ليست «حركة» فأُغلقت المنشأةُ بـ`90` يوماً، وكان الكنسُ يحذفها ببلاغاتها.
 *   ② **سباقُ الموافقة** — فاتورةٌ تصدر أثناء إنتاج النسخة (المنشأةُ ما زالت نشطة) لا يراها القياسُ الذي سبقها.
 * والعلاجُ: الأجلُ من **مصادر الحفظ** (`retention()`)، **والكنسُ يعيد قياسَه لحظةَ الحذف** — كما تفعل السلّة.
 * ④ **ضابط**: منشأةٌ انقضى حفظُها فعلاً تُحذف — فالإصلاحُ لا يمنع كلَّ حذف.
 */
describe('حذفُ المنشأة لا يمسّ ما تحت الحفظ — والكنسُ يعيد القياسَ لحظةَ الحذف (ق-١٤٧٠)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let sweeper: PersonalDataErasureService;
  let adminToken: string;
  let templateId: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const made: string[] = [];
  const day = 24 * 3600 * 1000;
  const today = new Date().toISOString().slice(0, 10);
  const http = () => request(app.getHttpServer());
  const admin = (r: request.Test) => r.set('Authorization', `Bearer ${adminToken}`);

  let seq = 0;
  async function makeCompany(): Promise<{ id: string; token: string; username: string }> {
    const username = `ret-co-${suffix}-${seq++}`;
    const res = await admin(http().post('/companies'))
      .send({ username, password: 'RetPass123!', orgName: `منشأة حفظ ${username}`, permissionTemplateId: templateId, subEnd: '2030-01-01' })
      .expect(201);
    made.push(res.body.id);
    const login = await http().post('/auth/login').send({ username, password: 'RetPass123!' }).expect(200);
    return { id: res.body.id, token: login.body.accessToken, username };
  }

  /** طلبُ الحذف ثم إقرارُه بيدين (`ق-١٣١٨`) — ويعيد ردَّ الموافقة. */
  async function close(co: { token: string }) {
    const filed = await http().post('/deletion-request').set('Authorization', `Bearer ${co.token}`).send({ reason: 'إغلاق النشاط' }).expect(201);
    await grantPlatformDecision(app, 'ACCOUNT_ERASURE', filed.body.id, adminToken);
    return (await admin(http().post(`/admin/deletion-requests/${filed.body.id}/approve`)).send({ note: 'أُغلق' }).expect(201)).body;
  }

  const companyRow = (id: string) => prisma.company.findUnique({ where: { id }, select: { status: true, closedAt: true, retainUntil: true } });
  const yearsBetween = (from: Date, to: Date) => to.getUTCFullYear() - from.getUTCFullYear();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    sweeper = app.get(PersonalDataErasureService);
    adminToken = (
      await http().post('/auth/login').send({ username: process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME ?? 'Arsan', password: process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD })
    ).body.accessToken;
    const templates = await admin(http().get('/templates')).expect(200);
    templateId = (templates.body as { id: string; isAllScreens: boolean }[]).find((t) => t.isAllScreens)!.id;
  });

  afterAll(async () => {
    for (const id of made) {
      if (await prisma.company.findUnique({ where: { id }, select: { id: true } })) await hardDeleteCompanyForTest(prisma, id);
    }
    const files = app.get(FilesService);
    const archived = await prisma.accountDeletionRequest.findMany({ where: { companyId: { in: made }, archiveProducedAt: { not: null } } });
    for (const row of archived) {
      for (const f of ((row.archiveManifest as { files?: { key: string }[] } | null)?.files ?? [])) await files.deleteArchiveObject(f.key).catch(() => undefined);
    }
    await prisma.accountDeletionRequest.deleteMany({ where: { companyId: { in: made } } });
    await releaseSecondHand(app);
    await app.close();
  });

  it('① سجلّاتُ العقار بلا عقود تُحفظ إحدى عشرة سنةً — عند الإغلاق، وعند الكنس ولو حُسب أجلُها قبلُ تسعين يوماً', async () => {
    const co = await makeCompany();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
    const propertyId = (await auth(http().post('/properties')).send({ name: `عقار بلا عقود ${suffix}`, ownership: 'owned' }).expect(201)).body.id as string;
    const maintenanceId = (await auth(http().post('/maintenance')).send({ propertyId, title: 'بلاغٌ تحت الحفظ', reportedAt: '2026-03-01' }).expect(201)).body.id as string;

    const approved = await close(co);
    expect(approved.outcome).toBe('CLOSED');
    // لا «حركة» — فالمعيارُ للإغلاق لم يتغيّر؛ والأجلُ من مصادر الحفظ.
    expect(approved.movement).toEqual([]);
    const closed = (await companyRow(co.id))!;
    expect(yearsBetween(closed.closedAt!, closed.retainUntil!)).toBe(RETENTION_YEARS.realEstate);

    // أجلٌ قديمٌ حُسب بالمعيار الأضيق (تسعون يوماً) وانقضى — الكنسُ يعيد القياسَ فلا يحذف، ويمدّ الأجل.
    await prisma.company.update({ where: { id: co.id }, data: { closedAt: new Date(Date.now() - 91 * day), retainUntil: new Date(Date.now() - day) } });
    const result = await sweeper.sweep();
    expect(result.deleted).not.toContain(co.id);
    expect(result.retained).toContain(co.id);
    const after = (await companyRow(co.id))!;
    expect(after.status).toBe('CLOSED');
    expect(yearsBetween(after.closedAt!, after.retainUntil!)).toBe(RETENTION_YEARS.realEstate);
    const stillThere = await tenantPrisma.runInTenantContext(co.id, (tx) => tx.maintenanceRequest.findUnique({ where: { id: maintenanceId }, select: { id: true } }));
    expect(stillThere?.id).toBe(maintenanceId);
  });

  it('② فاتورةٌ تصدر أثناء إنتاج النسخة — الكنسُ يراها لحظةَ الحذف فلا يحذف المنشأةَ ولا قيدَها', async () => {
    const co = await makeCompany();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
    const customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل السباق ${suffix}` }).expect(201)).body.id as string;

    // الطُّعم: التداخلُ مفروضٌ لا منتظَر (`§8.8` الوجه الثالث) — الفاتورةُ تُكتب بعد اللقطة وقبل ختم الإغلاق.
    const archive = app.get(CompanyArchiveService);
    const original = archive.produce.bind(archive);
    let raced: string | null = null;
    archive.produce = (async (...args: Parameters<CompanyArchiveService['produce']>) => {
      const manifest = await original(...args);
      const inv = await auth(http().post('/invoices'))
        .send({ customerId, issueDate: today, dueDate: today, lines: [{ description: 'بيعٌ أثناء الموافقة', quantity: 1, unitPrice: 100, taxRate: 15 }] })
        .expect(201);
      raced = inv.body.id as string;
      return manifest;
    }) as CompanyArchiveService['produce'];
    try {
      const approved = await close(co);
      expect(approved.outcome).toBe('CLOSED');
    } finally {
      archive.produce = original;
    }
    // وقوعُ الكسر أوّلاً (`§8.8`): الفاتورةُ قائمةٌ تحت سياق المنشأة.
    expect(raced).not.toBeNull();
    const invoices = await tenantPrisma.runInTenantContext(co.id, (tx) => tx.invoice.count());
    expect(invoices).toBe(1);

    // الأجلُ المختوم حُسب قبل الفاتورة — فأُزيح الإغلاقُ حتى يستحقّه الكنس.
    await prisma.company.update({ where: { id: co.id }, data: { closedAt: new Date(Date.now() - 91 * day), retainUntil: new Date(Date.now() - day) } });
    const result = await sweeper.sweep();
    expect(result.deleted).not.toContain(co.id);
    expect(result.retained).toContain(co.id);
    const after = (await companyRow(co.id))!;
    expect(yearsBetween(after.closedAt!, after.retainUntil!)).toBe(RETENTION_YEARS.books);
    const kept = await tenantPrisma.runInTenantContext(co.id, (tx) => tx.invoice.findUnique({ where: { id: raced! }, select: { id: true, journalEntryId: true } }));
    expect(kept?.id).toBe(raced);
  });

  it('③ الدعوى نفسُها ساقطة: منشأةٌ فيها فاتورةٌ قبل الطلب أجلُها عشرُ سنوات — والكنسُ بعد النافذة لا يمسّها', async () => {
    const co = await makeCompany();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
    const customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل الضابط ${suffix}` }).expect(201)).body.id as string;
    await auth(http().post('/invoices'))
      .send({ customerId, issueDate: today, dueDate: today, lines: [{ description: 'بيعٌ قبل الطلب', quantity: 1, unitPrice: 100, taxRate: 15 }] })
      .expect(201);
    const approved = await close(co);
    expect(approved.movement.length).toBeGreaterThan(0);
    const closed = (await companyRow(co.id))!;
    expect(yearsBetween(closed.closedAt!, closed.retainUntil!)).toBe(RETENTION_YEARS.books);

    // بعد النافذة: يُزاح الإغلاقُ وحدَه (لا ساعةُ الكنس — فتلك تمسّ منشآتِ غيرِ هذه الحزمة) والأجلُ كما خُتم.
    await prisma.company.update({ where: { id: co.id }, data: { closedAt: new Date(Date.now() - 91 * day) } });
    const result = await sweeper.sweep();
    expect(result.deleted).not.toContain(co.id);
    expect(await companyRow(co.id)).not.toBeNull();
  });

  it('④ ضابط: ما انقضى حفظُه فعلاً يُحذف — فالقياسُ لحظةَ الحذف لا يمنع كلَّ حذف', async () => {
    const co = await makeCompany();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
    const customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل منقضٍ ${suffix}` }).expect(201)).body.id as string;
    await auth(http().post('/invoices'))
      .send({ customerId, issueDate: today, dueDate: today, lines: [{ description: 'بيعٌ قديم', quantity: 1, unitPrice: 100, taxRate: 15 }] })
      .expect(201);
    await close(co);
    // أُغلقت قبل اثنتي عشرة سنة — فالأجلُ المُعاد قياسُه (عشرُ سنوات) ماضٍ.
    await prisma.company.update({ where: { id: co.id }, data: { closedAt: new Date(Date.now() - 12 * 366 * day), retainUntil: new Date(Date.now() - day) } });
    const result = await sweeper.sweep();
    expect(result.retained).not.toContain(co.id);
    expect(result.deleted).toContain(co.id);
    expect(await companyRow(co.id)).toBeNull();
  });

  /**
   * ⑤ ⚖️ **وملفّاتُها في المخزن تُحذف معها** (توجيه ٢٧٥ · القاعدةُ الدائمة ٣٧ · مراجعةُ السؤال ٢٤٣).
   *
   * كان الحذفُ النهائيّ يحذف الصفوفَ وملفّاتِ النسخة وحدَها، فتبقى المرفقاتُ (ومنها صورُ داخل المسكن) في المخزن بلا
   * صفٍّ يشير إليها بعد انقضاء الحفظ (م١٨ من نظام حماية البيانات). **ووقوعُ الطُّعم أوّلاً** (`§8.8`): الملفّان مقروءان
   * قبل الكنس، فغيابُهما بعده أثرُ الحذف لا خطأُ رفع. والمخزنُ الحسّاس معهما لأنه تحت مجال المنشأة نفسِه.
   */
  it('⑤ وما انقضى حفظُه يُحذف بملفّاته من المخزن، العاديِّ والحسّاس', async () => {
    const co = await makeCompany();
    const auth = (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
    const customerId = (await auth(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل الملفّات ${suffix}` }).expect(201)).body.id as string;
    await auth(http().post('/invoices'))
      .send({ customerId, issueDate: today, dueDate: today, lines: [{ description: 'بيعٌ قديم', quantity: 1, unitPrice: 100, taxRate: 15 }] })
      .expect(201);

    const files = app.get(FilesService);
    const pdf = Buffer.from('%PDF-1.4 ملفُّ اختبار الحذف');
    const plain = await files.upload(co.id, { originalname: 'erase-me.pdf', mimetype: 'application/pdf', buffer: pdf, size: pdf.length });
    const sensitive = await files.uploadSensitive(co.id, { originalname: 'erase-me-too.pdf', mimetype: 'application/pdf', buffer: pdf, size: pdf.length });
    expect((await files.readPlain(co.id, plain.key)).equals(pdf)).toBe(true);
    expect((await files.readSensitive(co.id, sensitive.key)).equals(pdf)).toBe(true);

    await close(co);
    await prisma.company.update({ where: { id: co.id }, data: { closedAt: new Date(Date.now() - 12 * 366 * day), retainUntil: new Date(Date.now() - day) } });
    const result = await sweeper.sweep();
    expect(result.deleted).toContain(co.id);

    await expect(files.readPlain(co.id, plain.key)).rejects.toThrow();
    await expect(files.readSensitive(co.id, sensitive.key)).rejects.toThrow();
  });
});
