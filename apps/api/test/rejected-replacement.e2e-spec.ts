import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Crypto } from '@peculiar/webcrypto';
import * as x509 from '@peculiar/x509';
import { encryptSecret } from '../src/common/crypto/secret.util';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { dayEndOf, localDateOf } from '../src/common/wall-clock.util';
import { customerExposure } from '../src/reports/receivables-exposure.util';
import { AppModule } from '../src/app.module';
import { purgeInvoicesForTest } from './purge-invoices';
import { startAuthorityStub, type AuthorityStub } from './zatca-authority-stub';
import { registerIsolatedCompany, removeIsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): ثلاثةُ أضعاف المقيس (55.5 ث) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(170000);

/**
 * ⚖️ **المردودةُ تُغلق ولا تُمسّ، ويُصدَر بدلاً منها جديد** (`ق-٩٥٨` · `ق-٩٦٣` … `ق-٩٦٧`) —
 * الحارسُ الحيّ بسبعته على المسار الحقيقيّ (توقيعٌ فعليّ بشهادةٍ محلّية، والإرسالُ إلى خادمٍ
 * محلّيٍّ يمثّل الهيئة ويجيب بالردّ `400` — فالمردودةُ ردٌّ لا سقوطُ نقل، `ق-٩٧١`):
 *
 *   ① البدلُ رقمٌ جديد من التسلسل **بلا لاحقة**، يحمل الإحالةَ في الصفّ ولا يحملها أمام الهيئة
 *      (**لا `BillingReference`** في مستنده الموقَّع)، بعدّادٍ وتجزئةٍ جديدَين وسلفٍ من آخر مقبول
 *      لا من تجزئة المردودة؛ **والمردودةُ كما هي** بايتاً بايتاً فيما رأته الهيئة.
 *   ② القيد: قيدُ المردودة **يبقى** ويُعكَس بقيدٍ مستقلٍّ مربوطٍ بها — والدفترُ صافياً بيعٌ واحد.
 *   ③ المخزون: إعادةٌ إلى الرفّ ثم خصمٌ جديد — `OUT` ثم `IN` على المردودة، و`OUT` جديدٌ باستهلاكٍ
 *      جديد على البدل؛ والطبقةُ صافياً خصمٌ واحد.
 *   ④ التقاريرُ من مصدرٍ واحد: مردودةٌ **بلا بدل** تُعدّ في الإقرار والتعرّض؛ وبعد البدل تخرج
 *      ويُعدّ البدلُ وحدَه.
 *   ⑤ المقبوض: تخصيصُ المردودة **يُنقل** إلى البدل، والحالةُ تُشتقّ للاثنين، والنقلُ في السجلّ
 *      باسم من نقل ومن أيّ مستندٍ إلى أيّ.
 *   ⑥ التاريخُ بالنوع: القياسيةُ يومُ الإصدار الجديد؛ والمبسَّطةُ يومُ المعاملة الأصليّ ولحظتُها.
 *   ⑦ المنعُ بالشكل: لا إعادةَ إرسال، ولا إشعارَ على مردودة، ولا بدلَ ثانياً، ولا بدلَ عن غير
 *      مردودة، ولا تعديلَ ولا حذفَ للمردودة.
 */
/** الإزاحةُ المعلَنة على البدل والمبسَّطة — الرياض (+03:00). ونافذةُ التعرّض تُبنى منها لا من منطقة العملية (ق-١٠٥٦). */
const ISSUED_OFFSET_MIN = 180;

/**
 * ربعُ البدل: البدلُ القياسيّ يُصدَر **اليومَ** بالإزاحة المعلنة (②)، فربعُه ربعُ اليوم لا ربعٌ مكتوب.
 * كان التوكيدُ يقرأ الربعَ الثالث من 2026 حرفاً، فسقط حين بدأ الربعُ الرابع (2026-10-01) بلا تغيير حرفٍ
 * في الشيفرة: البدلُ دخل ربعَه فعلاً، والحارسُ يقرأ ربعاً آخر. والمردودةُ مؤرَّخةٌ 2026-06-01 فربعُها الثاني ثابت.
 */
