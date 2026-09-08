import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { AppModule } from '../src/app.module';

/**
 * **نقدُ الكاشير يدخل حسابَ درجه، وفرقُ الجرد يُرحَّل** (`ق-٣٠٩` · `ق-٣٠٨`).
 *
 * ── العطلُ الذي تُغلقه ──────────────────────────────────────────────────
 * كان بيعُ الكاشير يُرحّل `مدين 1200 / دائن 4100 + 2200` **ثم لا شيء**:
 * صفوفُ الدفع تُكتب ولا تُرحَّل، **فالذمّةُ لا تُسدَّد والنقدُ لا يدخل
 * الأستاذ**. والمقيس قبل الإصلاح: ٧٢ فاتورةَ كاشير · `1200` مدين ٢٢٬٧٧٠ ·
 * **وصفرُ سطرِ نقد**، و٣٥ حسابَ درجٍ **بصفر سطرٍ غير افتتاحيّ**.
 */
describe('نقدُ الكاشير يصل درجَه، وفرقُ الجرد يُرحَّل (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let token: string;
  let companyId: string;
  const suffix = Date.now();

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  /** رصيدُ حسابٍ بمعرّفه — **من الأستاذ لا من عمود**. */
  const balanceOf = async (accountId: string): Promise<number> => {
    const account = await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.account.findUniqueOrThrow({ where: { id: accountId }, select: { balance: true } }),
    );
    return Number(account.balance);
  };

  const codeBalance = async (code: string): Promise<number> => {
    const account = await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.account.findFirst({ where: { companyId, code }, select: { balance: true } }),
    );
    return Number(account?.balance ?? 0);
  };

  /**
   * درجٌ واحد للمجموعة كلِّها — **لا درجٌ لكل توكيد**.
   *
   * ⚠️ نطاقُ رموز الأدراج `1010–1099` **تسعون خانةً لا تُعاد** (ق-٢٩٥)، وقد
   * نفدت على قاعدة التطوير بأربعة أدراجٍ في كل تشغيل. **والعزلُ لا يحتاج
   * درجاً جديداً**: كلُّ توكيدٍ يقرأ الرصيدَ قبله ويقيس الفرق.
   */
  let drawer = { id: '', accountId: '' };

  /**
   * ⚠️ **ويُعاد استعمالُ درجٍ قائمٍ إن وُجد**: النطاقُ نفد فعلاً على قاعدة
   * التطوير — **وهو الجدارُ الذي أنذر منه `ق-٢٩٥`، وقد بلغناه**.
   */
  async function ensureDrawer(): Promise<{ id: string; accountId: string }> {
    const list = (await auth(http().get('/cash-drawers')).expect(200)).body as {
      id: string;
      isActive: boolean;
      branchId: string | null;
      account: { id: string };
    }[];
    // بلا فرعٍ عمداً: مناوبةُ هذه المجموعة بلا فرع، ودرجُ فرعٍ آخر يُردّ
    // بـ`cash_drawer_branch_mismatch` — وهو `409` كالمناوبة المفتوحة تماماً
    // (ق-٢٩٤: رمزٌ يُشارَك بين علّتين يُخفي إحداهما).
    const usable = list.find((d) => d.isActive && d.branchId === null);
    if (usable) return { id: usable.id, accountId: usable.account.id };
    const res = await auth(http().post('/cash-drawers')).send({ name: `درج القياس ${suffix}` }).expect(201);
    return { id: res.body.id, accountId: res.body.account.id };
  }

  /**
   * ⚠️ **تُغلق المناوبةُ المفتوحة قبل الفتح**: «درجٌ واحد مفتوح لكل كاشير»،
   * **والمجموعةُ لا تفترض قاعدةً بلا مناوبةٍ سابقة** — وهي علّةُ `ق-٢٩٨`
   * نفسُها: توكيدٌ يفترض قاعدةً نظيفة.
   */
  async function openShift(drawerId: string, float = 100) {
    const current = await auth(http().get('/pos/shifts/current')).expect(200);
    if (current.body?.id) {
      await auth(http().post(`/pos/shifts/${current.body.id}/close`)).send({ declaredClosing: Number(current.body.expectedCash ?? 0) });
    }
    return (await auth(http().post('/pos/shifts')).send({ openingFloat: float, drawerId }).expect(201)).body as { id: string };
  }

  /** صنفٌ بسعرٍ معلوم — والبيعُ يُطلب بالكميّة، فالمبلغُ مشتقٌّ لا مُرسَل. */
  let productId = '';
  const UNIT_PRICE = 100;

  function ringCash(quantity: number) {
    return auth(http().post('/pos/sales')).send({ paymentMethod: 'CASH', lines: [{ productId, quantity }] });
  }

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

    productId = (await auth(http().post('/products')).send({ name: `صنفُ الدرج ${suffix}`, price: UNIT_PRICE }).expect(201)).body.id;
    drawer = await ensureDrawer();
  }, 60000);

  afterAll(async () => {
    await app.close();
  }, 60000);

  it('🔴 بيعٌ نقديّ يُسدّد ذمّته: الدرجُ يزيد و`1200` يعود كما كان', async () => {
    await openShift(drawer.id);

    const drawerBefore = await balanceOf(drawer.accountId);
    const receivableBefore = await codeBalance('1200');

    await ringCash(1).expect(201); // ١٠٠ + ضريبة ١٥٪ = ١١٥

    // النقدُ في حساب الدرج — **لا في `1000` ولا في العدم**.
    expect(await balanceOf(drawer.accountId)).toBe(drawerBefore + 115);
    // والذمّةُ سُدِّدت: الفاتورةُ رفعتها والتحصيلُ أعادها.
    expect(await codeBalance('1200')).toBe(receivableBefore);
  }, 60000);

  it('🔴 وفرقُ الجرد يُرحَّل عجزاً — عموداً وقيداً معاً', async () => {
    const shift = await openShift(drawer.id, 100);
    await ringCash(2).expect(201); // ٢٠٠ + ضريبة ١٥٪ = ٢٣٠

    const drawerBefore = await balanceOf(drawer.accountId);
    const varianceBefore = await codeBalance('5900');

    // المتوقَّع ٣٣٠ (عهدة ١٠٠ + بيع ٢٣٠) والمعدود ٣٢٠ ⟵ عجزٌ ١٠.
    const closed = await auth(http().post(`/pos/shifts/${shift.id}/close`)).send({ declaredClosing: 320 }).expect(201);
    expect(Number(closed.body.variance)).toBe(-10);

    // العمودُ خُزِّن — لا يُعاد حسابُه في التقرير (ق-٣٠٠).
    const stored = await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.posShift.findUniqueOrThrow({ where: { id: shift.id }, select: { variance: true } }),
    );
    expect(Number(stored.variance)).toBe(-10);

    // والقيدُ رُحِّل: الدرجُ ينقص و`5900` يزيد مديناً.
    expect(await balanceOf(drawer.accountId)).toBe(drawerBefore - 10);
    expect(await codeBalance('5900')).toBe(varianceBefore + 10);
  }, 60000);

  it('🔴 والزيادةُ تنقلب جانباً — الاتجاهُ الثاني لا العجزُ وحده', async () => {
    const shift = await openShift(drawer.id, 100);
    await ringCash(2).expect(201); // ٢٠٠ + ضريبة ١٥٪ = ٢٣٠

    const drawerBefore = await balanceOf(drawer.accountId);
    const varianceBefore = await codeBalance('5900');

    // المعدود ٣٤٥ والمتوقَّع ٣٣٠ ⟵ زيادةٌ ١٥.
    const closed = await auth(http().post(`/pos/shifts/${shift.id}/close`)).send({ declaredClosing: 345 }).expect(201);
    expect(Number(closed.body.variance)).toBe(15);

    expect(await balanceOf(drawer.accountId)).toBe(drawerBefore + 15);
    // `5900` مصروف: الزيادةُ تُقيَّد دائنةً فينقص رصيدُه على طرفه الطبيعي.
    expect(await codeBalance('5900')).toBe(varianceBefore - 15);
  }, 60000);

  /**
   * ⛔ **وجهٌ ثالثٌ للعطل نفسه — لم يُبنَ له توكيدٌ عمداً** (يُعرض على المالك):
   *
   * **الردُّ النقديُّ لبيع كاشير مستحيلٌ اليوم**: `refundableOf` يقيس المسدَّد
   * من صفوف `Payment`، **وبيعُ الكاشير لا يُنشئ صفَّ دفعةٍ إطلاقاً** — فيبدو
   * غيرَ مسدَّد، فيُستهلك الإشعارُ الدائن في «خصم غير المسدَّد» ويعود القابلُ
   * للردّ **صفراً** (`400 refund_nothing_refundable`، مقيسٌ في هذه المجموعة).
   *
   * ⟵ **فالعلّةُ أعمقُ من غياب القيد**: بيعُ الكاشير **غيرُ مرئيٍّ لوحدة
   * الدفعات كلِّها** — الأعمارُ تعدّه ديناً، والردُّ يرفضه. **وتوجيهُ الردّ
   * إلى الدرج مبنيٌّ هنا وينشط ساعةَ يصير للبيع صفُّ دفعة** — ولا يُختبر قبلها
   * كي **لا يُثبَّت عطلٌ في توكيد** (`ق-٢٨٤`).
   */
  it('وصفرُ الفرق لا يُرحَّل قيداً — فقيدٌ بصفر ضجيجٌ في الأستاذ', async () => {
    const shift = await openShift(drawer.id, 100);
    await ringCash(2).expect(201); // ٢٠٠ + ضريبة ١٥٪ = ٢٣٠

    const varianceBefore = await codeBalance('5900');
    const closed = await auth(http().post(`/pos/shifts/${shift.id}/close`)).send({ declaredClosing: 330 }).expect(201);

    expect(Number(closed.body.variance)).toBe(0);
    expect(await codeBalance('5900')).toBe(varianceBefore);
  }, 60000);
});
