import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../app.module';
import { encryptSecret } from '../common/crypto/secret.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { LIVE_SPEC_TIMEOUT_MS } from '../../test/live-spec-timeout';
import { GENESIS_PREVIOUS_HASH, latestChainHash, nextIcv } from './hash-chain.util';
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
 * وبيانات الاعتماد **فاسدة عمداً**: `signInvoice` يسقط قبل `fetch` أصلاً،
 * وسقوطُ التوقيع **ليس جواباً من الهيئة** (`ق-٩٧١`): يُحرَّر الادّعاء والموقعُ محفوظ،
 * ويُرمى باسمه (`ZatcaAttemptFailedException`) لا يُكتب مردوداً. فموقع السلسلة
 * يُلتزم قبل الإرسال، وهو بالضبط ما نقيسه.
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

    await tenantPrisma.runInTenantContext(companyId, async (tx) => {
      // اعتمادٌ **فاسد عمداً**: يمرّ من بوابة `secretIsSet` ويسقط عند التوقيع،
      // فلا يصل الإرسال أصلاً. والغرض بلوغ المعاملة، لا إتمام الإرسال.
      await tx.zatcaCredential.create({
        data: {
          companyId,
          privateKeyEnc: encryptSecret('not-a-real-private-key'),
          productionCsidEnc: encryptSecret('not-a-real-certificate'),
          productionSecretEnc: encryptSecret('not-a-real-secret'),
          status: 'PRODUCTION_ISSUED',
        },
      });

      const customer = await tx.customer.create({ data: { companyId, name: 'عميل فحص ICV' } });
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
              create: [{ companyId, description: 'بند فحص', quantity: 1, unitPrice: 100, taxRate: 15 }],
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

  it('① استدعاءان متزامنان يُنتجان موقعين مختلفين — لا تصادم ولا خطأ', async () => {
    const results = await Promise.allSettled(
      invoiceIds.map((id) => zatca.submitInvoice(companyId, 'COMPANY', id)),
    );

    // **لا رفضَ إلا المسمّى**: التوقيعُ يسقط بالمفتاح الفاسد فيُرمى باسمه (`ق-٩٧١`) — وهو
    // المتوقَّع؛ وأيُّ رفضٍ آخر عطلٌ (قبل إعادة المحاولة كان الخاسر يردّ `P2002` خام).
    const rejected = results.filter(
      (r) => r.status === 'rejected' && !((r as PromiseRejectedResult).reason instanceof ZatcaAttemptFailedException),
    );
    if (rejected.length > 0) {
      const reasons = rejected.map((r) => String((r as PromiseRejectedResult).reason?.message ?? r)).join(' | ');
      throw new Error(`استدعاء تزامنيّ رُفض بدل أن يتقارب — ${reasons}`);
    }

    const [a, b] = await Promise.all(invoiceIds.map(icvOf));

    // الموقعان **مسنَدان** ومختلفان. والتوكيد على القيمتين لا على مجرّد النجاح:
    // نجاحٌ بموقعٍ مكرَّر هو العطل بعينه (§8.14).
    expect(a.zatcaIcv).not.toBeNull();
    expect(b.zatcaIcv).not.toBeNull();
    expect(a.zatcaIcv).not.toBe(b.zatcaIcv);

    // ومتتاليان من ١: لا فجوة في السلسلة — الفجوة عطلٌ مستقل عن التكرار.
    expect([a.zatcaIcv, b.zatcaIcv].sort((x, y) => (x ?? 0) - (y ?? 0))).toEqual([1, 2]);
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
    const { defaultUnit, secondUnit, icvDefault, icvSecond, pihDefault, pihSecond } = await tenantPrisma.runInTenantContext(
      companyId,
      async (tx) => {
        const defaultUnit = await tx.egsUnit.findFirstOrThrow({ where: { companyId, kind: 'DEFAULT_WEB' }, select: { id: true } });
        const secondUnit = await tx.egsUnit.create({
          data: { companyId, serial: `1-probe|2-pos|3-${companyId}-${Date.now()}`, kind: 'POS_TERMINAL', label: 'كاشير فحص' },
          select: { id: true },
        });
        // سلفٌ مقبول في الافتراضية — كي يكون للسلسلة ما تُقرأ منه، لا الأساس وحده.
        await tx.invoice.update({
          where: { id: invoiceIds[0] },
          data: { zatcaStatus: 'CLEARED', zatcaHash: 'probe-hash-unit-a', zatcaSubmittedAt: new Date() },
        });
        return {
          defaultUnit,
          secondUnit,
          icvDefault: await nextIcv(tx, defaultUnit.id),
          icvSecond: await nextIcv(tx, secondUnit.id),
          pihDefault: await latestChainHash(tx, defaultUnit.id),
          pihSecond: await latestChainHash(tx, secondUnit.id),
        };
      },
    );

    expect(defaultUnit.id).not.toBe(secondUnit.id);
    // الافتراضية: موقعان محجوزان في ① ⇒ التالي ٣، وسلفُها التجزئة المقبولة.
    expect(icvDefault).toBe(3);
    expect(pihDefault).toBe('probe-hash-unit-a');
    // الثانية: لا شيء بعد ⇒ ١ والأساس. **والافتراضية لم تتأثّر بوجودها.**
    expect(icvSecond).toBe(1);
    expect(pihSecond).toBe(GENESIS_PREVIOUS_HASH);
  });

  it('③ ولم تُلمس شبكة الهيئة ولا مرة — حارسُ هذا الملف بعينه', async () => {
    // لا يضبط هذا الملف `ZATCA_API_BASE_OVERRIDE` كما تفعل حزم الـe2e، فحارسه
    // هو الاعتراض. (وتلك محميّة بتصميمها — انظر رأس الملف.)
    expect(fetchCalls).toBe(0);
  });
});
