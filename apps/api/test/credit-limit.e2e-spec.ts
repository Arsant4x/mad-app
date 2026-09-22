import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { CREDIT_CODE, CREDIT_OVERRIDE_ACTION } from '../src/invoices/credit-context';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (15.8 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(50000);

/**
 * ⚖️ **حدُّ الائتمان — من حقلٍ يُرى إلى حدٍّ يفعل** (`ق-٣٣٦` … `ق-٣٤١`).
 *
 * **حكمُ المالك الذي بُني له**: «**حقلٌ يراه التاجر ويظنّه يحميه ولا يفعل شيئاً
 * أخطر من غيابه**». **والحقلُ كان قائماً منذ البداية**: يُخزَّن ويُحرَّر
 * ويُعرض في جدول العملاء — **ولا قارئَ له في أيّ قرار** (`ق-٣٣٢`①).
 *
 * **وستّةٌ تُقاس هنا، كلٌّ منها كان يمكن أن يقع عكسُه بصمت**:
 *
 *   ① **صفرٌ يعني بلا حدّ** — وإلا مُنع كلُّ بيعٍ آجلٍ في المنصّة لحظةَ
 *      التفعيل، **وهو انحدارٌ شاملٌ يبدو ميزة**.
 *   ② **والرسالةُ تحمل الأرقام الثلاثة** — لا كلمةَ «تجاوزت»: تحذيرٌ بلا رقمٍ
 *      **يُضغَط بلا قراءة**.
 *   ③ **والتجاوزُ يُخزَّن على الفاتورة ويُسجَّل حدثاً باسمه** (`ق-٣٣٩`) —
 *      «**تحذيرٌ يُضغط بلا أثرٍ هو عينُ ما نعالجه**».
 *   ④ **ومن لا يملك `review` لا يتجاوز** — وإلا صار التصريحُ زرَّ مرورٍ للجميع.
 *   ⑤ **والمنعُ الصلب لا يتجاوزه أحد** ولو ملك `review` (`ق-٣٤٠`) — وهو معنى «صلب».
 *   ⑥ **والتعرّضُ حيٌّ لا لقطة**: سدادٌ يخفّضه **فيمرّ ما كان يُمنَع** —
 *      **وهو إثباتُ أن الحدَّ يقرأ المصدر الواحد** (`ق-٣٤١`) لا نسخةً منه.
 */
describe('⚖️ حدُّ الائتمان — يمنع، ويُتجاوَز بأثر، ويُصلَّب بإعداد (e2e)', () => {
  let app: INestApplication;
  let token: string;
  // منشأةٌ معزولة (ق-٧٢٢): الصندوقُ والعلَمُ الصلبُ والعملاءُ المحدودون في منشأةٍ يصنعها الاختبارُ ويزيلها — لا في منشأة العرض.
  let company: IsolatedCompany;
  let clerkToken: string;
  let branchId: string;
  let cashBoxId: string;
  let clerkId: string | undefined;
  let templateId: string | undefined;

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const today = () => new Date().toISOString().slice(0, 10);
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const asClerk = (r: request.Test) => r.set('Authorization', `Bearer ${clerkToken}`);

  /**
   * عميلٌ بحدٍّ معلوم — **الحدُّ مُدخَلٌ لا افتراض**.
   *
   * ⚠️ **ويُسجَّل ليُعاد حدُّه صفراً في النهاية** — والسببُ مقيسٌ لا احترازيّ:
   * **ثلاثُ مجموعاتٍ سقطت** بسبب عملاءَ محدودين تركهم هذا الملفّ في منشأة
   * العرض، **أقربُها `invoices-tenant-isolation` يأخذ `customers[0]` بلا
   * ترشيح** فوقع على عميلٍ محدود. **وخضرَّت الثلاثةُ على قاعدةٍ نظيفة** —
   * فالعلّةُ حالةٌ متراكمة لا شيفرة.
   */
  const limited: string[] = [];
  const customerWithLimit = async (creditLimit: number, label: string) => {
    const id = (await auth(request(app.getHttpServer()).post('/customers')).send({ kind: 'NATURAL', name: `${label} ${suffix}`, creditLimit }).expect(201)).body
      .id as string;
    limited.push(id);
    return id;
  };

  /** فاتورةُ `2300` أساساً: `2 × 1000` بضريبة `15٪`. */
  const invoiceBody = (customerId: string, unitPrice = 1000, extra: Record<string, unknown> = {}) => ({
    customerId,
    branchId,
    issueDate: today(),
    dueDate: today(),
    lines: [{ description: `بيع آجل ${suffix}`, quantity: 2, unitPrice, taxRate: 15 }],
    ...extra,
  });

  const bill = (customerId: string, unitPrice?: number, extra?: Record<string, unknown>) =>
    auth(request(app.getHttpServer()).post('/invoices')).send(invoiceBody(customerId, unitPrice, extra));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalFilters(new HttpExceptionFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    await app.init();

    company = await registerIsolatedCompany(app, 'credit-limit');
    token = company.token;

    branchId = (await auth(request(app.getHttpServer()).post('/branches')).send({ name: `فرع الائتمان ${suffix}` }).expect(201)).body.id;
    cashBoxId = (await auth(request(app.getHttpServer()).post('/banks'))
      .send({ name: `صندوق الائتمان ${suffix}`, openingBalance: 0, openingDate: today(), branchId })
      .expect(201)).body.id;

    // **موظّفٌ يفوتر ولا يعتمد**: `invoice` بـ`view`+`add` بلا `review`.
    templateId = (await auth(request(app.getHttpServer()).post('/templates'))
      .send({ name: `محاسب ائتمان ${suffix}`, allowedScreens: ['invoice', 'customers'], screenActions: { invoice: ['view', 'add'], customers: ['view'] } })
      .expect(201)).body.id;
    clerkId = (await auth(request(app.getHttpServer()).post('/company-users'))
      .send({ name: 'محاسب الائتمان', username: `cl-${suffix}`, password: 'ClerkPass123!', permissionTemplateId: templateId })
      .expect(201)).body.id;
    clerkToken = (await request(app.getHttpServer()).post('/auth/login').send({ username: `cl-${suffix}`, password: 'ClerkPass123!' })).body.accessToken;
  }, 120000);

  afterAll(async () => {
    // ⚠️ **شبكةُ أمانٍ على العلَم**: لو سقط اختبارٌ قبل إطفائه بقي المنعُ
    //    الصلبُ مرفوعاً على منشأة العرض — **فتسقط مجموعاتٌ لا علاقة لها به**،
    //    وهو عينُ ما احترز منه حارسُ الشطب.
    await auth(request(app.getHttpServer()).patch('/company-profile')).send({ creditLimitHardBlock: false });
    // ⚠️ **ولا يُترك عميلٌ محدودٌ خلفنا**: عملاءُ هذا الملفّ لهم فواتير فلا
    //    يُحذفون، **فيُعاد حدُّهم صفراً** — وصفرٌ يعني بلا حدّ، فيعودون كما
    //    كان كلُّ عميلٍ في المنصّة قبل هذه الميزة.
    for (const id of limited) await auth(request(app.getHttpServer()).patch(`/customers/${id}`)).send({ creditLimit: 0 });
    if (clerkId) await auth(request(app.getHttpServer()).delete(`/company-users/${clerkId}`));
    if (templateId) await auth(request(app.getHttpServer()).delete(`/templates/${templateId}`));
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 60000);

  it('① عميلٌ بلا حدّ (صفر) لا يُمنَع — وإلا كسرت الميزةُ كلَّ عميلٍ قائم', async () => {
    const open = await customerWithLimit(0, 'بلا حدّ');
    const res = await bill(open, 50_000).expect(201);
    expect(res.body.creditOverrideById).toBeNull();
  }, 60000);

  it('[SPEC 4.3] ② والحدُّ يمنع — والرسالةُ تحمل الحدَّ والقائمَ والمطلوب لا كلمةَ «تجاوزت»', async () => {
    const tight = await customerWithLimit(100, 'محدود');
    const res = await bill(tight).expect(409);

    // ⭐ **ورمزٌ ثابتٌ تقرؤه الواجهة** — فمطابقةُ نصٍّ مترجَم تنكسر صامتةً
    //    بأول تحسينِ صياغة، **فيختفي زرُّ التجاوز ويُقرأ الرفضُ منعاً صلباً**.
    expect(res.body.code).toBe(CREDIT_CODE.exceeded);

    const message = String(res.body.message);
    // **الأرقامُ الثلاثة**: الحدُّ `100`، والقائمُ `0`، وما تضيفه `2,300`.
    expect(message).toContain('100.00');
    expect(message).toContain('2,300.00');
    // **واسمُ العميل** — فيُقرأ الرفضُ بلا فتح شاشةٍ أخرى.
    expect(message).toContain('محدود');
  }, 60000);

  it('③ والتجاوزُ يمرّ — ويُخزَّن على الفاتورة ويُسجَّل حدثاً باسمه', async () => {
    const tight = await customerWithLimit(100, 'متجاوَز');
    const res = await bill(tight, 1000, { creditOverride: true }).expect(201);

    // **أربعتُها معاً** — من ومتى وكم كان التعرّض وكم كان الحدّ.
    expect(res.body.creditOverrideById).toBeTruthy();
    expect(res.body.creditOverrideAt).toBeTruthy();
    expect(Number(res.body.creditOverrideExposure)).toBe(0);
    expect(Number(res.body.creditOverrideLimit)).toBe(100);

    // ⭐ **ويُوجَد بحثاً لا بمقارنةٍ يدوية** (`ق-٣٣٩`).
    const trail = await auth(request(app.getHttpServer()).get(`/audit-log?action=${CREDIT_OVERRIDE_ACTION}`)).expect(200);
    const rows = (trail.body.items ?? trail.body) as { entityId: string; action: string }[];
    expect(rows.some((r) => r.entityId === res.body.id && r.action === CREDIT_OVERRIDE_ACTION)).toBe(true);
  }, 60000);

  it('④ ومن لا يملك `review` لا يتجاوز — فالتصريحُ نيّةٌ لا إذن', async () => {
    const tight = await customerWithLimit(100, 'أمام موظّف');
    // **بلا تصريح: يُردّ بـ409** كالمالك — فالمنعُ واحدٌ للجميع.
    await asClerk(request(app.getHttpServer()).post('/invoices')).send(invoiceBody(tight)).expect(409);
    // **وبتصريحٍ لا يملكه: يُردّ بـ403** — ولا تُنشأ فاتورة.
    const refused = await asClerk(request(app.getHttpServer()).post('/invoices'))
      .send(invoiceBody(tight, 1000, { creditOverride: true }))
      .expect(403);
    // **ورمزُه يفرّقه عن المنع الصلب** — فالواجهة لا تُعيد عرضَ زرٍّ لا يملكه.
    expect(refused.body.code).toBe(CREDIT_CODE.forbidden);
  }, 60000);

  it('⑤ والمنعُ الصلب لا يتجاوزه أحد — ولو ملك `review`', async () => {
    const tight = await customerWithLimit(100, 'صلب');
    await auth(request(app.getHttpServer()).patch('/company-profile')).send({ creditLimitHardBlock: true }).expect(200);
    try {
      // **صاحبُ المنشأة يملك كلَّ الصلاحيات** — ومع ذلك يُردّ: وهو معنى «صلب».
      const res = await bill(tight, 1000, { creditOverride: true }).expect(403);
      expect(String(res.body.message)).toContain('100.00');
      // **ورمزُه غيرُ رمز «صرّح ولا يملك»** — والواجهة تفرّق بينهما.
      expect(res.body.code).toBe(CREDIT_CODE.hardBlock);
    } finally {
      await auth(request(app.getHttpServer()).patch('/company-profile')).send({ creditLimitHardBlock: false }).expect(200);
    }
  }, 60000);

  it('⑥ والتعرّضُ حيٌّ لا لقطة — سدادٌ يخفّضه فيمرّ ما كان يُمنَع', async () => {
    // حدٌّ `3000`: أولُ فاتورةٍ `2300` تمرّ، والثانيةُ تبلغ `4600` فتُمنَع.
    const c = await customerWithLimit(3000, 'حيّ');
    const first = await bill(c).expect(201);
    await bill(c).expect(409);

    // **سدادٌ كامل** — فيعود التعرّضُ صفراً **في المصدر الواحد نفسِه**.
    await auth(request(app.getHttpServer()).post('/payments'))
      .send({ customerId: c, branchId, date: today(), amount: 2300, method: 'CASH', bankId: cashBoxId, allocations: [{ invoiceId: first.body.id, amount: 2300 }] })
      .expect(201);

    // ⭐ **ويمرّ ما كان يُمنَع قبل سطرين** — **ولا حقلَ حالةٍ تغيّر**: القراءةُ
    //    من المستندات والتخصيصات في كل مرة (القاعدة ١١).
    const after = await bill(c).expect(201);
    expect(after.body.creditOverrideById).toBeNull();
  }, 90000);
});
