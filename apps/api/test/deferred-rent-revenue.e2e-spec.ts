import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { RentRecognitionService } from '../src/contracts/rent-recognition.service';
import { DEFERRED_REVENUE_ACCOUNT_CODE } from '../src/journal/deferred-revenue-account.util';

/**
 * ⚖️ **الإيرادُ المؤجَّل — من اعترافٍ لحظةَ القبض إلى اعترافٍ على مدّة الخدمة**
 * (`ق-٤٦٨` · `ق-٤٧٠` … `ق-٤٧٥`).
 *
 * **العطلُ الذي بُني له**: القسطُ يستحقّ في **أوّلِ** فترته، **فكلُّ قبضٍ قبضٌ
 * عن خدمةٍ لم تُقدَّم بعد** — **و٢٤ من ١١٤ دفعة (٢١٪) في البيانات القائمة
 * قُبضت قبل بداية شهر خدمتها**، فسُجّلت إيراداً في شهرٍ سابقٍ لشهر الخدمة.
 *
 * **وخمسةٌ تُقاس هنا، كلٌّ منها كان يمكن أن يقع عكسُه بصمت**:
 *
 *   ① **الدفعُ المقدَّم يدخل التزاماً لا إيراداً** — وهو الحالةُ المقيسة.
 *   ② **والحسابُ `2400` يُنشأ عند أوّل تحوّلٍ لمنشأةٍ لا تحمله** (`ق-٤٧١`) —
 *      **وإلّا سقط القيدُ صامتاً**: `resolveAccountIds` يعيد `null` بلا رسالة.
 *   ③ **والالتزامُ يخرج إيراداً عند اكتمال الشهر** — فمالٌ يدخل بلا مخرجٍ
 *      يُنتج ميزانيةً كاذبة كما يُنتجه الاعترافُ الفوريّ.
 *   ④ **وتشغيلٌ ثانٍ يُرحّل صفراً** — الهدفُ تراكميّ لا فرقُ نبضة.
 *   ⑤ **ودفعةٌ عن فترةٍ انقضت تبقى كما كانت** — **فالتغييرُ لا يمسّ إلا ما لم
 *      يُقدَّم بعد**، والعقودُ القائمة لا يُعاد ترحيلُ قيدٍ منها (`ق-٤٦٧`).
 */
interface E2eInstallment {
  id: string;
  dueDate: string;
  serviceStart: string;
  serviceEnd: string;
}

