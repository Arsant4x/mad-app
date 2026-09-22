import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../app.module';
import { MSG } from '../common/i18n/messages';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { LIVE_SPEC_TIMEOUT_MS } from '../../test/live-spec-timeout';
import { seedProductionCredential } from '../../test/zatca-credential';
import { GENESIS_PREVIOUS_HASH, nextIcv, previousChainHash } from './hash-chain.util';
import * as xades from './ubl/xades.util';
import { ZatcaAttemptFailedException, ZatcaService } from './zatca.service';

// مهلة مقيسة لا افتراضية — الرقم ومصدره في `live-spec-timeout.ts`.
jest.setTimeout(LIVE_SPEC_TIMEOUT_MS);

/**
 * سباق عدّاد فاتورة الهيئة (ICV) — **على الخدمة الحقيقية، لا على نسخةٍ منها**.
 *
 * ## العطل
 *
 * `nextIcv` يبني على `count()+1` بلا قفلٍ ولا تسلسل، داخل معاملةٍ نافذتها
 * واسعة (بناء XML بداخلها). فجولتان متزامنتان تقرآن العدد نفسه فتحسبان الموقع
 * نفسه. والقياس قبل القيد الفريد (2026-08-15): من ١٢ جولة **١١ حملت ICV
 * مكرَّراً** — `1,1,3,3,5,5,…`.
 *
 * ثم أضاف الترحيل قيداً فريداً على الموقع فصار التصادم **`P2002` ظاهراً** بدل
 * فسادٍ صامت في سلسلة الهيئة — وهو ما يقيسه الاختبار ② هنا. (كان القيد على
 * المنشأة؛ ومنذ الدفعة (ب) على الوحدة: `invoices_egsUnitId_zatcaIcv_key` —
 * `ق-١٧٧`. والاختبار ④ يقيس أن وحدةً ثانية تعدّ من `1` ومن الأساس.)
 * وهذا الملف يحرس الطبقة الثانية: **إعادة المحاولة تجعله يتقارب** بدل أن يردّ
 * خطأً على التاجر.
 *
 * ## لماذا مجسّ حيّ لا اختبار e2e
 *
 * حزمة الـe2e تدخل بمنشأة مبذورة (`demo-company-a`) — فهي تعتمد على بذرةٍ
 * خارجية، ولا تعمل على شجرةٍ لم تُبذَر. وهذا الملف **مكتفٍ ذاتياً**: يُنشئ
 * منشأته بالمسار الحقيقي، فالتشغيل الثاني أخضر كالأول (§8.13).
 *
 * ## ⛔ ولا تلمس شبكة الهيئة إطلاقاً — بآليةٍ تخصّ هذا الملف
 *
 * ⚠️ **وهذا ليس تنبيهاً على ثغرةٍ في غيره.** حزم الـe2e التي تصل الإرسال
 * (`zatca-phase2` · `zatca-credit-notes` · حارسا الحذف والتعديل) **محميّة
 * أصلاً وبتصميمٍ مقصود**: كلٌّ منها يضبط `ZATCA_API_BASE_OVERRIDE` على
 * `http://127.0.0.1:9` في `beforeAll` ويحذفه في `afterAll`، و`zatca-compliance-six`
 * تُشغّل خادماً وهمياً محلياً. وتعليقها ينصّ على ذلك:
 *
 *   «Nothing listens on port 9 … only the outbound call fails, so no test
 *    traffic ever reaches gw-fatoora.zatca.gov.sa.»
 *
 * والفرق أن هذا الملف **لا يضبط التجاوز**: يستدعي الخدمة مباشرةً بلا خادم
 * HTTP، فيحتاج حارسه الخاص. فـ`fetch` يُستبدَل بدالةٍ ترمي، **ثم يُؤكَّد أنها
 * لم تُستدعَ ولا مرة** — «لا شبكة» توكيدٌ في الاختبار لا وعدٌ في تعليق.
 *
 * ⚠️ **ونصّ التبرير يُقاس بدقّته لا بحماسته**: صياغةٌ أولى هنا اكتفت بأن
 * `apiBaseFor(SANDBOX)` عنوانٌ حكومي حقيقي — وهو صحيح، لكنه يوحي بأن سائر
 * الحزم مكشوفة وهي ليست. **ونصٌّ يوحي بخطرٍ غير قائم يُفقد الثقة بالتوثيق
 * كله** (قرار المالك 2026-08-16).
 *
 * وبيانات الاعتماد **حقيقيةٌ موقَّعةٌ ذاتياً** (`seedProductionCredential`): يُختم المستندُ
 * فعلاً ويُحفظ موقعُه وبصمتُه، ثم يسقط **النقل** على `fetch` المعترَض — وسقوطُ النقل **ليس
 * جواباً من الهيئة** (`ق-٩٧١`): يبقى المستندُ `STAMPED` بموقعه، ويُرمى باسمه
 * (`ZatcaAttemptFailedException`) لا يُكتب مردوداً. فموقعُ السلسلة يُلتزم عند الختم قبل
 * الإرسال، وهو بالضبط ما نقيسه.
 *
 * ⚠️ **وكان الاعتمادُ فاسداً عمداً** فيسقط التوقيعُ قبل `fetch` والموقعُ يبقى محجوزاً — حتى
 * `ق-١١٩٨`/⑦: موقعٌ بلا بصمةٍ صار يحبس ما بعده، فصار `releaseClaim` يحرّره؛ ومجسٌّ يقيس
 * الموقعَ على توقيعٍ ساقط لم يعد يرى شيئاً. فالختمُ الحقيقيُّ هو ما يُبقي القياسَ قياساً.
 */

