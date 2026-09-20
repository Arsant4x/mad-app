import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { AppModule } from '../src/app.module';
import { IsolatedCompany, registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

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
  // منشأةٌ معزولة (ق-٧٢٢): الدرجُ والمناوباتُ في منشأةٍ يصنعها الاختبارُ ويزيلها — لا في منشأة العرض.
  let company: IsolatedCompany;
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
  let branchId = '';

  /**
   * ⚠️ **ويُعاد استعمالُ درجٍ قائمٍ إن وُجد**: النطاقُ نفد فعلاً على قاعدة
   * التطوير — **وهو الجدارُ الذي أنذر منه `ق-٢٩٥`، وقد بلغناه**.
   */
  /**
   * ⚠️ **درجُ هذه المجموعة على فرعها الخاصّ** — لا درجٌ بلا فرع.
   *
   * درجٌ بلا فرعٍ **يغيّر عالمَ مجموعةٍ أخرى**: `resolveDrawerId` يأخذ «الدرجَ
   * النشِطَ الوحيد» للفرع الفارغ، **فمجموعةُ `pos-shift-drawer` التي تتوقّع
   * فراغاً تجده مملوءاً بتركةِ هذه**. **وتركةُ مجموعةٍ ليست بيئةَ أخرى.**
   */
  async function ensureDrawer(): Promise<{ id: string; accountId: string }> {
    const list = (await auth(http().get('/cash-drawers')).expect(200)).body as {
      id: string;
      isActive: boolean;
      branchId: string | null;
      account: { id: string };
    }[];

    // ⚠️ **يُعاد استعمالُ درجٍ قائمٍ على فرعه قبل إنشاء أيّ شيء**: نطاقُ
    // `1010–1099` **تسعون خانةً لا تُعاد** (`ق-٢٩٥`) — **وقد نفد فعلاً على
    // قاعدة التطوير**، فمجموعةٌ تُنشئ درجاً في كل تشغيل تُشارك في استهلاكه.
    const existing = list.find((d) => d.isActive && d.branchId !== null);
    if (existing) {
      branchId = existing.branchId!;
      return { id: existing.id, accountId: existing.account.id };
    }

    const branch = (await auth(http().post('/branches')).send({ name: `فرعُ قياس الدرج ${suffix}` }).expect(201)).body as { id: string };
    branchId = branch.id;
    const res = await auth(http().post('/cash-drawers')).send({ name: `درج القياس ${suffix}`, branchId }).expect(201);
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
    return (await auth(http().post('/pos/shifts')).send({ openingFloat: float, drawerId, branchId }).expect(201)).body as { id: string };
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

    company = await registerIsolatedCompany(app, 'pos-cash');
    token = company.token;
    companyId = company.companyId;

    productId = (await auth(http().post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنفُ الدرج ${suffix}`, price: UNIT_PRICE }).expect(201)).body.id;
    drawer = await ensureDrawer();
  }, 60000);

  afterAll(async () => {
    await removeIsolatedCompany(app, company);
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

  it('🔴 والردُّ النقديُّ يخرج من الدرج لا من `1000` — نصفُ الإصلاح لا زيادةٌ عليه', async () => {
    await openShift(drawer.id, 100);
    const sale = (await ringCash(1).expect(201)).body as { id: string };

    const note = (await auth(http().post(`/invoices/${sale.id}/credit-note`)).send({ reason: `ردٌّ نقديّ ${suffix}` }).expect(201))
      .body as { id: string };

    const drawerBefore = await balanceOf(drawer.accountId);
    const cashBefore = await codeBalance('1000');

    await auth(http().post('/payments/refund'))
      .send({ creditNoteId: note.id, method: 'CASH', date: new Date().toISOString().slice(0, 10) })
      .expect(201);

    // ⚠️ **الدرجُ ينقص و`1000` لا يُمَسّ**: لو خرج الردُّ من `1000` لأظهر
    // الجردُ فائضاً كاذباً في الدرج — **واتّهم الكاشيرَ بفرقٍ صنعه النظام**.
    expect(await balanceOf(drawer.accountId)).toBe(drawerBefore - 115);
    expect(await codeBalance('1000')).toBe(cashBefore);
  }, 60000);

  it('وصفرُ الفرق لا يُرحَّل قيداً — فقيدٌ بصفر ضجيجٌ في الأستاذ', async () => {
    const shift = await openShift(drawer.id, 100);
    await ringCash(2).expect(201); // ٢٠٠ + ضريبة ١٥٪ = ٢٣٠

    const varianceBefore = await codeBalance('5900');
    const closed = await auth(http().post(`/pos/shifts/${shift.id}/close`)).send({ declaredClosing: 330 }).expect(201);

    expect(Number(closed.body.variance)).toBe(0);
    expect(await codeBalance('5900')).toBe(varianceBefore);
  }, 60000);
});
