import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';

/**
 * الأبعاد التحليلية على سطر القيد — الموجة ٣ من L0.
 *
 * ## ما تحميه هذه البوابة
 *
 * أن يُقرأ الدفتر **بالعقار والوحدة** لا بالحساب وحده، فتُعرف ربحية وحدةٍ
 * بعينها. والشرط الذي يجعلها تصمد: **البُعد مشتقٌّ لا مكتوب** — يُحسب في
 * `createJournalEntry` وحدها من الوحدة المصدر، فلا يُملأ في ستة عشر موضعاً
 * ويُنسى في السابع عشر.
 *
 * ## ولماذا بوابةٌ فوق الحارس الحيّ
 *
 * `dimension-coverage.live.spec.ts` يمسح ما في القاعدة — وعلى قاعدةٍ لم يُنشأ
 * فيها قيدٌ بعد الموجة **يمرّ وقد فحص صفر سطر**. فهو يحرس الانحدار لا يثبت
 * السلوك. وهذه تُنشئ القيد بنفسها، فتقيس ما يحدث فعلاً.
 */
describe('الأبعاد التحليلية على سطر القيد (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let propertyId: string;
  let unitId: string;
  let contractId: string;

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  function auth(req: request.Test) {
    return req.set('Authorization', `Bearer ${token}`);
  }

  /** أسطر القيد المرتبط بمذكّرةٍ بعينها — تُقرأ من الواجهة لا من القاعدة. */
  async function linesOfEntryMatching(fragment: string) {
    // ⚠️ الشكل `{ items, total, page, pageSize }` **قُرئ من الخدمة** لا افتُرض
    // مصفوفةً. و`search` يطابق المذكّرة خادميّاً — فلا يُعتمد على أن يقع القيد
    // في الصفحة الأولى (و`pageSize` مسقوفٌ بمئة عمداً، فالتصفّح ليس مخرجاً).
    const res = await auth(request(app.getHttpServer()).get('/journal').query({ search: fragment })).expect(200);
    const entries = (res.body as {
      items: { memo: string; lines: { id: string; unitId: string | null; propertyId: string | null; branchId: string | null }[] }[];
    }).items;
    const entry = entries.find((e) => e.memo.includes(fragment));
    return { entry, lines: entry?.lines ?? [] };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'demo-company-a', password: 'DemoPass123!' });
    token = login.body.accessToken;

    const property = await auth(request(app.getHttpServer()).post('/properties'))
      .send({ name: `عقار الأبعاد ${suffix}`, ownership: 'owned' })
      .expect(201);
    propertyId = property.body.id;

    const unit = await auth(request(app.getHttpServer()).post('/units'))
      .send({ propertyId, unitNo: `DIM-${suffix}`, type: 'سكني', rentMonthly: 1000 })
      .expect(201);
    unitId = unit.body.id;

    const contract = await auth(request(app.getHttpServer()).post('/contracts'))
      .send({ classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE', unitId, tenant: `مستأجر الأبعاد ${suffix}`, value: 12000, cycle: 'monthly', start: '2025-01-01', end: '2025-12-31' })
      .expect(201);
    contractId = contract.body.id;
  }, 90000);

  afterAll(async () => {
    await app.close();
  });

  it('⭐ دفعة إيجار: كل سطرٍ يحمل الوحدة — والعقار مشتقٌّ منها لا مُمرَّراً', async () => {
    await auth(request(app.getHttpServer()).post(`/contracts/${contractId}/payments`))
      .send({ date: '2025-02-01', amount: 1000, method: 'CASH' })
      .expect(201);

    // اللاحقة تقع في اسم المستأجر داخل المذكّرة (`… — عقد <رقم مولَّد> — <مستأجر>`)
    // — ورقمُ العقد مولَّدٌ لا يعرفه هذا الاختبار.
    const { entry, lines } = await linesOfEntryMatching(suffix);
    // المسبار يُفحص: قيدٌ لم يوجد يجعل كل ما بعده بلا معنى.
    expect(entry).toBeDefined();
    expect(lines.length).toBeGreaterThan(0);

    for (const line of lines) {
      expect(line.unitId).toBe(unitId);
      // ⭐ **الفارق كله هنا**: العقار لم يُمرَّر من المستدعي إطلاقاً — قُرئ من
      // `Unit.propertyId` داخل `createJournalEntry`. فمطابقتُه تثبت الاشتقاق،
      // لا مجرّد وصول قيمة.
      expect(line.propertyId).toBe(propertyId);
    }
  }, 60000);

  it('⭐ قيدٌ يدويّ لا مصدر له: البُعد فارغ — لا صفر ولا افتراضي', async () => {
    const accounts = await auth(request(app.getHttpServer()).get('/accounts')).expect(200);
    const list = accounts.body as { id: string; code: string }[];
    const cash = list.find((a) => a.code === '1100') ?? list[0];
    const other = list.find((a) => a.id !== cash.id)!;

    const memo = `قيد يدوي بلا مصدر ${suffix}`;
    await auth(request(app.getHttpServer()).post('/journal'))
      .send({
        date: '2025-04-01',
        memo,
        lines: [
          { accountId: cash.id, debit: 100, credit: 0 },
          { accountId: other.id, debit: 0, credit: 100 },
        ],
      })
      .expect(201);

    const { entry, lines } = await linesOfEntryMatching(memo);
    expect(entry).toBeDefined();
    expect(lines.length).toBe(2);

    // الفراغ يقول «لا انتماء». وأي قيمةٍ هنا تنسب قيداً عامّاً إلى وحدةٍ لم
    // تنشئه، فتلوّث كل تقرير ربحيةٍ بعده بلا أثرٍ يُقتفى.
    for (const line of lines) {
      expect(line.unitId).toBeNull();
      expect(line.propertyId).toBeNull();
    }
  }, 60000);
});