const HAS_DB = Boolean(process.env.DATABASE_URL);

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('⚠️  icv-concurrency.live.spec: تُخطّى — لا DATABASE_URL');
}

const d = HAS_DB ? describe : describe.skip;

d('سباق ICV — إعادة المحاولة تُقارب بدل أن تُخطئ', () => {
  const prisma = new PrismaClient();
  let zatca: ZatcaService;
  let tenantPrisma: TenantPrismaService;
  let moduleRef: Awaited<ReturnType<ReturnType<typeof Test.createTestingModule>['compile']>>;

  let companyId: string;
  let customerId: string;
  const invoiceIds: string[] = [];

  /** ⛔ حارسٌ على الشبكة: أي `fetch` هنا خطأٌ في الاختبار نفسه. */
  let fetchCalls = 0;
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      throw new Error('PROBE_NO_NETWORK: المجسّ لا يخاطب شبكة الهيئة');
    }) as typeof globalThis.fetch;

    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    zatca = moduleRef.get(ZatcaService);
    tenantPrisma = moduleRef.get(TenantPrismaService);

    const template = await prisma.permissionTemplate.findFirstOrThrow({
      where: { companyId: null },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const identity = await prisma.loginIdentity.create({
      data: {
        username: `probe-icv-${stamp}`,
        passwordHash: 'probe-not-a-real-hash',
        actorType: 'COMPANY',
        company: {
          create: {
            orgName: `probe-icv-${stamp}`,
            permissionTemplateId: template.id,
            legalName: `مؤسسة فحص ${stamp}`,
            vatNumber: '300000000000003',
          },
        },
      },
      include: { company: { select: { id: true } } },
    });
    companyId = identity.company!.id;

    // اعتمادٌ حقيقيٌّ موقَّعٌ ذاتياً: يُختم المستندُ فيُحفظ موقعُه، ويسقط النقلُ على المعترَض (رأس الملف).
    await seedProductionCredential(tenantPrisma, companyId);

    await tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const customer = await tx.customer.create({ data: { companyId, kind: 'NATURAL', name: 'عميل فحص ICV' } });
      customerId = customer.id;

      for (let i = 1; i <= 2; i += 1) {
        const invoice = await tx.invoice.create({
          data: {
            companyId,
            no: `ICV-PROBE-${stamp}-${i}`,
            customerId,
            issueDate: new Date('2026-01-15T00:00:00.000Z'),
            dueDate: new Date('2026-02-15T00:00:00.000Z'),
            subtotal: 100,
            taxTotal: 15,
            total: 115,
            baseSubtotal: 100,
            baseTaxTotal: 15,
            baseTotal: 115,
            lines: {
              create: [{ companyId, description: 'بند فحص', quantity: 1, unitPrice: 100, taxRate: 15, taxCategory: 'S' }],
            },
          },
        });
        invoiceIds.push(invoice.id);
      }
    });
  });

  afterAll(async () => {
    globalThis.fetch = realFetch;
    await moduleRef?.close();
    await prisma.$disconnect();
  });

  const icvOf = (id: string) =>
    tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.invoice.findUniqueOrThrow({ where: { id }, select: { zatcaIcv: true, zatcaStatus: true } }),
    );

  it('⓪ حارسٌ على المجسّ: الفاتورتان تبدآن بلا موقع في السلسلة', async () => {
    // بدونه، فاتورةٌ تحمل ICV سلفاً تجعل `?? ` يتخطّى `nextIcv` — فلا سباق
    // أصلاً، ويعطي الملف «لا عطل» كذباً.
    const [a, b] = await Promise.all(invoiceIds.map(icvOf));
    expect(a.zatcaIcv).toBeNull();
    expect(b.zatcaIcv).toBeNull();
  });

  /**
   * «الطابورُ يعود إليه بعد أن يُختم سلفُه» (`ق-١١٩٨`/⑦ — تعليقُ `stampIfNeeded`): الخاسرُ في السباق
   * يقرأ سلفَه محجوزاً بلا بصمة **في النافذة بين التزام ادّعاء الفائز وحفظ بصمته** فيُرفض باسمه
   * (`ConflictException` لا `P2002` — فلا يلفّه `retryOnUniqueConflict`). هذا يمثّل الطابور: على
   * ذلك الرفض بعينه **ينتظر حالةً لا زمناً** (لا موقعَ محجوزاً بلا بصمة — قراءةٌ من القاعدة) ثم يعيد
   * الإرسال. وأيُّ رفضٍ آخر يُرمى كما هو.
   *
   * ⚠️ **وكان الاختبارُ يعتمد على مصادفة التوقيت** بعد `ق-١١٩٨`: أخضرُ حين يصل الخاسرُ بعد حفظ البصمة،
   * وأحمرُ حين يصل قبلها (`§8.2.1` — سقط على السير `35516939838` وهو نفسُه على الشجرة نفسِها مرّ مرّتين).
   */
  let chainWaits = 0;
  /**
   * إلزامُ التداخل بإشارةٍ لا بزمن (`ق-١٢٦٥`/ب — `ق-٨٢٠`): توقيعُ الفائز يُحبس حتى يقرأ الخاسرُ سلفَه محجوزاً
   * بلا بصمة ويُرفض باسمه — **ثم** يُطلَق. فالنافذةُ التي يقيسها الاختبارُ مضمونةٌ في كلِّ تشغيل، لا مرهونةً بأن
   * تكون `600 ms` أطولَ من مسار الخاسر تحت الحِمل (كانت تحت الحِمل أقصرَ فيصل الخاسرُ بعد حفظ البصمة:
   * `chainWaits = 0` — أخضرُ وحدَه وأحمرُ في المحطّة، أي حارسٌ يشهد لبيئته).
   */
  let releaseWinner: () => void = () => {};
  const winnerMayFinish = new Promise<void>((resolve) => {
    releaseWinner = resolve;
  });
  const waitUntilNoClaimWithoutHash = async () => {
    for (let poll = 0; poll < 400; poll += 1) {
      const pending = await tenantPrisma.runInTenantContext(companyId, (tx) =>
        tx.invoice.count({ where: { id: { in: invoiceIds }, zatcaIcv: { not: null }, zatcaHash: null } }),
      );
      if (pending === 0) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('سلفٌ محجوزٌ بلا بصمة لم يُختم خلال ١٠ ثوانٍ — الطابورُ لا يجد ما يعود إليه');
  };
  const submitAsTheQueueWould = async (id: string) => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await zatca.submitInvoice(companyId, 'COMPANY', id);
      } catch (e) {
        if (e instanceof ConflictException && String(e.message).startsWith(MSG.zatca_previous_unstamped)) {
          chainWaits += 1;
          // الخاسرُ رأى النافذة — فليُطلَق الفائزُ الآن ليحفظ بصمتَه، ثم يُنتظَر حالةً لا زمناً.
          releaseWinner();
          await waitUntilNoClaimWithoutHash();
          continue;
        }
        throw e;
      }
    }
    throw new Error('لم يتقارب بعد ثلاث عودات — السلفُ يُختم ولا يُرفع الحبس');
  };

  it('① استدعاءان متزامنان يُنتجان موقعين مختلفين — الخاسرُ يُرفض باسمه ويعود بعد ختم سلفه، ولا تصادم', async () => {
    // إلزامُ التداخل (`§8.8` الوجه الثالث — `ق-٨٢٠` · `ق-١٢٦٥`/ب): أوّلُ توقيعٍ (الفائزُ بالادّعاء) **يُحبس على
    // إشارةٍ** يطلقها الخاسرُ حين يقرأ سلفَه محجوزاً بلا بصمة — لا على نومٍ ثابت قد يقصر عن مسار الخاسر تحت الحِمل.
    // فالنافذةُ مضمونةٌ **في كل تشغيل لا في بعضه**، والدالّةُ الحقيقيةُ تُستدعى بعد الإطلاق فالختمُ ختمٌ حقيقيّ.
    // وسقفُ الحبس يسمّي العطلَ إن لم يبلغ الخاسرُ القراءةَ أصلاً — لا تعليقٌ صامت.
    const realSign = xades.signInvoice;
    let delayedOnce = false;
    const sign = jest.spyOn(xades, 'signInvoice').mockImplementation(async (input) => {
      if (!delayedOnce) {
        delayedOnce = true;
        let cap: NodeJS.Timeout | undefined;
        await Promise.race([
          winnerMayFinish,
          new Promise<never>((_, reject) => {
            cap = setTimeout(() => reject(new Error('الخاسرُ لم يقرأ سلفَه محجوزاً خلال ١٠ ثوانٍ — التداخلُ لم يقع فالحارسُ لا يقيس')), 10_000);
          }),
        ]).finally(() => clearTimeout(cap));
      }
      return realSign(input);
    });

    let results: PromiseSettledResult<unknown>[];
    let signCalls = 0;
    try {
      results = await Promise.allSettled(invoiceIds.map(submitAsTheQueueWould));
      signCalls = sign.mock.calls.length;
    } finally {
      // ⚠️ `mockRestore` يمسح سجلَّ النداءات مع الاستعادة — فالعدُّ يُلتقط قبله لا بعده.
      sign.mockRestore();
    }
    // حارسٌ على المجسّ: التوقيعُ استُدعي مرّةً لكلِّ فاتورة عبر البديل — فالإبطاءُ وقع على المسار فعلاً.
    expect(signCalls).toBe(invoiceIds.length);

    // **لا رفضَ إلا المسمّى**: النقلُ يسقط على `fetch` المعترَض فيُرمى باسمه (`ق-٩٧١`) — وهو
    // المتوقَّع؛ وأيُّ رفضٍ آخر عطلٌ (قبل إعادة المحاولة كان الخاسر يردّ `P2002` خام).
    const rejected = results.filter(
      (r) => r.status === 'rejected' && !((r as PromiseRejectedResult).reason instanceof ZatcaAttemptFailedException),
    );
    if (rejected.length > 0) {
      const reasons = rejected.map((r) => String((r as PromiseRejectedResult).reason?.message ?? r)).join(' | ');
      throw new Error(`استدعاء تزامنيّ رُفض بدل أن يتقارب — ${reasons}`);
    }

    // **والرفضُ المسمّى وقع مرّةً بالضبط**: الخاسرُ قرأ سلفَه محجوزاً بلا بصمة فرُفض ثم عاد — لا صفراً
    // (تخطّى السلفَ إلى الأصل: التفرّعُ الذي تمنعه `ق-١١٩٨`) ولا أكثر (لم يُرفع الحبسُ بعد الختم).
    expect(chainWaits).toBe(1);

    const [a, b] = await Promise.all(invoiceIds.map(icvOf));

    // الموقعان **مسنَدان** ومختلفان. والتوكيد على القيمتين لا على مجرّد النجاح:
    // نجاحٌ بموقعٍ مكرَّر هو العطل بعينه (§8.14).
    expect(a.zatcaIcv).not.toBeNull();
    expect(b.zatcaIcv).not.toBeNull();
    expect(a.zatcaIcv).not.toBe(b.zatcaIcv);

    // ومتتاليان من ١: لا فجوة في السلسلة — الفجوة عطلٌ مستقل عن التكرار.
    expect([a.zatcaIcv, b.zatcaIcv].sort((x, y) => (x ?? 0) - (y ?? 0))).toEqual([1, 2]);

    // وسلفُ الموقع ٢ بصمةُ الموقع ١ بعينها — لا الأصل: السلسلةُ لم تتفرّع بالسباق.
    const chain = await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.invoice.findMany({ where: { id: { in: invoiceIds } }, select: { zatcaIcv: true, zatcaHash: true, zatcaPreviousHash: true }, orderBy: { zatcaIcv: 'asc' } }),
    );
    expect(chain[0].zatcaPreviousHash).toBe(GENESIS_PREVIOUS_HASH);
    expect(chain[0].zatcaHash).toBeTruthy();
    expect(chain[1].zatcaPreviousHash).toBe(chain[0].zatcaHash);
  });

  it('② القيد الفريد قائم فعلاً — الطبقة الأولى تحت إعادة المحاولة', async () => {
    // إعادة المحاولة تعالج العَرَض، والقيد هو ما يمنع الفساد الصامت. فسقوطه
    // يجعل الاختبار ① يمرّ بموقعين مكرَّرين دون أن يشعر أحد.
    //
    // ⚠️ **تُقرأ القيمتان ولا تُفترضان.** أول صياغة كتبت `zatcaIcv: 1` على
    // الفاتورة الثانية — ولو كانت هي صاحبة الموقع ١ لكان التحديث **بلا
    // تغيير**، فلا ينتهك القيد ويُقرأ ذلك «القيد غير قائم» كذباً. والقيد كان
    // قائماً فعلاً: `invoices_egsUnitId_zatcaIcv_key UNIQUE` (وقبل (ب): على المنشأة).
    const [first, second] = await Promise.all(invoiceIds.map(icvOf));
    expect(first.zatcaIcv).not.toBe(second.zatcaIcv);

    const err = await tenantPrisma
      .runInTenantContext(companyId, (tx) =>
        // تُسنَد قيمةُ الأخرى بعينها — تصادمٌ مضمون أياً كان توزيع المواقع.
        tx.invoice.update({ where: { id: invoiceIds[1] }, data: { zatcaIcv: first.zatcaIcv } }),
      )
      .then(() => null)
      .catch((e: Error) => e);

    if (!(err instanceof Error)) throw new Error('القيد الفريد على zatcaIcv غير قائم — التكرار مرّ');
    expect(String(err.message)).toMatch(/invoices_egsUnitId_zatcaIcv_key|Unique constraint/i);
  });

  it('④ العدّاد والسلسلة داخل الوحدة: وحدةٌ ثانية تبدأ من ١ ومن الأساس — والأولى لا تتأثّر', async () => {
    // الدفعة (ب) (`ق-١٧٧`): نصّ الهيئة «تسلسلٌ واحد لكل EGS ربطها». يُقاس على
    // القاعدة الحقيقية لا على نسخة: بعد ① تحمل الوحدة الافتراضية موقعَين، فوحدةٌ
    // ثانية في المنشأة نفسها **يجب** أن تعدّ من ١ وتقرأ الأساس — وإلا فالعدّ ما
    // زال على المنشأة مهما قال المخطَّط.
    const { defaultUnit, secondUnit, second, icvDefault, icvSecond, pihDefault, pihSecond } = await tenantPrisma.runInTenantContext(
      companyId,
      async (tx) => {
        const defaultUnit = await tx.egsUnit.findFirstOrThrow({ where: { companyId, kind: 'DEFAULT_WEB' }, select: { id: true } });
        const secondUnit = await tx.egsUnit.create({
          data: { companyId, serial: `1-probe|2-pos|3-${companyId}-${Date.now()}`, kind: 'POS_TERMINAL', label: 'كاشير فحص' },
          select: { id: true },
        });
        // سلفُ الافتراضية الموقعُ ٢ بعينه — مختومٌ في ① ولم تُجبه الهيئة (النقلُ سقط): `STAMPED`
        // لا `CLEARED` (ق-١١٩٨/⑦: السلفُ `ICV − 1` أيّاً كانت حالتُه) — يُقرأ كما هو لا يُزوَّر.
        const second = await tx.invoice.findFirstOrThrow({ where: { id: { in: invoiceIds }, zatcaIcv: 2 }, select: { zatcaStatus: true, zatcaHash: true } });
        const icvDefault = await nextIcv(tx, defaultUnit.id);
        const icvSecond = await nextIcv(tx, secondUnit.id);
        return {
          defaultUnit,
          secondUnit,
          second,
          icvDefault,
          icvSecond,
          pihDefault: await previousChainHash(tx, defaultUnit.id, icvDefault),
          pihSecond: await previousChainHash(tx, secondUnit.id, icvSecond),
        };
      },
    );

    expect(defaultUnit.id).not.toBe(secondUnit.id);
    // الافتراضية: موقعان محجوزان في ① ⇒ التالي ٣، وسلفُها بصمةُ الموقع ٢ — مختوماً لا مقبولاً.
    expect(second.zatcaStatus).toBe('STAMPED');
    expect(second.zatcaHash).toBeTruthy();
    expect(icvDefault).toBe(3);
    expect(pihDefault).toBe(second.zatcaHash);
    // الثانية: لا شيء بعد ⇒ ١ والأساس. **والافتراضية لم تتأثّر بوجودها.**
    expect(icvSecond).toBe(1);
    expect(pihSecond).toBe(GENESIS_PREVIOUS_HASH);
  });

  it('③ ولم تُلمس شبكة الهيئة — الاعتراضُ في المسار فعلاً: استُدعي مرّةً لكلّ إبلاغٍ ورمى قبل أيّ شبكة', async () => {
    // لا يضبط هذا الملف `ZATCA_API_BASE_OVERRIDE` كما تفعل حزم الـe2e، فحارسه هو الاعتراض
    // (وتلك محميّة بتصميمها — انظر رأس الملف). والتوكيدُ على أن المعترَض **هو الذي استُدعي**:
    // صفرُ استدعاءاتٍ كان يعني أن التوقيع سقط قبل النقل — وهذا ما لم يعد يُقاس (ق-١١٩٨/⑦).
    expect(fetchCalls).toBe(invoiceIds.length);
    expect(globalThis.fetch).not.toBe(realFetch);
  });
});
