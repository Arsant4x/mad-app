import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { RentRecognitionService } from '../src/contracts/rent-recognition.service';
import { DEFERRED_REVENUE_ACCOUNT_CODE } from '../src/journal/deferred-revenue-account.util';
import { createTenantCustomer } from './tenant-customer';

/**
 * ⚖️ **الإيرادُ المؤجَّل — يُحتجَز بالاستحقاق ويخرج بالخدمة**
 * (`ق-٤٦٨` · `ق-٤٧٠` … `ق-٤٧٥` · ثم `ق-٩١٧`).
 *
 * **العطلُ الذي بُني له**: القسطُ يستحقّ في **أوّلِ** فترته، **فكلُّ قبضٍ قبضٌ
 * عن خدمةٍ لم تُقدَّم بعد** — **و٢٤ من ١١٤ دفعة (٢١٪) في البيانات القائمة
 * قُبضت قبل بداية شهر خدمتها**، فسُجّلت إيراداً في شهرٍ سابقٍ لشهر الخدمة.
 *
 * **ثم انتقلت لحظةُ القيد من القبض إلى نقطة الضريبة** (`ق-٩١٧`): القسطُ ذمّةٌ على
 * المستأجر عند استحقاقه — أو عند قبضٍ يسبقه بقدره (`ق-٩٢٤`) — وصافيه يدخل الالتزامَ
 * (`2400`) ويخرج إيراداً بالخدمة كما كان؛ **والقبضُ يسدّد الذمّةَ ولا يمسّ الإيراد**.
 * فمبدأُ الاعتراف واحد، وما تغيّر هو اللحظة.
 *
 * **وما يُقاس هنا**:
 *
 *   ① **فترةُ الخدمة تُخزَّن على القسط** والقسطُ يستحقّ في أوّلها.
 *   ② **الدفعُ المقدَّم يُنشئ استحقاقاً بقدره يدخل الالتزامَ لا الإيراد** — وحسابُ `2400`
 *      يُنشأ عند أوّل حاجةٍ إليه (`ق-٤٧١`).
 *   ③ **والالتزامُ يخرج إيراداً عند اكتمال الشهر** — فمالٌ يدخل بلا مخرجٍ يُنتج ميزانيةً كاذبة.
 *   ④ **وتشغيلٌ ثانٍ يُرحّل صفراً** — الهدفُ تراكميّ لا فرقُ نبضة.
 *   ⑤ **ودفعةٌ عن قسطٍ استُحقّ تسدّد ذمّتَه** ولا تمسّ الإيرادَ ولا الالتزام.
 *
 * ⚠️ **التواريخُ نسبيّةٌ إلى اليوم** حيث يلزم: «استُحقّ» و«لم يستحقّ بعد» بالساعة الحقيقية.
 */
interface E2eInstallment {
  id: string;
  dueDate: string;
  serviceStart: string;
  serviceEnd: string;
}

// الأيامُ على هيئة `@db.Date` (`UTC`) — كما يقرؤها الخادمُ بيومه المعلَن (`ق-١١٩٠`): كانت تُبنى من منطقة العملية،
// فبين `21:00` و`24:00 UTC` على جهازٍ بتوقيت الرياض كان «اليوم» هنا غدَ الخادم، فتُؤرَّخ الدفعةُ في المستقبل
// ولا تُنشئ نقطةَ ضريبة — سبعُ مراحل سقطت في `test:clean` لهذا وحدَه (2026-09-20).
const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthStart = (d: Date, offsetMonths: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offsetMonths, 1));
const monthEndOf = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));