function quarterOfToday(): { year: number; quarter: number } {
  const day = localDateOf(new Date(), ISSUED_OFFSET_MIN);
  return { year: Number(day.slice(0, 4)), quarter: Math.floor((Number(day.slice(5, 7)) - 1) / 3) + 1 };
}
const REJECTED_QUARTER = { year: 2026, quarter: 2 };

describe('المردودةُ تُغلق ويُصدَر بدلاً منها جديد (e2e)', () => {
  let app: INestApplication;
  let authority: AuthorityStub;
  let tenantPrisma: TenantPrismaService;
  // منشأةٌ معزولةٌ تُولد وتموت مع الحزمة: نطاقُ أرقام الصناديق في منشأة العرض ممتلئٌ على
  // قاعدة التطوير (ركامُ تشغيلات)، ودفترُها وطبقاتُها لا يشاركهما أحد فتُقاس الفروقُ بلا ضجيج.
  let company: Awaited<ReturnType<typeof registerIsolatedCompany>>;
  let token: string;
  let companyId: string;
  let standardCustomerId: string;
  let simpleCustomerId: string;
  let branchId: string;
  let warehouseId: string;
  let productId: string;
  let cashBoxId: string;
  const created: string[] = [];
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${token}`);
  const server = () => app.getHttpServer();

  const STOCKED = { description: 'صنفٌ مخزني', quantity: 3, unitPrice: 100, taxRate: 15 }; // 300 + 45
  const SERVICE = { description: 'خدمة', quantity: 1, unitPrice: 200, taxRate: 15 }; // 200 + 30

  type Row = NonNullable<Awaited<ReturnType<typeof getInvoice>>>;
  // ما تُثبته المرحلةُ الأولى وتقرؤه اللاحقات.
  let rejectedStd: Row;
  let replacementStd: Row;
  let baseline: { q2: number; qNow: number; exposure: number; layerQty: number; ledger: Map<string, number> };
  const replacementQuarter = quarterOfToday();
  let afterRejected: { q2: number; exposure: number; ledger: Map<string, number> };

  async function seedProductionCredential() {
    const webcrypto = new Crypto();
    x509.cryptoProvider.set(webcrypto as unknown as globalThis.Crypto);
    const keys = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'K-256' }, true, ['sign', 'verify']);
    const cert = await x509.X509CertificateGenerator.createSelfSigned(
      {
        serialNumber: '01',
        name: 'CN=mad-app-test, C=SA',
        notBefore: new Date('2026-01-01'),
        notAfter: new Date('2027-01-01'),
        keys,
        signingAlgorithm: { name: 'ECDSA', hash: 'SHA-256' },
      },
      webcrypto as unknown as globalThis.Crypto,
    );
    const pkcs8 = await webcrypto.subtle.exportKey('pkcs8', keys.privateKey);
    const privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(pkcs8).toString('base64')}\n-----END PRIVATE KEY-----\n`;
    const data = {
      privateKeyEnc: encryptSecret(privateKeyPem),
      productionCsidEnc: encryptSecret(Buffer.from(cert.rawData).toString('base64')),
      productionSecretEnc: encryptSecret('fake-production-secret'),
      status: 'PRODUCTION_ISSUED' as const,
    };
    await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.zatcaCredential.upsert({ where: { companyId }, create: { companyId, ...data }, update: data }),
    );
  }

  function getInvoice(id: string) {
    return tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.invoice.findUnique({
        where: { id },
        include: { lines: { orderBy: { createdAt: 'asc' } }, replacesInvoice: { select: { id: true, no: true } }, replacedBy: { select: { id: true, no: true } } },
      }),
    );
  }

  /** ما رأته الهيئة وما يُعرّف المستند — يجب ألّا يتغيّر منه حرفٌ بعد الإغلاق. */
  function sealedView(r: Row) {
    return {
      no: r.no,
      customerId: r.customerId,
      issueDate: r.issueDate.toISOString(),
      total: r.total.toString(),
      lines: r.lines.map((l) => ({ id: l.id, qty: l.quantity.toString(), price: l.unitPrice.toString() })),
      zatcaStatus: r.zatcaStatus,
      zatcaIcv: r.zatcaIcv,
      zatcaUuid: r.zatcaUuid,
      zatcaHash: r.zatcaHash,
      zatcaPreviousHash: r.zatcaPreviousHash,
      zatcaSignedXml: r.zatcaSignedXml,
      zatcaStampedAt: r.zatcaStampedAt?.toISOString() ?? null,
      journalEntryId: r.journalEntryId,
      egsUnitId: r.egsUnitId,
    };
  }

  async function makeInvoice(customerId: string, line: Record<string, unknown>, extra: Record<string, unknown> = {}) {
    const res = await auth(request(server()).post('/invoices'))
      .send({ customerId, branchId, issueDate: '2026-06-01', dueDate: '2026-06-30', notes: 'ملاحظةٌ أصلية', lines: [line], ...extra })
      .expect(201);
    created.push(res.body.id);
    return res.body.id as string;
  }

  function submit(id: string) {
    return auth(request(server()).post(`/zatca/invoices/${id}/submit`));
  }

  /** مردودةٌ حقيقية: توقيعٌ فعليّ ثم إرسالٌ يجيب عنه الخادمُ المحلّيّ بالردّ `400`. */
  async function makeRejected(customerId: string, line: Record<string, unknown>, extra: Record<string, unknown> = {}): Promise<Row> {
    const id = await makeInvoice(customerId, line, extra);
    const res = await submit(id).expect(201);
    expect(res.body.zatcaStatus).toBe('REJECTED');
    expect(res.body.zatcaIcv).toBeTruthy();
    expect(res.body.zatcaHash).toBeTruthy();
    return (await getInvoice(id))!;
  }

  async function replace(id: string, body: Record<string, unknown> = {}) {
    const res = await auth(request(server()).post(`/invoices/${id}/replacement`)).send(body);
    if (res.status === 201) created.push(res.body.id);
    return res;
  }

  async function declaration(q: { year: number; quarter: number }): Promise<number> {
    const res = await auth(request(server()).get('/obligations/vat-declaration')).query({ year: q.year, quarter: q.quarter }).expect(200);
    return Number(res.body.salesStandard);
  }

  /**
   * نهايةُ اليوم التقويميّ **في الإزاحة المعلَنة** التي يُختم بها البدل (`issuedOffsetMin`) — لا نهايةُ يوم منطقة
   * العملية (ق-١٠٥٦): على سيرٍ يعمل بـ`UTC` بين `21:00` و`24:00` يكون يومُ الرياض تالياً ليومه، فيُختم البدلُ بتاريخ
   * الغد ويسقط من نافذةٍ تنتهي اليوم — وقد سقط هذا التوكيدُ مرّتين داخل تلك النافذة ومرّ خارجها بلا تغيير حرف.
   * والدالّةُ صارت مشتركةً في `wall-clock.util` (`dayEndOf` · ق-١١٩٠) — فلا نسخةَ هنا تفترق عنها.
   */
  function exposureOf(customerId: string): Promise<number> {
    const asOf = dayEndOf(new Date(), ISSUED_OFFSET_MIN);
    return tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const rows = await customerExposure(tx, { asOf, allowedBranchIds: 'all', customerId });
      return rows.filter((r) => r.customerId === customerId).reduce((s, r) => s + r.total, 0);
    });
  }

  function layerQty(): Promise<number> {
    return tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const layers = await tx.inventoryLayer.findMany({ where: { productId }, select: { qtyRemaining: true } });
      return layers.reduce((s, l) => s + Number(l.qtyRemaining), 0);
    });
  }

  /** صافي كلِّ حساب (مدين − دائن) في دفتر المنشأة — للمقارنة قبل/بعد. */
  function ledger(): Promise<Map<string, number>> {
    return tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const sums = await tx.journalLine.groupBy({ by: ['accountId'], _sum: { debit: true, credit: true } });
      return new Map(sums.map((s) => [s.accountId, Math.round((Number(s._sum.debit ?? 0) - Number(s._sum.credit ?? 0)) * 100) / 100]));
    });
  }

  function diff(a: Map<string, number>, b: Map<string, number>): Map<string, number> {
    const out = new Map<string, number>();
    for (const key of new Set([...a.keys(), ...b.keys()])) {
      const d = Math.round(((b.get(key) ?? 0) - (a.get(key) ?? 0)) * 100) / 100;
      if (d !== 0) out.set(key, d);
    }
    return out;
  }

  beforeAll(async () => {
    process.env.SECRETS_ENCRYPTION_KEY ??= 'test-secrets-key-at-least-32-characters-long';
    // خادمٌ محلّيّ يمثّل الهيئة ويجيب بالردّ `400`: يُبنى ويُوقَّع ويُسجَّل الموقعُ فعلاً، والجوابُ
    // ردٌّ حقيقيُّ الشكل (ق-٩٧١) — ولا حركةَ تصل الهيئة.
    authority = await startAuthorityStub('reject');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);

    company = await registerIsolatedCompany(app, 'replacement');
    token = company.token;
    companyId = company.companyId;
    await auth(request(server()).patch('/company-profile')).send({ legalName: 'شركة البدل التجارية', vatNumber: '300000000000003' }).expect(200);

    const suffix = Date.now();
    // قياسيّ: رقمٌ ضريبيّ وعنوانٌ مبنيّ كامل (BR-KSA-63) — والمبسَّط بلا رقم.
    standardCustomerId = (
      await auth(request(server()).post('/customers'))
        .send({ kind: 'NATURAL', name: `عميل قياسيّ ${suffix}`, vatNumber: '311111111111113', street: 'شارع الملك فهد', buildingNumber: '1234', district: 'العليا', city: 'الرياض', postalCode: '12345' })
        .expect(201)
    ).body.id;
    simpleCustomerId = (await auth(request(server()).post('/customers')).send({ kind: 'NATURAL', name: `عميل مبسَّط ${suffix}` }).expect(201)).body.id;
    warehouseId = (await auth(request(server()).post('/warehouses')).send({ name: `مستودع البدل ${suffix}` }).expect(201)).body.id;
    branchId = (await auth(request(server()).post('/branches')).send({ name: `فرع البدل ${suffix}`, warehouseId }).expect(201)).body.id;
    productId = (await auth(request(server()).post('/products')).send({ unitCode: 'H87', expiryTracked: false, taxCategory: 'S', name: `صنف البدل ${suffix}`, price: 100, cost: 40 }).expect(201)).body.id;
    const supplierId = (await auth(request(server()).post('/suppliers')).send({ name: `مورّد البدل ${suffix}` }).expect(201)).body.id;
    await auth(request(server()).post('/purchases'))
      .send({ supplierId, date: '2026-05-01', subtotal: 400, warehouseId, branchId, lines: [{ description: 'صنفٌ مخزني', productId, quantity: 10, unitPrice: 40, taxRate: 15 }] })
      .expect(201);
    cashBoxId = (await auth(request(server()).post('/banks')).send({ name: `صندوق البدل ${suffix}`, kind: 'CASH_BOX', openingBalance: 0, openingDate: '2026-05-01', branchId }).expect(201)).body.id;

    await seedProductionCredential();
  }, 90000);

  afterAll(async () => {
    // المستنداتُ بترتيب مفاتيحها أولاً (البدلُ قبل مردودته)، ثم المنشأةُ كلُّها.
    await purgeInvoicesForTest(tenantPrisma, companyId, created);
    await tenantPrisma.runInTenantContext(companyId, (tx) => tx.zatcaCredential.deleteMany({ where: { companyId } }));
    await removeIsolatedCompany(app, company);
    await authority.close();
    await app.close();
  }, 60000);

  it('① البدلُ رقمٌ جديدٌ بلا لاحقة، بعدّادٍ وتجزئةٍ جديدَين ولا BillingReference — والمردودةُ كما هي بايتاً بايتاً', async () => {
    baseline = { q2: await declaration(REJECTED_QUARTER), qNow: await declaration(replacementQuarter), exposure: await exposureOf(standardCustomerId), layerQty: await layerQty(), ledger: await ledger() };
    expect(baseline.layerQty).toBe(10);

    rejectedStd = await makeRejected(standardCustomerId, { ...STOCKED, productId });
    afterRejected = { q2: await declaration(REJECTED_QUARTER), exposure: await exposureOf(standardCustomerId), ledger: await ledger() };
    const sealed = sealedView(rejectedStd);

    const now = new Date();
    const res = await replace(rejectedStd.id, { issuedAt: now.toISOString(), issuedOffsetMin: ISSUED_OFFSET_MIN });
    expect(res.status).toBe(201);
    replacementStd = (await getInvoice(res.body.id))!;

    // رقمٌ جديد من التسلسل نفسِه — لا لاحقة.
    expect(replacementStd.no).toMatch(/^INV-\d{4}-\d{4}$/);
    expect(replacementStd.no).not.toBe(rejectedStd.no);
    expect(replacementStd.docType).toBe('INVOICE');
    expect(replacementStd.replacesInvoice).toEqual({ id: rejectedStd.id, no: rejectedStd.no });
    expect(replacementStd.relatedInvoiceId).toBeNull();
    expect(replacementStd.total.toString()).toBe(rejectedStd.total.toString());
    expect(replacementStd.lines.map((l) => [l.productId, l.quantity.toString(), l.unitPrice.toString()])).toEqual(
      rejectedStd.lines.map((l) => [l.productId, l.quantity.toString(), l.unitPrice.toString()]),
    );
    expect(replacementStd.lines.map((l) => l.id)).not.toEqual(rejectedStd.lines.map((l) => l.id));
    // قياسيّ: التاريخُ يومُ الإصدار الجديد بساعة الجهاز (ق-١٨٥).
    expect(replacementStd.issueDate.toISOString().slice(0, 10)).toBe(localDateOf(now, 180));
    expect(replacementStd.issueDate.toISOString().slice(0, 10)).not.toBe('2026-06-01');
    expect(replacementStd.zatcaStatus).toBe('NOT_SUBMITTED');
    expect(replacementStd.zatcaIcv).toBeNull();

    // ثم يُرسَل كأيّ جديد: عدّادٌ وهويّةٌ وتجزئةٌ جديدة — وسلفُه بصمةُ الموقع السابق بعينه
    // (`ق-١١٩٨`/⑦): المردودةُ التي سبقته مباشرةً، لا «آخرُ مقبول» — فالسلسلةُ لا تتخطّى موقعاً.
    const sent = await submit(replacementStd.id).expect(201);
    replacementStd = (await getInvoice(replacementStd.id))!;
    expect(sent.body.zatcaStatus).toBe('REJECTED');
    expect(replacementStd.zatcaIcv).toBeGreaterThan(rejectedStd.zatcaIcv!);
    expect(replacementStd.zatcaUuid).not.toBe(rejectedStd.zatcaUuid);
    expect(replacementStd.zatcaHash).not.toBe(rejectedStd.zatcaHash);
    const predecessor = await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.invoice.findFirstOrThrow({ where: { egsUnitId: replacementStd.egsUnitId!, zatcaIcv: replacementStd.zatcaIcv! - 1 }, select: { zatcaHash: true } }),
    );
    expect(replacementStd.zatcaPreviousHash).toBe(predecessor.zatcaHash);
    // ولا إحالةَ أمام الهيئة — لا `BillingReference` ولا رقمُ المردودة في المستند.
    const xml = replacementStd.zatcaSignedXml!;
    expect(xml).not.toContain('BillingReference');
    expect(xml).not.toContain(rejectedStd.no);
    expect(xml).toContain(`<cbc:ID>${replacementStd.no}</cbc:ID>`);

    // والمردودةُ كما هي — بايتاً بايتاً فيما رأته الهيئة، و«مغلقة» مشتقّةٌ من بدلها.
    const after = (await getInvoice(rejectedStd.id))!;
    expect(sealedView(after)).toEqual(sealed);
    expect(after.replacedBy).toEqual({ id: replacementStd.id, no: replacementStd.no });
    expect(after.zatcaStatus).toBe('REJECTED');
  }, 120000);

  it('② القيد: قيدُ المردودة يبقى ويُعكَس بقيدٍ مربوطٍ بها — والدفترُ صافياً بيعٌ واحد', async () => {
    const closed = (await getInvoice(rejectedStd.id))!;
    expect(closed.journalEntryId).toBe(rejectedStd.journalEntryId);
    expect(closed.reversalJournalEntryId).toBeTruthy();

    const [original, reversal] = await tenantPrisma.runInTenantContext(companyId, (tx) =>
      Promise.all([
        tx.journalEntry.findUnique({ where: { id: closed.journalEntryId! }, include: { lines: { orderBy: { accountId: 'asc' } } } }),
        tx.journalEntry.findUnique({ where: { id: closed.reversalJournalEntryId! }, include: { lines: { orderBy: { accountId: 'asc' } } } }),
      ]),
    );
    // الأصلُ باقٍ لم يُحذف ولم يُمسّ.
    expect(original).not.toBeNull();
    expect(original!.lines.length).toBeGreaterThan(0);
    // والعكسُ مرآتُه سطراً سطراً، بتاريخ البدل، ومربوطٌ بالعميل نفسه.
    expect(reversal).not.toBeNull();
    expect(reversal!.memo).toContain(rejectedStd.no);
    expect(reversal!.date.toISOString().slice(0, 10)).toBe(replacementStd.issueDate.toISOString().slice(0, 10));
    expect(reversal!.lines.map((l) => [l.accountId, l.debit.toString(), l.credit.toString()])).toEqual(
      original!.lines.map((l) => [l.accountId, l.credit.toString(), l.debit.toString()]),
    );
    expect(reversal!.lines.every((l) => l.customerId === rejectedStd.customerId)).toBe(true);

    // الدفترُ بعد البدل = الدفترُ بعد المردودة وحدَها: أثرُ بيعٍ واحد (إيرادٌ وضريبةٌ وذمّةٌ وتكلفةٌ ومخزون).
    const afterReplacement = await ledger();
    expect([...diff(afterRejected.ledger, afterReplacement).entries()]).toEqual([]);
    // والمردودةُ وحدَها كانت قد حرّكت الدفتر فعلاً — فالمساواةُ أعلاه ليست فراغاً.
    expect(diff(baseline.ledger, afterRejected.ledger).size).toBeGreaterThan(0);
  }, 30000);

  it('③ المخزون: إعادةٌ إلى الرفّ ثم خصمٌ جديد — ولا توريثَ للحركات', async () => {
    const movesOf = (lineIds: string[]) =>
      tenantPrisma.runInTenantContext(companyId, (tx) =>
        tx.stockMovement.findMany({ where: { invoiceLineId: { in: lineIds } }, orderBy: { createdAt: 'asc' }, select: { id: true, type: true, origin: true, qty: true, invoiceLineId: true } }),
      );
    const rejectedMoves = await movesOf(rejectedStd.lines.map((l) => l.id));
    const replacementMoves = await movesOf(replacementStd.lines.map((l) => l.id));

    // المردودة: خرجت ٣ ثم عادت ٣ — على سطرها هي.
    expect(rejectedMoves.map((m) => [m.type, m.origin, Number(m.qty)])).toEqual([
      ['OUT', 'SALE', 3],
      ['IN', 'SALE', 3],
    ]);
    // البدل: خصمٌ جديدٌ على سطره هو — لا حركةَ مورَّثة.
    expect(replacementMoves.map((m) => [m.type, Number(m.qty)])).toEqual([['OUT', 3]]);
    expect(replacementMoves[0].invoiceLineId).toBe(replacementStd.lines[0].id);
    const consumptions = await tenantPrisma.runInTenantContext(companyId, (tx) => tx.inventoryConsumption.count({ where: { movementId: replacementMoves[0].id } }));
    expect(consumptions).toBeGreaterThan(0);

    // الطبقةُ صافياً خصمٌ واحد: ١٠ − ٣.
    expect(await layerQty()).toBe(7);
  }, 30000);

  it('④ التقاريرُ من مصدرٍ واحد: مردودةٌ بلا بدلٍ تُعدّ، وبعد البدل يُعدّ البدلُ وحدَه', async () => {
    // بلا بدل: المردودةُ دخلت إقرارَ ربعها (ق-٩٦٧/٢) وتعرّضَ عميلها.
    expect(afterRejected.q2 - baseline.q2).toBeCloseTo(300, 2);
    expect(afterRejected.exposure - baseline.exposure).toBeCloseTo(345, 2);

    // بعد البدل: خرجت من ربعها ودخل البدلُ ربعَه — ولا ازدواج.
    expect((await declaration(REJECTED_QUARTER)) - baseline.q2).toBeCloseTo(0, 2);
    expect((await declaration(replacementQuarter)) - baseline.qNow).toBeCloseTo(300, 2);
    expect((await exposureOf(standardCustomerId)) - baseline.exposure).toBeCloseTo(345, 2);

    // وقائمةُ الفواتير تقرأ المتبقّي من المصدر نفسه: المردودةُ المغلقة صفر، والبدلُ يحمل الذمّة.
    // ② `outstanding` نصٌّ بخانتين (`ق-١٢٣٥`) — يُقارَن حرفاً.
    const list = (await auth(request(server()).get('/invoices')).expect(200)).body as { id: string; outstanding: string; replacedBy: { no: string } | null }[];
    expect(list.find((i) => i.id === rejectedStd.id)!.outstanding).toBe('0.00');
    expect(list.find((i) => i.id === rejectedStd.id)!.replacedBy!.no).toBe(replacementStd.no);
    expect(list.find((i) => i.id === replacementStd.id)!.outstanding).toBe('345.00');
  }, 30000);

  let rejectedSimple: Row;
  let replacementSimple: Row;

  it('⑤ المقبوض: تخصيصُ المردودة يُنقل إلى البدل، والحالةُ تُشتقّ للاثنين، والنقلُ في السجلّ باسم فاعله', async () => {
    rejectedSimple = await makeRejected(simpleCustomerId, SERVICE, { issuedAt: '2026-06-01T10:00:00.000Z', issuedOffsetMin: ISSUED_OFFSET_MIN });
    const pay = await auth(request(server()).post('/payments'))
      .send({ customerId: simpleCustomerId, branchId, date: '2026-06-02', amount: 100, method: 'CASH', bankId: cashBoxId, allocations: [{ invoiceId: rejectedSimple.id, amount: 100 }] })
      .expect(201);
    expect((await getInvoice(rejectedSimple.id))!.status).toBe('PARTIAL');

    const res = await replace(rejectedSimple.id);
    expect(res.status).toBe(201);
    // ② المقبوضُ المنقول نصّاً بخانتين على الحدّ (`ق-١٢٣٥`) — والسجلُّ أدناه يحمل الرقم.
    expect(res.body.closure).toMatchObject({ allocationsMoved: 1, amountMoved: '100.00' });
    replacementSimple = (await getInvoice(res.body.id))!;

    const allocations = await tenantPrisma.runInTenantContext(companyId, (tx) => tx.paymentAllocation.findMany({ where: { paymentId: pay.body.id } }));
    expect(allocations.map((a) => [a.invoiceId, Number(a.amount)])).toEqual([[replacementSimple.id, 100]]);
    // الحالةُ مشتقّةٌ للاثنين: المردودةُ بلا تخصيص، والبدلُ مسدَّدٌ جزئياً.
    expect((await getInvoice(rejectedSimple.id))!.status).toBe('OVERDUE');
    expect(replacementSimple.status).toBe('PARTIAL');
    const list = (await auth(request(server()).get('/invoices')).expect(200)).body as { id: string; outstanding: string }[];
    expect(list.find((i) => i.id === rejectedSimple.id)!.outstanding).toBe('0.00');
    expect(list.find((i) => i.id === replacementSimple.id)!.outstanding).toBe('130.00');

    // والأثرُ في السجلّ: من نقل ومتى ومن أيّ مستندٍ إلى أيّ.
    const audit = await tenantPrisma.runInTenantContext(companyId, (tx) =>
      tx.auditLog.findFirst({ where: { action: 'replace', entityId: replacementSimple.id }, orderBy: { createdAt: 'desc' } }),
    );
    expect(audit).not.toBeNull();
    expect(audit!.actorName).toBe(company.username);
    expect(audit!.details).toMatchObject({ from: rejectedSimple.no, to: replacementSimple.no, allocationsMoved: 1, amountMoved: 100 });
  }, 120000);

  it('⑥ المبسَّطةُ تحتفظ بيوم المعاملة الأصليّ ولحظتها — وقيدُ العكس بتاريخها', async () => {
    expect(replacementSimple.issueDate.toISOString().slice(0, 10)).toBe('2026-06-01');
    expect(replacementSimple.issuedAt?.toISOString()).toBe('2026-06-01T10:00:00.000Z');
    expect(replacementSimple.issuedOffsetMin).toBe(ISSUED_OFFSET_MIN);
    const sent = await submit(replacementSimple.id).expect(201);
    expect(sent.body.zatcaStatus).toBe('REJECTED');
    const row = (await getInvoice(replacementSimple.id))!;
    expect(row.zatcaSignedXml).toContain('<cbc:IssueDate>2026-06-01</cbc:IssueDate>');
    expect(row.zatcaSignedXml).toContain('<cbc:IssueTime>13:00:00</cbc:IssueTime>');
    expect(row.zatcaSignedXml).not.toContain('BillingReference');

    const closed = (await getInvoice(rejectedSimple.id))!;
    const reversal = await tenantPrisma.runInTenantContext(companyId, (tx) => tx.journalEntry.findUniqueOrThrow({ where: { id: closed.reversalJournalEntryId! } }));
    expect(reversal.date.toISOString().slice(0, 10)).toBe('2026-06-01');
  }, 60000);

  it('⑦ المنعُ بالشكل: لا إعادةَ إرسال ولا إشعارَ ولا بدلَ ثانياً ولا بدلَ عن غير مردودة ولا تعديلَ ولا حذف', async () => {
    const resubmit = await submit(rejectedStd.id).expect(400);
    expect(resubmit.body.message).toContain('أصدِر بدلاً');

    const note = await auth(request(server()).post(`/invoices/${rejectedStd.id}/credit-note`)).send({ reason: 'إشعارٌ على مردودة' }).expect(400);
    expect(note.body.message).toContain('مردودة');
    const debit = await auth(request(server()).post(`/invoices/${rejectedStd.id}/debit-note`))
      .send({ reason: 'إشعارٌ على مردودة', lines: [SERVICE] })
      .expect(400);
    expect(debit.body.message).toContain('مردودة');

    const second = await replace(rejectedStd.id);
    expect(second.status).toBe(409);
    expect(second.body.message).toContain(replacementStd.no);

    // البدلُ نفسُه مردودٌ الآن (الخادمُ المحلّيّ يردّه) فبدلُه جائز — أمّا غيرُ المردود فلا.
    const fresh = await makeInvoice(simpleCustomerId, SERVICE);
    const notRejected = await replace(fresh);
    expect(notRejected.status).toBe(400);
    expect(notRejected.body.message).toContain('مردودة');

    const edit = await auth(request(server()).patch(`/invoices/${rejectedStd.id}`)).send({ lines: [SERVICE] }).expect(409);
    expect(edit.body.message).toContain('صدرت');
    const del = await auth(request(server()).delete(`/invoices/${rejectedStd.id}`)).expect(409);
    expect(del.body.message).toContain('صدرت');

    // والمردودةُ بعد كلِّ ذلك كما كانت.
    const after = (await getInvoice(rejectedStd.id))!;
    expect(after.zatcaStatus).toBe('REJECTED');
    expect(after.zatcaHash).toBe(rejectedStd.zatcaHash);
    expect(after.replacedBy!.id).toBe(replacementStd.id);
  }, 60000);
});