describe('⚖️ الإيرادُ المؤجَّل — يُحتجَز بالقبض ويخرج بالخدمة (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let companyId: string;
  let recognition: RentRecognitionService;

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  let seq = 0;

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  async function balance(code: string): Promise<number> {
    const accounts = await auth(http().get('/accounts')).expect(200);
    return Number(accounts.body.find((a: { code: string }) => a.code === code)?.balance ?? 0);
  }

  /** عقدٌ سنويٌّ بدورةٍ شهرية: اثنا عشرَ قسطاً بألفٍ لكلِّ شهرٍ من ٢٠٢٦. */
  async function makeContract() {
    const tag = `${suffix}-${++seq}`;
    const property = (await auth(http().post('/properties')).send({ name: `عقار التأجيل ${tag}`, ownership: 'owned' }).expect(201)).body;
    const unit = (
      await auth(http().post('/units')).send({ propertyId: property.id, unitNo: `DR-${tag}`, type: 'سكني', rentMonthly: 1000 }).expect(201)
    ).body;
    return (
      await auth(http().post('/contracts'))
        .send({ unitId: unit.id, tenant: `مستأجر التأجيل ${tag}`, value: 12000, cycle: 'monthly', start: '2026-01-01', end: '2026-12-31' })
        .expect(201)
    ).body as { id: string; installments: E2eInstallment[] };
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
    // تُقرأ رصيداً بلا سببٍ ظاهر. وفتراتُ عقودها تنتهي بنهاية ٢٠٢٦، فتشغيلٌ
    // بعدها يُخرجها كلَّها إيراداً. **وثلاثُ مجموعاتٍ سقطت مرّةً لحالةٍ
    // متراكمة تركها ملفٌّ في هذه المنشأة نفسِها.**
    await recognition.runForCompany(companyId, new Date('2027-01-01T00:00:00'));
    await app.close();
  });

  it('① فترةُ الخدمة تُخزَّن على القسط — والقسطُ يستحقّ في أوّلها', async () => {
    const contract = await makeContract();
    const march = installmentDue(contract, '2026-03');

    expect(march.serviceStart.slice(0, 10)).toBe('2026-03-01');
    expect(march.serviceEnd.slice(0, 10)).toBe('2026-03-31');
    // ⇒ فقبضُه في موعده قبضٌ عن شهرٍ كاملٍ لم يُقدَّم منه يوم.
    expect(march.dueDate.slice(0, 10)).toBe(march.serviceStart.slice(0, 10));
  }, 40000);

  it('🔴 ② الدفعُ المقدَّم يدخل الالتزام — والحسابُ يُنشأ عند أوّل حاجةٍ إليه', async () => {
    const contract = await makeContract();
    const march = installmentDue(contract, '2026-03');
    const [rentBefore, deferredBefore] = [await balance('4200'), await balance(DEFERRED_REVENUE_ACCOUNT_CODE)];

    await auth(http().post(`/contracts/${contract.id}/payments`))
      // قبل بداية فترة الخدمة بتسعة أيام — وهي حالةُ الـ٢١٪ المقيسة.
      .send({ installmentId: march.id, date: '2026-02-20', amount: 1000, method: 'CASH' })
      .expect(201);

    // ولا ريالَ في الإيراد: لم تُقدَّم الخدمةُ بعد.
    expect(await balance('4200')).toBeCloseTo(rentBefore, 2);
    expect((await balance(DEFERRED_REVENUE_ACCOUNT_CODE)) - deferredBefore).toBeCloseTo(1000, 2);
  }, 40000);

  it('🔴 ③ ثم يخرج إيراداً عند اكتمال الشهر — ولا يمسّ القائمَ من العقود', async () => {
    const asOf = new Date('2026-03-31T00:00:00');
    // ⚠️ تصريفٌ أوّلاً: التحوّلُ يكنس المنشأة كلَّها، **وحالةُ ما قبله ليست
    // فراغاً** — وقد أدانت هذه الحالةُ نفسَها بـ`2000` حين قيست بلا تصريف
    // (التزامُ الحالة ② ما زال قائماً). **فالمقيسُ أثرُ هذه الحالة وحدها.**
    await recognition.runForCompany(companyId, asOf);

    const contract = await makeContract();
    const march = installmentDue(contract, '2026-03');
    await auth(http().post(`/contracts/${contract.id}/payments`))
      .send({ installmentId: march.id, date: '2026-02-20', amount: 1000, method: 'CASH' })
      .expect(201);

    const [rentBefore, deferredBefore] = [await balance('4200'), await balance(DEFERRED_REVENUE_ACCOUNT_CODE)];
    await recognition.runForCompany(companyId, asOf);

    // ألفٌ بالضبط — **لا أكثر**: والزيادةُ عليه تعني أن التحوّل جرف أقساطاً
    // قائمةً اعتُرف بها بالقاعدة القديمة (ق-٤٦٧).
    expect((await balance('4200')) - rentBefore).toBeCloseTo(1000, 2);
    expect((await balance(DEFERRED_REVENUE_ACCOUNT_CODE)) - deferredBefore).toBeCloseTo(-1000, 2);
  }, 60000);

  it('🔴 ④ وتشغيلٌ ثانٍ بالتاريخ نفسه يُرحّل صفراً — الهدفُ تراكميّ', async () => {
    const contract = await makeContract();
    const march = installmentDue(contract, '2026-03');
    await auth(http().post(`/contracts/${contract.id}/payments`))
      .send({ installmentId: march.id, date: '2026-02-20', amount: 1000, method: 'CASH' })
      .expect(201);

    const asOf = new Date('2026-03-31T00:00:00');
    await recognition.runForCompany(companyId, asOf);
    const [rentAfterFirst, deferredAfterFirst] = [await balance('4200'), await balance(DEFERRED_REVENUE_ACCOUNT_CODE)];

    const second = await recognition.runForCompany(companyId, asOf);
    expect(second.entries).toBe(0);
    expect(await balance('4200')).toBeCloseTo(rentAfterFirst, 2);
    expect(await balance(DEFERRED_REVENUE_ACCOUNT_CODE)).toBeCloseTo(deferredAfterFirst, 2);
  }, 60000);

  it('⑤ ودفعةٌ عن فترةٍ انقضت تبقى كما كانت — إيراداً فوريّاً بلا التزام', async () => {
    const contract = await makeContract();
    const january = installmentDue(contract, '2026-01');
    const [rentBefore, deferredBefore] = [await balance('4200'), await balance(DEFERRED_REVENUE_ACCOUNT_CODE)];

    await auth(http().post(`/contracts/${contract.id}/payments`))
      // بعد انقضاء فترة الخدمة كلِّها — فلا شيءَ يُؤجَّل.
      .send({ installmentId: january.id, date: '2026-02-05', amount: 1000, method: 'CASH' })
      .expect(201);

    expect((await balance('4200')) - rentBefore).toBeCloseTo(1000, 2);
    expect(await balance(DEFERRED_REVENUE_ACCOUNT_CODE)).toBeCloseTo(deferredBefore, 2);
  }, 40000);

  it('⑥ ودفعةٌ بلا قسطٍ مرتبط تُعترَف فوراً — حدٌّ معلَنٌ لا عطل (ق-٤٧٣)', async () => {
    const contract = await makeContract();
    const [rentBefore, deferredBefore] = [await balance('4200'), await balance(DEFERRED_REVENUE_ACCOUNT_CODE)];

    await auth(http().post(`/contracts/${contract.id}/payments`)).send({ date: '2026-02-20', amount: 500, method: 'CASH' }).expect(201);

    // لا فترةَ خدمةٍ تُعرف لها إطلاقاً — فلا قسمةَ ممكنة.
    expect((await balance('4200')) - rentBefore).toBeCloseTo(500, 2);
    expect(await balance(DEFERRED_REVENUE_ACCOUNT_CODE)).toBeCloseTo(deferredBefore, 2);
  }, 40000);
});
