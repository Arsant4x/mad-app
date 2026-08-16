import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../app.module';
import { encryptSecret } from '../common/crypto/secret.util';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';
import { LIVE_SPEC_TIMEOUT_MS } from '../../test/live-spec-timeout';
import { ZatcaService } from './zatca.service';

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
 * ثم أضاف الترحيل `@@unique([companyId, zatcaIcv])` فصار التصادم **`P2002`
 * ظاهراً** بدل فسادٍ صامت في سلسلة الهيئة — وهو ما يقيسه الاختبار ② هنا.
 * وهذا الملف يحرس الطبقة الثانية: **إعادة المحاولة تجعله يتقارب** بدل أن يردّ
 * خطأً على التاجر.
 *
 * ## لماذا مجسّ حيّ لا اختبار e2e
 *
 * حزمة الـe2e تدخل بمنشأة مبذورة (`demo-company-a`) — فهي تعتمد على بذرةٍ
 * خارجية، ولا تعمل على شجرةٍ لم تُبذَر. وهذا الملف **مكتفٍ ذاتياً**: يُنشئ
 * منشأته بالمسار الحقيقي، فالتشغيل الثاني أخضر كالأول (§8.13).
 *
 * ## ⛔ ولا تلمس شبكة الهيئة إطلاقاً — والأمر مُختبَر لا موصوف
 *
 * `apiBaseFor(SANDBOX)` يعطي `https://gw-fatoora.zatca.gov.sa/…` — عنوانٌ
 * حكومي حقيقي. فـ`fetch` **يُستبدَل هنا بدالةٍ ترمي**، ثم **يُؤكَّد أنها لم
 * تُستدعَ ولا مرة**. أي أن «لا شبكة» توكيدٌ في الاختبار لا وعدٌ في تعليق.
 *
 * وبيانات الاعتماد **فاسدة عمداً**: `signInvoice` يسقط قبل `fetch` أصلاً،
 * و`dispatch` يلتقط أي سقوط ويختم الفاتورة `REJECTED` — «Any failure marks the
 * invoice REJECTED with the reason rather than leaving it stuck on SUBMITTING».
 * فموقع السلسلة يُلتزم قبل الإرسال، وهو بالضبط ما نقيسه.
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

    // **لا رفض**: قبل إعادة المحاولة كان الخاسر يردّ `P2002` خام.
    const rejected = results.filter((r) => r.status === 'rejected');
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
    // قائماً فعلاً: `invoices_companyId_zatcaIcv_key UNIQUE`.
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
    expect(String(err.message)).toMatch(/invoices_companyId_zatcaIcv_key|Unique constraint/i);
  });

  it('③ ولم تُلمس شبكة الهيئة ولا مرة — توكيد لا وعد', async () => {
    expect(fetchCalls).toBe(0);
  });
});
