import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { companyIdOfToken, purgeInvoicesForTest } from './purge-invoices';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';

/**
 * Proves invoices/purchases auto-post to the ledger through the real chart
 * of accounts seeded for demo-company-a (1200/4100/2200/2100/5300 — see
 * src/accounts/default-chart.ts, which the seed now draws from), and that
 * editing/deleting the source document reverses/reposts the linked journal
 * entry rather than leaving it to drift. Complements
 * journal-tenant-isolation.e2e-spec.ts (which covers manual entries) and
 * default-chart.e2e-spec.ts, which covers the other end: a company created
 * seconds ago posting its first invoice with zero manual setup.
 */
describe('Invoice/purchase auto-posting (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let customerId: string;
  let supplierId: string;
  let accountByCode: Record<string, { id: string; balance: string }>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    // ⚠️ مُرشِّح الترجمة **كان ناقصاً هنا**، فكانت الأخطاء تعود مفاتيح خام
    // (`purchases.lines_total_mismatch {…}`) بينما الإنتاج يعيد عربية.
    // ولم يظهر لأن لا توكيد في هذه المجموعة كان يقرأ نصّ خطأ. وأُضيف كي
    // تفحص البوابة **ما يراه المستخدم** لا ما يراه المطوّر.
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const login = await request(app.getHttpServer()).post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    token = login.body.accessToken;

    // ②A1: عميلٌ يصنعه الملفّ لا «أوّلُ ما تجده».
    const customers = await request(app.getHttpServer()).post('/customers').set('Authorization', `Bearer ${token}`).send({ kind: 'NATURAL', name: `عميل الملف ${Date.now()}` }).expect(201);
    customerId = customers.body.id;
    const suppliers = await request(app.getHttpServer()).get('/suppliers').set('Authorization', `Bearer ${token}`).expect(200);
    supplierId = suppliers.body[0].id;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  async function balances() {
    const res = await request(app.getHttpServer()).get('/accounts').set('Authorization', `Bearer ${token}`).expect(200);
    accountByCode = Object.fromEntries(res.body.map((a: { code: string; id: string; balance: string }) => [a.code, a]));
    return accountByCode;
  }

  it('[SPEC 3.4 4.4] posts a new invoice to A/R, revenue, and VAT, then reverses on delete', async () => {
    const before = await balances();

    const inv = await request(app.getHttpServer())
      .post('/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId,
        issueDate: '2026-07-20',
        dueDate: '2026-08-20',
        lines: [{ description: 'auto-post test', quantity: 1, unitPrice: 100, taxRate: 15 }],
      })
      .expect(201);
    expect(inv.body.journalEntryId).not.toBeNull();

    const after = await balances();
    expect(Number(after['1200'].balance) - Number(before['1200'].balance)).toBeCloseTo(115);
    expect(Number(after['4100'].balance) - Number(before['4100'].balance)).toBeCloseTo(100);
    expect(Number(after['2200'].balance) - Number(before['2200'].balance)).toBeCloseTo(15);

    // الصادرُ لا يُحذف عبر الواجهة (ق-٩٤٣) — والتنظيفُ بمسارٍ في سياق المستأجر يعكس قيدَه (ق-٩٥٣).
    await purgeInvoicesForTest(app.get(TenantPrismaService), companyIdOfToken(token), [inv.body.id]);

    const restored = await balances();
    expect(Number(restored['1200'].balance)).toBeCloseTo(Number(before['1200'].balance));
    expect(Number(restored['4100'].balance)).toBeCloseTo(Number(before['4100'].balance));
    expect(Number(restored['2200'].balance)).toBeCloseTo(Number(before['2200'].balance));

    // The auto-entry went with it — can't be found under the invoice's old id.
    await request(app.getHttpServer()).delete(`/journal/${inv.body.journalEntryId}`).set('Authorization', `Bearer ${token}`).expect(404);
  });

  it('refuses to edit an issued invoice — the first posting stays (ق-٩٤٣)', async () => {
    const before = await balances();

    const inv = await request(app.getHttpServer())
      .post('/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId, issueDate: '2026-07-20', dueDate: '2026-08-20', lines: [{ description: 'v1', quantity: 1, unitPrice: 100, taxRate: 15 }] })
      .expect(201);
    const firstEntryId = inv.body.journalEntryId;

    // ⚖️ كان التعديلُ يعيد الترحيل (يعكس القيدَ الأوّل ويرحّل الثاني) — والحكمُ: الصادرةُ لا
    // تُعدَّل (ق-٩٤٣)، فيُرفض قبل أي كتابة ويبقى القيدُ الأوّل هو القيد.
    const refused = await request(app.getHttpServer())
      .patch(`/invoices/${inv.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ lines: [{ description: 'v2', quantity: 1, unitPrice: 200, taxRate: 15 }] })
      .expect(409);
    expect(refused.body.message).toContain('إشعار دائن');
    const kept = await app
      .get(TenantPrismaService)
      .runInTenantContext(companyIdOfToken(token), (tx) => tx.invoice.findUniqueOrThrow({ where: { id: inv.body.id }, select: { journalEntryId: true } }));
    expect(kept.journalEntryId).toBe(firstEntryId);

    // الأثرُ المرحَّل هو أثرُ v1 وحدَه — لا v2 ولا كلاهما.
    const after = await balances();
    expect(Number(after['1200'].balance) - Number(before['1200'].balance)).toBeCloseTo(115);
    expect(Number(after['4100'].balance) - Number(before['4100'].balance)).toBeCloseTo(100);
    expect(Number(after['2200'].balance) - Number(before['2200'].balance)).toBeCloseTo(15);

    // الصادرُ لا يُحذف عبر الواجهة (ق-٩٤٣) — والتنظيفُ بمسارٍ في سياق المستأجر يعكس قيدَه (ق-٩٥٣).
    await purgeInvoicesForTest(app.get(TenantPrismaService), companyIdOfToken(token), [inv.body.id]);
  }, 30000);

  it('[SPEC 5.3] posts a new purchase to its expense account, VAT, and A/P using the default expense account when no category matches', async () => {
    const before = await balances();

    const pur = await request(app.getHttpServer())
      .post('/purchases')
      .set('Authorization', `Bearer ${token}`)
      .send({ supplierId, date: '2026-07-20', subtotal: 200 })
      .expect(201);
    expect(pur.body.journalEntryId).not.toBeNull();
    expect(Number(pur.body.total)).toBeCloseTo(230);

    const after = await balances();
    expect(Number(after['5300'].balance) - Number(before['5300'].balance)).toBeCloseTo(200);
    /**
     * ⚠️ **تغيّر مقصود في `م٥`.** كان هذا التوكيد يقرأ `2200` ينزل ثلاثين —
     * أي أن **حساباً واحداً يحمل المدخلات والمخرجات معاً**، فرصيده يصير سالباً
     * كلما زادت المشتريات (مقيس على مجسّ حيّ: `-7500`). وحسابُ التزامٍ برصيدٍ
     * سالب ليس التزاماً، والإقرار الضريبي يُقرأ منه.
     *
     * فصارت المدخلات **أصلاً** (`1250`) والمخرجات **التزاماً** (`2200`)،
     * و`2200` **لا يتحرك على الشراء إطلاقاً**.
     */
    expect(Number(after['1250'].balance) - Number(before['1250']?.balance ?? 0)).toBeCloseTo(30);
    expect(Number(after['2200'].balance) - Number(before['2200'].balance)).toBeCloseTo(0);
    expect(Number(after['2100'].balance) - Number(before['2100'].balance)).toBeCloseTo(230);

    await request(app.getHttpServer()).delete(`/purchases/${pur.body.id}`).set('Authorization', `Bearer ${token}`).expect(204);

    const restored = await balances();
    expect(Number(restored['5300'].balance)).toBeCloseTo(Number(before['5300'].balance));
    expect(Number(restored['1250'].balance)).toBeCloseTo(Number(before['1250']?.balance ?? 0));
    expect(Number(restored['2100'].balance)).toBeCloseTo(Number(before['2100'].balance));
  });

  /**
   * بوابة `م٥` — **الشراء المخزنيّ أصلٌ لا تكلفة**.
   *
   * والعطل الذي تعالجه مقيس: شراء بضاعة بـ١٠٠٬٠٠٠ كان يُمدِّن `5100 تكلفة
   * المبيعات` مباشرةً. فبيعُ نصفها يعطي إيراداً بلا تكلفته وتكلفةً بلا
   * إيرادها — **الهامش مقلوب لا غائب**.
   */
  it('⭐ م٥: بندٌ مخزني يُمدِّن المخزون لا تكلفة المبيعات — وطبقةٌ تُنشأ', async () => {
    const before = await balances();

    const wh = await request(app.getHttpServer())
      .post('/warehouses').set('Authorization', `Bearer ${token}`)
      .send({ name: 'مستودع بوابة م٥' }).expect(201);
    const prod = await request(app.getHttpServer())
      .post('/products').set('Authorization', `Bearer ${token}`)
      .send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: 'صنف بوابة م٥', price: 150 }).expect(201);

    const pur = await request(app.getHttpServer())
      .post('/purchases').set('Authorization', `Bearer ${token}`)
      .send({
        supplierId, date: '2026-07-21', subtotal: 1000, category: 'بضاعة',
        warehouseId: wh.body.id,
        lines: [{ description: 'بضاعة للبيع', productId: prod.body.id, quantity: 10, unitPrice: 100 }],
      })
      .expect(201);

    const after = await balances();
    // ⭐ **الرقم هو الفاصل**: المخزون يرتفع ألفاً، و`5100` لا يتحرك.
    expect(Number(after['1300'].balance) - Number(before['1300']?.balance ?? 0)).toBeCloseTo(1000);
    expect(Number(after['5100'].balance) - Number(before['5100'].balance)).toBeCloseTo(0);
    expect(Number(after['2100'].balance) - Number(before['2100'].balance)).toBeCloseTo(1150);

    /**
     * ⚠️ **والاستلام وقع فعلاً** — لا القيد وحده.
     *
     * وصياغةٌ أولى هنا اكتفت بـ`status < 400` على نقطة نهاية، **وهي لا تفحص
     * شيئاً**: تمرّ على استجابةٍ فارغة كما تمرّ على صحيحة (§8.14). فيُقرأ
     * **الرصيد** — عشر وحدات دخلت المستودع.
     */
    const levels = await request(app.getHttpServer())
      .get('/inventory/stock-levels').set('Authorization', `Bearer ${token}`).expect(200);
    const row = (levels.body as { productId: string; qty: string | number }[]).find((r) => r.productId === prod.body.id);
    expect(row).toBeDefined();
    expect(Number(row!.qty)).toBeCloseTo(10);

    await request(app.getHttpServer()).delete(`/purchases/${pur.body.id}`).set('Authorization', `Bearer ${token}`);
  }, 60000);

  it('⭐ م٥: بندٌ مخزني بلا مستودع يُرفض — ولا يُتخطّى بصمت', async () => {
    const prod = await request(app.getHttpServer())
      .post('/products').set('Authorization', `Bearer ${token}`)
      .send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: 'صنف بلا مستودع' }).expect(201);

    // الفرع الافتراضي في البذرة بلا مستودع مربوط — فلا مستودع يُشتقّ.
    const res = await request(app.getHttpServer())
      .post('/purchases').set('Authorization', `Bearer ${token}`)
      .send({
        supplierId, date: '2026-07-22', subtotal: 500, category: 'بضاعة',
        lines: [{ description: 'بضاعة بلا مستودع', productId: prod.body.id, quantity: 5, unitPrice: 100 }],
      });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('مستودع');
  }, 60000);

  /**
   * ⭐⭐ **بوابة `م٦` — ومعيار القبول كما كتبه المالك.**
   *
   * «منشأة اشترت بـ١٠٠٬٠٠٠ وباعت نصفها — يظهر ميزانها: **مخزون ٥٠٬٠٠٠ ·
   * تكلفة مبيعات ٥٠٬٠٠٠ · لا حساب مشتريات**».
   *
   * ⚠️ **و«لا حساب مشتريات» لا يُترجَم توكيداً على الاسم**: لا حساب بهذا
   * الاسم في الدليل أصلاً، فالتوكيد كان سيمرّ على النظام المعطوب. **فيُقاس
   * الرقم**: `5100` يساوي ٥٠٬٠٠٠ لا ١٠٠٬٠٠٠ (§8.14).
   */
  it('⭐⭐ م٦: اشترت بـ١٠٠٬٠٠٠ وباعت نصفها — مخزون ٥٠٬٠٠٠ وتكلفة مبيعات ٥٠٬٠٠٠', async () => {
    const before = await balances();

    const wh = await request(app.getHttpServer())
      .post('/warehouses').set('Authorization', `Bearer ${token}`)
      .send({ name: 'مستودع بوابة م٦' }).expect(201);
    const prod = await request(app.getHttpServer())
      .post('/products').set('Authorization', `Bearer ${token}`)
      .send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: 'صنف بوابة م٦', price: 2000 }).expect(201);

    // البيع يسحب من **مستودع الفرع** — نفس قاعدة الكاشير، فلا مسار ثانٍ.
    //
    // ⚠️ **والفرع يُنشأ إن لم يوجد، لا يُفترض.** كانت هذه البوابة تقرأ
    // `branches.body[0]` وتسقط إن كان فارغاً — فكانت تمرّ على قاعدة التطوير
    // (التي أنشأت اختباراتٌ أخرى فروعاً فيها) وتسقط على **قاعدةٍ معزولة
    // نظيفة**. أي أن خضرتها كانت تعتمد على أثرِ غيرها، وهو اعتمادٌ لا يظهر
    // حتى يُعزَل — وقد ظهر عند أول تشغيلٍ معزول.
    const existing = await request(app.getHttpServer())
      .get('/branches').set('Authorization', `Bearer ${token}`).expect(200);
    const branchId =
      existing.body[0]?.id ??
      (
        await request(app.getHttpServer())
          .post('/branches').set('Authorization', `Bearer ${token}`)
          .send({ name: `فرع بوابة م٦ ${Date.now()}` }).expect(201)
      ).body.id;
    expect(branchId).toBeDefined();
    await request(app.getHttpServer())
      .patch(`/branches/${branchId}`).set('Authorization', `Bearer ${token}`)
      .send({ warehouseId: wh.body.id }).expect(200);

    // ① شراء ١٠٠ وحدة × ١٠٠٠ = ١٠٠٬٠٠٠
    await request(app.getHttpServer())
      .post('/purchases').set('Authorization', `Bearer ${token}`)
      .send({
        supplierId, date: '2026-07-24', subtotal: 100000, category: 'بضاعة',
        warehouseId: wh.body.id, branchId,
        lines: [{ description: 'بضاعة', productId: prod.body.id, quantity: 100, unitPrice: 1000 }],
      })
      .expect(201);

    const afterBuy = await balances();
    expect(Number(afterBuy['1300'].balance) - Number(before['1300']?.balance ?? 0)).toBeCloseTo(100000);
    expect(Number(afterBuy['5100'].balance) - Number(before['5100'].balance)).toBeCloseTo(0);

    // ② بيع النصف — ٥٠ وحدة
    const inv = await request(app.getHttpServer())
      .post('/invoices').set('Authorization', `Bearer ${token}`)
      .send({
        customerId, issueDate: '2026-07-25', dueDate: '2026-07-25', branchId,
        lines: [{ description: 'بيع نصف البضاعة', productId: prod.body.id, quantity: 50, unitPrice: 2000, taxRate: 15 }],
      })
      .expect(201);
    expect(inv.body.id).toBeTruthy();

    const afterSell = await balances();
    // ⭐ **الأرقام هي الفاصل** — والمتوسط أو LIFO كانا سيعطيان غيرها.
    expect(Number(afterSell['1300'].balance) - Number(before['1300']?.balance ?? 0)).toBeCloseTo(50000);
    expect(Number(afterSell['5100'].balance) - Number(before['5100'].balance)).toBeCloseTo(50000);
    // والإيراد لم يُخلط بالتكلفة: قيدان منفصلان.
    expect(Number(afterSell['4100'].balance) - Number(before['4100'].balance)).toBeCloseTo(100000);
  }, 90000);

  it('⭐ م٥: بنودٌ لا تساوي الإجمالي تُرفض — فالبنود صارت مصدر الترحيل', async () => {
    const res = await request(app.getHttpServer())
      .post('/purchases').set('Authorization', `Bearer ${token}`)
      .send({
        supplierId, date: '2026-07-23', subtotal: 900,
        lines: [{ description: 'خدمة', quantity: 1, unitPrice: 1000 }],
      });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('لا يساوي الإجمالي');
  }, 60000);

  it('cannot delete an auto-posted entry directly through the journal endpoint', async () => {
    const inv = await request(app.getHttpServer())
      .post('/invoices')
      .set('Authorization', `Bearer ${token}`)
      .send({ customerId, issueDate: '2026-07-20', dueDate: '2026-08-20', lines: [{ description: 'guard test', quantity: 1, unitPrice: 10, taxRate: 15 }] })
      .expect(201);

    await request(app.getHttpServer()).delete(`/journal/${inv.body.journalEntryId}`).set('Authorization', `Bearer ${token}`).expect(409);

    // الصادرُ لا يُحذف عبر الواجهة (ق-٩٤٣) — والتنظيفُ بمسارٍ في سياق المستأجر يعكس قيدَه (ق-٩٥٣).
    await purgeInvoicesForTest(app.get(TenantPrismaService), companyIdOfToken(token), [inv.body.id]);
  }, 30000);
});
