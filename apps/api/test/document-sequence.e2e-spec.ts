import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { purgeInvoicesForTest } from './purge-invoices';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { nextDocumentNumber } from '../src/common/document-sequence.util';
import { isSequencePortReady } from '../src/common/sequence-allocator';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (9.3 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(30000);

/**
 * **العدّادُ الذرّيّ للمستندات** (`ق-٣٢٨`) — والبذرُ **بنيةً لا انضباطاً**.
 *
 * ── ما يُثبَت هنا ─────────────────────────────────────────────────────────
 *
 * ⚠️ **أخطرُ ما في هذا البناء بذرٌ يقع مرّتين**: يُعيد العدّادَ إلى رقمٍ
 * **مستعمَل**، فيُصدر النظامُ فاتورتين برقمٍ واحد — **وهو ما لا يُصلَح بعد
 * الإصدار**. فالشرطُ الذي أُمرنا به: «تشغيلٌ ثانٍ للبذر لا يغيّر شيئاً»،
 * **مُثبَتاً بالعكس**.
 *
 * ── ولماذا يُستدعى المصدرُ نفسه هنا ──────────────────────────────────────
 *
 * ⚠️ **الاختبارُ يستدعي `nextDocumentNumber` نفسها**، لا نسخةً من جملتَي
 * `SQL` في ملفِّ اختبار: **نسخةٌ تُثبت النسخة**، فلو بُدِّل `DO NOTHING`
 * بـ`DO UPDATE` في المصدر لبقيت النسخةُ خضراء والعدّادُ مكسور.
 *
 * ── والمجسُّ نفسُه يُختبر بحالتين ─────────────────────────────────────────
 *
 * ⚠️ **توكيدٌ لا يعرف أن يسقط ليس توكيداً**: فبعد كل إثباتٍ موجَب يأتي
 * **الوجهُ الساقط** — يُحذف صفُّ العدّاد فيُبذَر ثانيةً فعلاً، **فيرجع الرقمُ
 * إلى الوراء أمام العين**. فما يراه الاختبارُ ثباتاً هو ثباتٌ، لا عمىً.
 *
 * ── ونوعُ السلسلة اصطناعيّ عمداً ──────────────────────────────────────────
 *
 * `TSEQ` **ليس سلسلةً يُصدرها النظام**: فالإثباتُ يجري على **الدالّة نفسها**
 * بلا أن يمسّ عدّاداً حقيقياً — **ولا رقمٌ صدر يتغيّر**. وآخرُ اختبارٍ يعبر
 * المسارَ الحقيقيّ كاملاً عبر `HTTP` ليُثبت أن الشكل والاتصال باقيان.
 */
describe('عدّادُ تسلسل المستندات (e2e)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let token: string;
  let companyId: string;
  const suffix = Date.now();
  /** أنواعٌ اصطناعية أُنشئت في هذا التشغيل — تُحذف كلُّها في النهاية. */
  const kinds: string[] = [];

  const http = () => request(app.getHttpServer());
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);

  const DATE = new Date('2026-06-15T00:00:00.000Z');
  const YEAR = 2026;

  /** نوعٌ فريدٌ لكل توكيد — فلا يرث توكيدٌ عدّادَ سابقه (ق-٣٢٦: التسرّب). */
  function freshKind(label: string): string {
    const kind = `TSEQ${label}${suffix % 100000}`;
    kinds.push(kind);
    return kind;
  }

  /**
   * يستدعي المصدرَ نفسه. و`seed` هو ما سيقرأه البذرُ **إن جرى** — فتغييرُه
   * بين نداءَين هو المجسّ: **لو بُذر ثانيةً لظهر أثرُه في الرقم**.
   */
  async function issue(kind: string, seed: number, counter?: { calls: number }): Promise<string> {
    return tenantPrisma.runInTenantContext(companyId, (tx) =>
      nextDocumentNumber(tx, companyId, DATE, { kind, pad: 4 }, async (_prefix) => {
        if (counter) counter.calls += 1;
        return seed;
      }),
    );
  }

  const counterRow = async (kind: string) =>
    tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.documentSequence.findFirst({ where: { kind, year: YEAR }, select: { last: true } }),
    );

  const dropCounter = async (kind: string) =>
    tenantPrisma.runInTenantContext(companyId, (tx) => tx.documentSequence.deleteMany({ where: { kind, year: YEAR } }));

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    const login = await http().post('/auth/login').send({ username: 'demo-company-a', password: 'DemoPass123!' });
    token = login.body.accessToken;
    companyId = login.body.user.companyId;
    tenantPrisma = app.get(TenantPrismaService);
  }, 30000);

  afterAll(async () => {
    for (const kind of kinds) await dropCounter(kind);
    await app.close();
  }, 30000);

  it('🔴 والمنفذُ متصلٌ قبل أول مستند — فالكلفةُ على الإقلاع لا على تاجر', () => {
    // ⚠️ **العطلُ المقيس** (`ق-٣٥٥`): الاتصالُ الكسول جعل **أول إنشاء مستندٍ
    // في الملف يدفع كلفةَ الفتح** — فسقطت مجموعتان بمهلة الخمس ثوانٍ، **وفي
    // المنشورة تقع على أول فاتورةٍ بعد كل نشر**.
    //
    // ⚠️ **ويُثبَت بالآليّة لا بالزمن**: «الطلبُ الأول سريع» يقيس عتادَ الجهاز
    // ويسقط على سيرٍ بطيء. **فيُقرأ أن الاتصال قائمٌ فعلاً** — ولم يُطلب هنا
    // رقمٌ بعدُ، فالجاهزيّةُ من الإقلاع وحده.
    expect(isSequencePortReady()).toBe(true);
  });

  it('🔴 وما لا يُبذَر يبدأ من صفر: أولُ رقمٍ ‎0001‎ لا ‎0002‎', async () => {
    const kind = freshKind('A');
    // `last` **آخرُ ما صدر لا التالي** — فسلسلةٌ لا سابقَ لها تُبذَر بصفر.
    expect(await issue(kind, 0)).toBe(`${kind}-${YEAR}-0001`);
    expect((await counterRow(kind))?.last).toBe(1);
  }, 20000);

  it('🔴 وسلسلةٌ قائمة تُبذَر من أعلى رقمٍ صدر — فلا رقمٌ يتكرّر', async () => {
    const kind = freshKind('B');
    expect(await issue(kind, 40)).toBe(`${kind}-${YEAR}-0041`);
  }, 20000);

  it('🔴 تشغيلٌ ثانٍ للبذر لا يغيّر شيئاً — ولا يُقرأ الأعلى أصلاً', async () => {
    const kind = freshKind('C');
    const probe = { calls: 0 };

    expect(await issue(kind, 40, probe)).toBe(`${kind}-${YEAR}-0041`);
    expect(probe.calls).toBe(1);

    // ⚠️ **والبذرةُ الثانية تُعطى قيمةً مناقضة** (صفراً بعد ٤٠): فلو جرى البذرُ
    // ثانيةً لعاد الرقمُ إلى `0001` — **رقمٌ مستعمَل**. وثباتُه على `0042` هو
    // الإثباتُ عينُه.
    expect(await issue(kind, 0, probe)).toBe(`${kind}-${YEAR}-0042`);
    expect(await issue(kind, 999, probe)).toBe(`${kind}-${YEAR}-0043`);

    // **ولا قراءةَ بعد الأولى**: وهذا شطرُ العلّة الآخر — المسحُ الكامل كان
    // يتكرّر في كل طلب، **فصار مرّةً في عمر السلسلة**.
    expect(probe.calls).toBe(1);
    expect((await counterRow(kind))?.last).toBe(43);
  }, 30000);

  it('🔴 والوجهُ الساقط: يُحذف العدّاد فيُبذَر فعلاً — فيرجع الرقمُ إلى الوراء', async () => {
    // ⚠️ **هذا مجسُّ المجسّ**: التوكيدُ السابق يقول «لم يتغيّر شيء» — وهنا
    // **يُكسر الشرطُ عمداً** ليُرى التغيُّر. فلو بقي الرقمُ صاعداً هنا أيضاً
    // لكان التوكيدُ السابق **أعمى** لا صادقاً.
    const kind = freshKind('D');
    const probe = { calls: 0 };

    expect(await issue(kind, 40, probe)).toBe(`${kind}-${YEAR}-0041`);

    const removed = await dropCounter(kind);
    // **ويُتحقَّق أن الكسر وقع** قبل قراءة نتيجته (ق-٣٠٦).
    expect(removed.count).toBe(1);
    expect(await counterRow(kind)).toBeNull();

    expect(await issue(kind, 0, probe)).toBe(`${kind}-${YEAR}-0001`);
    expect(probe.calls).toBe(2);
  }, 30000);

  it('🔴 وطالبان معاً على سلسلةٍ لم تُنشأ بعدُ: رقمان مختلفان لا واحد', async () => {
    // ⚠️ **التزامنُ عند الإنشاء نفسه**: كلاهما يجد الصفَّ غائباً فيبذر. والقيدُ
    // الفريد يوقف الثاني حتى يلتزم الأول ثم **لا يفعل شيئاً** — فتُعطي
    // الزيادتان رقمين متتاليين. **وهذا ما لا يضمنه `MAX+1` مهما سرُع.**
    const kind = freshKind('E');
    const [a, b] = await Promise.all([issue(kind, 7), issue(kind, 7)]);

    expect(a).not.toBe(b);
    expect([a, b].sort()).toEqual([`${kind}-${YEAR}-0008`, `${kind}-${YEAR}-0009`]);
    expect((await counterRow(kind))?.last).toBe(9);
  }, 30000);

  it('🔴 ومعاملةٌ تسقط تحرق رقماً — الخاصيّةُ الجديدة تُثبَت لا تُوصف', async () => {
    // ⚠️ **انقلبت بـ`ق-٣٤٤`**: كانت الزيادةُ داخل معاملة العمل فترتدّ معها،
    // **وكان ثمنُها أن يُسلسل قفلُ الصفِّ معاملةَ البيع كاملةً** حتى سقطت ثلاثُ
    // بيوعٍ متزامنة على `CI` (`ق-٣٤٢`). **فصارت على منفذٍ يلتزم فوراً**،
    // **والفجوةُ ثمنٌ معلَن** من صنفِ ما أُقرّ في `ق-٣٣٢`.
    const kind = freshKind('F');
    expect(await issue(kind, 0)).toBe(`${kind}-${YEAR}-0001`);

    await expect(
      tenantPrisma.runInTenantContext(companyId, async (tx) => {
        await nextDocumentNumber(tx, companyId, DATE, { kind, pad: 4 }, async () => 0);
        throw new Error('إسقاطٌ متعمَّد');
      }),
    ).rejects.toThrow('إسقاطٌ متعمَّد');

    // **الرقمُ ‎0002‎ أُخذ ولم يُستعمل** — فالتالي ‎0003‎ لا ‎0002‎.
    expect(await issue(kind, 0)).toBe(`${kind}-${YEAR}-0003`);
  }, 30000);

  it('🔴 والعزلُ على هذا المسار تحديداً — حيّاً لا بقراءة الهجرة', async () => {
    // ⚠️ **المنفذُ يتجاوز امتدادَ العزل**، فتبقى `FORCE ROW LEVEL SECURITY`
    // وحدها. **وقد قِيس خمس مراتٍ أنها هي الفارق** — فتُقاس هنا على المنفذ
    // نفسه لا على الجدول عموماً (`ق-٣٤٩`).
    const kind = freshKind('G');
    expect(await issue(kind, 40)).toBe(`${kind}-${YEAR}-0041`);

    const loginB = await http().post('/auth/login').send({ username: 'demo-company-b', password: 'DemoPass123!' });
    const companyB = loginB.body.user.companyId as string;
    expect(companyB).not.toBe(companyId);

    // **عدّادُ «أ» لا يُقرأ من سياق «ب»** — والصفُّ موجودٌ فعلاً (أُثبت أعلاه).
    const seenByB = await tenantPrisma.runInTenantContext(companyB, (tx) =>
      tx.documentSequence.findFirst({ where: { kind, year: YEAR }, select: { last: true } }),
    );
    expect(seenByB).toBeNull();

    // **ولا يُكتب فوقه**: «ب» يبدأ سلسلتَه من صفرٍ بمفتاحٍ متطابق.
    const bFirst = await tenantPrisma.runInTenantContext(companyB, (tx) =>
      nextDocumentNumber(tx, companyB, DATE, { kind, pad: 4 }, async () => 0),
    );
    expect(bFirst).toBe(`${kind}-${YEAR}-0001`);

    // **و«أ» لم يتأثّر** — عدّادان مستقلّان تحت مفتاحٍ واحد.
    expect(await issue(kind, 40)).toBe(`${kind}-${YEAR}-0042`);

    await tenantPrisma.runInTenantContext(companyB, (tx) => tx.documentSequence.deleteMany({ where: { kind, year: YEAR } }));
  }, 40000);

  it('🔴 والمسارُ الحقيقيّ عبر HTTP: الشكلُ باقٍ والأرقامُ متتالية صاعدة', async () => {
    // **ولا شكلَ يتغيّر ولا رقمٌ صدر**: الفاتورةُ تبقى `INV-<سنة>-####`،
    // والرقمُ الجديد **أعلى** مما في القاعدة لا مساوٍ له.
    // ⚠️ **والمساران يعيدان مصفوفةً لا صفحة** — قُرئ شكلُهما من المتحكّم لا
    // من عادةِ بقيّة المسارات (ق-٣١١: القائمةُ تُقرأ من مصدرها).
    const before = (await auth(http().get('/invoices')).expect(200)).body as { no: string }[];
    const year = new Date().getUTCFullYear();
    const prefix = `INV-${year}-`;
    const highestBefore = before
      .filter((i) => i.no.startsWith(prefix))
      .reduce((max, i) => Math.max(max, Number(i.no.slice(prefix.length))), 0);

    const customers = (await auth(http().get('/customers')).expect(200)).body as { id: string }[];
    if (!customers.length) throw new Error('لا عميلَ في بيانات العرض — والفاتورةُ تحتاج واحداً');

    const issueDate = new Date().toISOString().slice(0, 10);
    const make = async () =>
      (
        await auth(http().post('/invoices'))
          .send({
            customerId: customers[0].id,
            issueDate,
            dueDate: issueDate,
            lines: [{ description: `سطرُ اختبارِ الترقيم ${suffix}`, quantity: 1, unitPrice: 10, taxRate: 15 }],
          })
          .expect(201)
      ).body as { id: string; no: string };

    const first = await make();
    const second = await make();

    expect(first.no).toMatch(new RegExp(`^INV-${year}-\\d{4}$`));
    const n1 = Number(first.no.slice(prefix.length));
    const n2 = Number(second.no.slice(prefix.length));
    expect(n1).toBeGreaterThan(highestBefore);
    expect(n2).toBe(n1 + 1);

    // الصادرُ لا يُحذف عبر الواجهة (ق-٩٤٣) — والتنظيفُ بمسارٍ في سياق المستأجر (ق-٩٥٣).
    await purgeInvoicesForTest(tenantPrisma, companyId, [second.id, first.id]);
  }, 40000);
});