describe('⚖️ الإيرادُ المؤجَّل — يُحتجَز بالاستحقاق ويخرج بالخدمة (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let companyId: string;
  let recognition: RentRecognitionService;

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let seq = 0;
  /** ما أنشأته هذه المجموعة — يُصرَّف في الختام عقداً عقداً لا منشأةً كاملة (المنشأةُ على التطوير بآلاف الأقساط). */
  const created: string[] = [];

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  const today = new Date();
  /** أوّلُ الشهر بعد القادم — عقدٌ يبدأ فيه لا قسطَ له حلّ اليوم، ودفعةٌ اليوم على أوّل أقساطه مقدَّمةٌ بيقين. */
  const futureStart = monthStart(today, 2);

  async function balance(code: string): Promise<number> {
    const accounts = await auth(http().get('/accounts')).expect(200);
    return Number(accounts.body.find((a: { code: string }) => a.code === code)?.balance ?? 0);
  }

  /** عقدٌ سنويٌّ بدورةٍ شهرية: اثنا عشرَ قسطاً بألفٍ لكلِّ شهر من `start`. */
  async function makeContract(start = new Date('2026-01-01')) {
    const tag = `${suffix}-${++seq}`;
    const property = (await auth(http().post('/properties')).send({ name: `عقار التأجيل ${tag}`, ownership: 'owned' }).expect(201)).body;
    const unit = (
      await auth(http().post('/units')).send({ propertyId: property.id, unitNo: `DR-${tag}`, type: 'سكني', rentMonthly: 1000 }).expect(201)
    ).body;
    const end = new Date(Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth(), 0));
    const contract = (
      await auth(http().post('/contracts'))
        .send({ classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE', unitId: unit.id, customerId: await createTenantCustomer(app, token, `مستأجر التأجيل ${tag}`), value: 12000, cycle: 'monthly', start: iso(start), end: iso(end) })
        .expect(201)
    ).body as { id: string; no: string; installments: E2eInstallment[] };
    created.push(contract.id);
    return contract;
  }

  const installmentDue = (contract: { installments: E2eInstallment[] }, month: string) =>
    contract.installments.find((i) => i.dueDate.startsWith(month))!;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    recognition = app.get(RentRecognitionService);

    const login = await http().post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    token = login.body.accessToken;
    companyId = login.body.user.companyId;
  }, 60000);

  afterAll(async () => {
    // ⚠️ **ما فتحته هذه المجموعة يُغلَق**: التزاماتٌ تُترك في منشأة العرض
    // تُقرأ رصيداً بلا سببٍ ظاهر. وفتراتُ عقودها تنتهي بعد عامٍ ونيّف، فتشغيلٌ
    // بعدها يُخرجها كلَّها إيراداً. **وثلاثُ مجموعاتٍ سقطت مرّةً لحالةٍ
    // متراكمة تركها ملفٌّ في هذه المنشأة نفسِها.**
    const far = new Date(Date.UTC(today.getUTCFullYear() + 2, 0, 1));
    for (const id of created) await recognition.runForContract(companyId, id, far);
    await app.close();
  }, 120000);

  it('① فترةُ الخدمة تُخزَّن على القسط — والقسطُ يستحقّ في أوّلها', async () => {
    const contract = await makeContract();
    const march = installmentDue(contract, '2026-03');

    expect(march.serviceStart.slice(0, 10)).toBe('2026-03-01');
    expect(march.serviceEnd.slice(0, 10)).toBe('2026-03-31');
    // ⇒ فقبضُه في موعده قبضٌ عن شهرٍ كاملٍ لم يُقدَّم منه يوم.
    expect(march.dueDate.slice(0, 10)).toBe(march.serviceStart.slice(0, 10));
  }, 40000);

  it('🔴 ② الدفعُ المقدَّم يُنشئ استحقاقاً بقدره يدخل الالتزامَ لا الإيراد — والحسابُ يُنشأ عند أوّل حاجةٍ إليه', async () => {
    const contract = await makeContract(futureStart);
    const first = contract.installments[0];
    const [rentBefore, deferredBefore, receivableBefore] = [await balance('4200'), await balance(DEFERRED_REVENUE_ACCOUNT_CODE), await balance('1200')];

    await auth(http().post(`/contracts/${contract.id}/payments`))
      // قبل بداية فترة الخدمة بشهرٍ ونيّف — وهي حالةُ الـ٢١٪ المقيسة.
      .send({ installmentId: first.id, date: iso(today), amount: 1000, method: 'CASH' })
      .expect(201);

    // ولا ريالَ في الإيراد: لم تُقدَّم الخدمةُ بعد.
    expect(await balance('4200')).toBeCloseTo(rentBefore, 2);
    expect((await balance(DEFERRED_REVENUE_ACCOUNT_CODE)) - deferredBefore).toBeCloseTo(1000, 2);
    // واستحقاقٌ بقدر المقبوض سُدِّد في يومه — فالذمّةُ صفر (ق-٩٢٤).
    expect(await balance('1200')).toBeCloseTo(receivableBefore, 2);
  }, 40000);

  it('🔴 ③ ثم يخرج إيراداً عند اكتمال الشهر — ولا يمسّ القائمَ من العقود', async () => {
    const asOf = monthEndOf(futureStart);
    // ⚠️ على العقد وحده: التحوّلُ على المنشأة كلِّها يجرف التزاماتِ عقودٍ أخرى قائمة (وقد أدانت هذه
    // الحالةُ نفسَها بـ`2000` حين قيست على المنشأة) — **فالمقيسُ أثرُ هذا العقد وحده.**
    const contract = await makeContract(futureStart);
    const first = contract.installments[0];
    await auth(http().post(`/contracts/${contract.id}/payments`))
      .send({ installmentId: first.id, date: iso(today), amount: 1000, method: 'CASH' })
      .expect(201);

    const [rentBefore, deferredBefore] = [await balance('4200'), await balance(DEFERRED_REVENUE_ACCOUNT_CODE)];
    await recognition.runForContract(companyId, contract.id, asOf);

    // ألفٌ بالضبط — **لا أكثر**: والزيادةُ عليه تعني أن التحوّل جرف أقساطاً
    // قائمةً اعتُرف بها بالقاعدة القديمة (ق-٤٦٧).
    expect((await balance('4200')) - rentBefore).toBeCloseTo(1000, 2);
    expect((await balance(DEFERRED_REVENUE_ACCOUNT_CODE)) - deferredBefore).toBeCloseTo(-1000, 2);
  }, 60000);

  it('🔴 ④ وتشغيلٌ ثانٍ بالتاريخ نفسه يُرحّل صفراً — الهدفُ تراكميّ', async () => {
    const contract = await makeContract(futureStart);
    const first = contract.installments[0];
    await auth(http().post(`/contracts/${contract.id}/payments`))
      .send({ installmentId: first.id, date: iso(today), amount: 1000, method: 'CASH' })
      .expect(201);

    const asOf = monthEndOf(futureStart);
    await recognition.runForContract(companyId, contract.id, asOf);
    const [rentAfterFirst, deferredAfterFirst] = [await balance('4200'), await balance(DEFERRED_REVENUE_ACCOUNT_CODE)];

    const second = await recognition.runForContract(companyId, contract.id, asOf);
    expect(second.entries).toBe(0);
    expect(await balance('4200')).toBeCloseTo(rentAfterFirst, 2);
    expect(await balance(DEFERRED_REVENUE_ACCOUNT_CODE)).toBeCloseTo(deferredAfterFirst, 2);
  }, 60000);

  it('⑤ ودفعةٌ عن قسطٍ استُحقّ تسدّد ذمّتَه — ولا تمسّ الإيرادَ ولا الالتزام (ق-٩١٧)', async () => {
    const contract = await makeContract();
    const january = installmentDue(contract, '2026-01');
    // استُحقّ عند الإنشاء (حلّ موعدُه) — فالذمّةُ قائمةٌ قبل القبض.
    const [rentBefore, deferredBefore, receivableBefore, cashBefore] = [
      await balance('4200'),
      await balance(DEFERRED_REVENUE_ACCOUNT_CODE),
      await balance('1200'),
      await balance('1000'),
    ];

    await auth(http().post(`/contracts/${contract.id}/payments`))
      // بعد انقضاء فترة الخدمة كلِّها — والقبضُ تسديدٌ لا اعتراف.
      .send({ installmentId: january.id, date: '2026-02-05', amount: 1000, method: 'CASH' })
      .expect(201);

    expect((await balance('1000')) - cashBefore).toBeCloseTo(1000, 2);
    expect((await balance('1200')) - receivableBefore).toBeCloseTo(-1000, 2);
    expect(await balance('4200')).toBeCloseTo(rentBefore, 2);
    expect(await balance(DEFERRED_REVENUE_ACCOUNT_CODE)).toBeCloseTo(deferredBefore, 2);
  }, 40000);

  it('🔴 ⑦ والإلغاءُ على التزامٍ قائمٍ يُمنع حتى تُختار وجهتُه — ولا افتراض (ق-٤٧٢)', async () => {
    const contract = await makeContract(futureStart);
    const last = contract.installments[contract.installments.length - 1];
    await auth(http().post(`/contracts/${contract.id}/payments`))
      .send({ installmentId: last.id, date: iso(today), amount: 1000, method: 'CASH' })
      .expect(201);

    const res = await auth(http().post(`/contracts/${contract.id}/cancel`))
      .send({ cancelDate: iso(today), cancelReason: 'إخلاء مبكر', installmentDisposition: 'cancel' })
      .expect(400);

    // ⚠️ والرسالةُ تحمل الرقم — فمنعٌ بلا رقمٍ يُضغَط بلا قراءة.
    expect(String(res.body.message)).toContain('1000');
    // وتحمل الوجهتَين معاً، فلا يُخمَّن ما هو المطلوب.
    expect(String(res.body.message)).toContain('يُردّ');
    expect(String(res.body.message)).toContain('يُحتجَز');
  }, 40000);

  it('🔴 ⑧ فإن احتُجز بشرط العقد ذهب دخلاً آخر — ⛔ ولا يمسّ إيرادَ الإيجار', async () => {
    const contract = await makeContract(futureStart);
    const last = contract.installments[contract.installments.length - 1];
    await auth(http().post(`/contracts/${contract.id}/payments`))
      .send({ installmentId: last.id, date: iso(today), amount: 1000, method: 'CASH' })
      .expect(201);

    const [rentBefore, otherBefore, deferredBefore] = [await balance('4200'), await balance('4300'), await balance(DEFERRED_REVENUE_ACCOUNT_CODE)];

    await auth(http().post(`/contracts/${contract.id}/cancel`))
      .send({
        cancelDate: iso(today),
        cancelReason: 'إخلاء مبكر',
        installmentDisposition: 'cancel',
        unearnedDisposition: 'income',
      })
      .expect(201);

    expect((await balance('4300')) - otherBefore).toBeCloseTo(1000, 2);
    expect((await balance(DEFERRED_REVENUE_ACCOUNT_CODE)) - deferredBefore).toBeCloseTo(-1000, 2);
    // السطرُ الذي يهمّ أكثر من غيره: العقارُ لم يُشغَل تلك المدّة.
    expect(await balance('4200')).toBeCloseTo(rentBefore, 2);
  }, 60000);

  it('🔴 ⑨ وإن رُدّ خرج نقداً — والالتزامُ ينتهي في الحالين', async () => {
    const contract = await makeContract(futureStart);
    const last = contract.installments[contract.installments.length - 1];
    await auth(http().post(`/contracts/${contract.id}/payments`))
      .send({ installmentId: last.id, date: iso(today), amount: 1000, method: 'CASH' })
      .expect(201);

    const [cashBefore, deferredBefore, rentBefore] = [await balance('1000'), await balance(DEFERRED_REVENUE_ACCOUNT_CODE), await balance('4200')];

    await auth(http().post(`/contracts/${contract.id}/cancel`))
      .send({
        cancelDate: iso(today),
        cancelReason: 'إخلاء مبكر',
        installmentDisposition: 'cancel',
        unearnedDisposition: 'refund',
      })
      .expect(201);

    expect((await balance('1000')) - cashBefore).toBeCloseTo(-1000, 2);
    expect((await balance(DEFERRED_REVENUE_ACCOUNT_CODE)) - deferredBefore).toBeCloseTo(-1000, 2);
    expect(await balance('4200')).toBeCloseTo(rentBefore, 2);
  }, 60000);

  it('⑩ وإلغاءٌ بلا التزامٍ قائم لا يُسأل عن وجهةٍ — فسؤالٌ بلا موضوعٍ يُضغَط بلا قراءة', async () => {
    const contract = await makeContract(futureStart);

    await auth(http().post(`/contracts/${contract.id}/cancel`))
      .send({ cancelDate: iso(today), cancelReason: 'إخلاء مبكر', installmentDisposition: 'cancel' })
      .expect(201);
  }, 40000);

  it('🔴 ⑫ ووصفُ القيد يحمل حدَّ المحرّك — في الدفتر لا في وثيقة (ق-٤٨٠)', async () => {
    const contract = await makeContract(futureStart);
    const first = contract.installments[0];
    await auth(http().post(`/contracts/${contract.id}/payments`))
      .send({ installmentId: first.id, date: iso(today), amount: 1000, method: 'CASH' })
      .expect(201);

    const asOf = monthEndOf(futureStart);
    await recognition.runForContract(companyId, contract.id, asOf);

    const journal = (await auth(http().get('/journal').query({ search: contract.no, pageSize: 50 })).expect(200)).body as {
      items: { memo: string }[];
    };
    const conversion = journal.items.filter((r) => r.memo.includes('تحوّل إيراد مؤجَّل'));

    // مجسٌّ للمجسّ: صفرُ قيودٍ يعني أن البحثَ أخفق لا أن الوصف غاب.
    expect(conversion.length).toBeGreaterThan(0);
    // ⭐ والحدُّ منصوصٌ حيث يُقرأ: «كاملاً» تقول إن الشهرَ الجاري ينتظر اكتماله.
    const label = asOf.toISOString().slice(0, 7);
    expect(conversion[0].memo).toContain(`حصّة شهر ${label} كاملاً`);
    expect(conversion[0].memo).toContain(contract.no);
  }, 60000);

  it('🔴 ⑪ والتقريرُ يسرد الالتزامَ القائم وما لم يمرّ به — شرطُ ق-٤٧٣', async () => {
    const contract = await makeContract(futureStart);
    const first = contract.installments[0];
    // ① التزامٌ قائم: دفعٌ مقدَّمٌ لم يُحوَّل بعد.
    await auth(http().post(`/contracts/${contract.id}/payments`))
      .send({ installmentId: first.id, date: iso(today), amount: 1000, method: 'CASH' })
      .expect(201);
    // ② ودفعةٌ بلا قسط — لا فترةَ خدمةٍ تُعرف لها.
    await auth(http().post(`/contracts/${contract.id}/payments`)).send({ date: iso(today), amount: 250, method: 'CASH' }).expect(201);

    const report = (await auth(http().get('/reports/deferred-revenue')).expect(200)).body as {
      outstanding: { contractNo: string; deferred: number; accrualBasis: string }[];
      totalDeferred: number;
      unlinked: { contractNo: string; baseNetAmount: number }[];
      totalUnlinked: number;
      unlinkedNote: string;
    };

    const mine = report.outstanding.filter((r) => r.contractNo === contract.no);
    expect(mine.length).toBeGreaterThan(0);
    expect(mine[0].deferred).toBeCloseTo(1000, 2);
    expect(mine[0].accrualBasis).toBe('ACCRUAL');

    const myUnlinked = report.unlinked.filter((r) => r.contractNo === contract.no);
    expect(myUnlinked).toHaveLength(1);
    expect(myUnlinked[0].baseNetAmount).toBeCloseTo(250, 2);

    // ⚠️ والحدُّ منصوصٌ في التقرير نفسِه لا في وثيقةٍ بعيدة.
    expect(report.unlinkedNote).toContain('لا تُعرف لها فترة خدمة');
    expect(report.totalDeferred).toBeGreaterThanOrEqual(1000);
    expect(report.totalUnlinked).toBeGreaterThanOrEqual(250);
  }, 60000);

  it('⑥ ودفعةٌ بلا قسطٍ مرتبط تُعترَف فوراً — حدٌّ معلَنٌ لا عطل (ق-٤٧٣)', async () => {
    const contract = await makeContract(futureStart);
    const [rentBefore, deferredBefore, receivableBefore] = [await balance('4200'), await balance(DEFERRED_REVENUE_ACCOUNT_CODE), await balance('1200')];

    await auth(http().post(`/contracts/${contract.id}/payments`)).send({ date: iso(today), amount: 500, method: 'CASH' }).expect(201);

    // لا فترةَ خدمةٍ تُعرف لها إطلاقاً — فلا قسمةَ ممكنة: استحقاقٌ بقدرها يُعترَف فوراً ويُسدَّد.
    expect((await balance('4200')) - rentBefore).toBeCloseTo(500, 2);
    expect(await balance(DEFERRED_REVENUE_ACCOUNT_CODE)).toBeCloseTo(deferredBefore, 2);
    expect(await balance('1200')).toBeCloseTo(receivableBefore, 2);
  }, 40000);
});
