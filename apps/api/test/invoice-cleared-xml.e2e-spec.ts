import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { DEFAULT_LANGUAGE, formatMessage, MSG, resolveMessage } from '../src/common/i18n/messages';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';
import { purgeInvoicesForTest } from './purge-invoices';
import { seedProductionCredential } from './zatca-credential';
import { startAuthorityStub, STUB_CLEARED_MARKER, type AuthorityStub } from './zatca-authority-stub';

// ⏱️ ميزانيةُ الحزمة: منشأتان معزولتان وأربعُ فواتير تُختم وتُرسَل إلى خادمٍ محلّيّ — لم تُقَس بعد (البحثُ جارٍ فلا محطّةَ
// محلّية، `ق-١٤٩٤`)؛ سقفٌ معلَن يُضبط إلى ثلاثة أضعاف المقيس بعد أوّل تشغيلٍ في السير.
jest.setTimeout(300000);

/**
 * ⚖️ `ق-١٥٠٦`/١ و٤ — **الفاتورةُ القياسية تُسلَّم بنسختها المجازة من الهيئة، ملفَّ XML باسمه النظاميّ، بعد الإجازة لا قبلها.**
 *
 * **العطلُ المقيس** (R24 من المراجعة الخارجية): جوابُ الإجازة يحمل `clearedInvoice` — المستندَ وقد ختمته الهيئة، وهو وحده
 * الصحيح للمشتري (الدليلُ الفنيّ التفصيليّ، الإصدار 2، ص50–51) — **وكان يُهدَر**: `recordResult` يكتب الحالةَ وحدَها.
 *
 * **وما يُثبَت هنا** (الخادمُ المحلّيّ يمثّل الهيئة ويختم نسختَه بتعليقٍ مميَّز — `STUB_CLEARED_MARKER`):
 *   ① قبل الإجازة `409` مسمّى — وبعدها النسخةُ المجازة **لا نسختُنا**، باسم الملف النظاميّ (معيارُ XML ١.٢، القسم 14)،
 *      والقائمةُ تقول «متاحة» ولا تحمل المستند.
 *   ② قبولٌ بلا نسخة ⟵ الحالةُ `CLEARED` والتنزيلُ `409` مسمّى — **ولا تُسلَّم نسختُنا مكانها**.
 *   ③ المبسّطة خارج البند ⟵ `409` مسمّى، والإبلاغُ لا يترك نسخة.
 *   ④ منشأةٌ أخرى لا ترى الملف ⟵ `404`.
 */
describe('⚖️ الفاتورةُ القياسية تُسلَّم بنسختها المجازة ملفَّ XML — بعد الإجازة لا قبلها (ق-١٥٠٦) (e2e)', () => {
  let app: INestApplication;
  let authority: AuthorityStub;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;
  let other: IsolatedCompany;
  let businessBuyerId: string;
  let personBuyerId: string;
  const created: string[] = [];
  const VAT = '300000000000003';
  const ISSUE_DATE = '2026-06-01';

  const http = () => request(app.getHttpServer());
  const as = (co: IsolatedCompany) => (r: request.Test) => r.set('Authorization', `Bearer ${co.token}`);
  const ar = (raw: string) => resolveMessage(raw, DEFAULT_LANGUAGE);
  /** ردُّ الرفض `JSON` يُقرأ كما هو (`body.message`). */
  const clearedXml = (co: IsolatedCompany, id: string) => as(co)(http().get(`/invoices/${id}/cleared-xml`));
  /** وردُّ النجاح نصُّ `application/xml` — لا يحوّله supertest نصّاً وحدَه، فيُجمَع من البايتات كما وصلت. */
  const downloadXml = (co: IsolatedCompany, id: string) =>
    clearedXml(co, id)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
        res.on('end', () => done(null, Buffer.concat(chunks).toString('utf8')));
      });

  async function makeInvoice(customerId: string, description: string): Promise<{ id: string; no: string }> {
    const res = await as(company)(http().post('/invoices'))
      .send({ customerId, issueDate: ISSUE_DATE, dueDate: '2026-06-30', lines: [{ description, quantity: 1, unitPrice: 100, taxRate: 15 }] })
      .expect(201);
    created.push(res.body.id);
    return { id: res.body.id as string, no: res.body.no as string };
  }

  async function submit(id: string) {
    const res = await as(company)(http().post(`/zatca/invoices/${id}/submit`));
    if (res.status !== 201) throw new Error(`submit ${id}: expected 201, got ${res.status} — ${JSON.stringify(res.body).slice(0, 600)}`);
    return res.body as { zatcaStatus: string };
  }

  const stored = (id: string) =>
    tenantPrisma.runInTenantContext(company.companyId, (tx) =>
      tx.invoice.findUniqueOrThrow({ where: { id }, select: { zatcaStatus: true, zatcaSignedXml: true, zatcaClearedXml: true } }),
    );

  async function listRow(id: string) {
    const list = (await as(company)(http().get('/invoices')).expect(200)).body as Record<string, unknown>[];
    // مجسٌّ للمجسّ: القائمةُ مصفوفةٌ فيها الفاتورة — وإلا فالتوكيدُ على غيابٍ لا يرى شيئاً.
    expect(Array.isArray(list)).toBe(true);
    const row = list.find((r) => r.id === id);
    expect(row).toBeDefined();
    return row!;
  }

  beforeAll(async () => {
    process.env.SECRETS_ENCRYPTION_KEY ??= 'test-secrets-key-at-least-32-characters-long';
    authority = await startAuthorityStub('clear');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);

    company = await registerIsolatedCompany(app, 'cleared-xml');
    other = await registerIsolatedCompany(app, 'cleared-xml-other');
    await as(company)(http().patch('/company-profile')).send({ legalName: 'شركة التسليم التجارية', vatNumber: VAT }).expect(200);
    // مؤسّسةٌ بسجلٍّ تجاريّ ⟵ قياسية (`invoiceTypeFor`)؛ وشخصٌ طبيعيّ بلا رقمٍ ضريبيّ ⟵ مبسّطة.
    businessBuyerId = (
      await as(company)(http().post('/customers')).send({ kind: 'ESTABLISHMENT', name: `مؤسسة التسليم ${Date.now()}`, otherIdScheme: 'CRN', otherId: '1010101010' }).expect(201)
    ).body.id;
    personBuyerId = (await as(company)(http().post('/customers')).send({ kind: 'NATURAL', name: `عميل التسليم ${Date.now()}` }).expect(201)).body.id;
    await seedProductionCredential(tenantPrisma, company.companyId);
  }, 120000);

  afterAll(async () => {
    await purgeInvoicesForTest(tenantPrisma, company.companyId, created);
    await tenantPrisma.runInTenantContext(company.companyId, (tx) => tx.zatcaCredential.deleteMany({ where: { companyId: company.companyId } }));
    await authority.close();
    await removeIsolatedCompany(app, other);
    await removeIsolatedCompany(app, company);
    await app.close();
  }, 120000);

  it('① قبل الإجازة 409 مسمّى — وبعدها النسخةُ المجازة لا نسختُنا، باسم الملف النظاميّ، والقائمةُ تقول «متاحة» ولا تحمله', async () => {
    const invoice = await makeInvoice(businessBuyerId, 'توريد قياسيّ');

    const early = await clearedXml(company, invoice.id).expect(409);
    expect(early.body.message).toBe(ar(formatMessage(MSG.invoice_xml_not_cleared, { no: invoice.no })));

    authority.set('clear');
    expect((await submit(invoice.id)).zatcaStatus).toBe('CLEARED');
    // الإرسالُ وقع فعلاً على نقطة الإجازة — لا الإبلاغ.
    expect(authority.requests.some((q) => q.path.includes('/invoices/clearance/single'))).toBe(true);

    const row = await stored(invoice.id);
    expect(row.zatcaStatus).toBe('CLEARED');
    expect(row.zatcaClearedXml).toContain(STUB_CLEARED_MARKER);
    expect(row.zatcaSignedXml).not.toContain(STUB_CLEARED_MARKER);

    const res = await downloadXml(company, invoice.id).expect(200);
    expect(res.headers['content-type']).toMatch(/^application\/xml/);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.body as string;
    expect(typeof body).toBe('string');
    expect(body).toBe(row.zatcaClearedXml);
    expect(body).not.toBe(row.zatcaSignedXml);

    // الاسمُ: رقمُ المورّد _ التاريخُ بلا شَرطات T الوقتُ بلا نقطتين _ رقمُ الفاتورة وكلُّ ما ليس حرفاً أو رقماً شَرطة.
    //    والوقتُ يُقرأ هنا من المستند بنمطٍ نصّيّ (أوّلُ `IssueTime` هو وقتُ الفاتورة) — لا بدالّة الخادم التي تُختبر.
    const time = /<cbc:IssueTime>([^<]+)<\/cbc:IssueTime>/.exec(body)?.[1];
    expect(time).toBeDefined();
    const expectedName = `${VAT}_${ISSUE_DATE.replace(/-/g, '')}T${time!.replace(/:/g, '')}_${invoice.no.replace(/[^A-Za-z0-9]/g, '-')}.xml`;
    expect(res.headers['content-disposition']).toBe(`attachment; filename="${expectedName}"`);

    const listed = await listRow(invoice.id);
    expect(listed.zatcaClearedXmlAvailable).toBe(true);
    expect('zatcaClearedXml' in listed).toBe(false);
  });

  it('② قبولٌ بلا نسخةٍ من الهيئة ⟵ CLEARED والتنزيلُ 409 مسمّى — ولا تُسلَّم نسختُنا مكانها', async () => {
    const invoice = await makeInvoice(businessBuyerId, 'توريد قياسيّ بلا نسخة');
    authority.set('clear-no-copy');
    try {
      expect((await submit(invoice.id)).zatcaStatus).toBe('CLEARED');
    } finally {
      authority.set('clear');
    }
    const row = await stored(invoice.id);
    expect(row.zatcaClearedXml).toBeNull();
    expect(row.zatcaSignedXml).toBeTruthy();

    const missing = await clearedXml(company, invoice.id).expect(409);
    expect(missing.body.message).toBe(ar(formatMessage(MSG.invoice_xml_cleared_copy_missing, { no: invoice.no })));
    expect((await listRow(invoice.id)).zatcaClearedXmlAvailable).toBe(false);
  });

  it('③ المبسّطة خارج البند ⟵ 409 مسمّى، والإبلاغُ لا يترك نسخة', async () => {
    const invoice = await makeInvoice(personBuyerId, 'بيعٌ مبسّط');
    authority.set('clear');
    expect((await submit(invoice.id)).zatcaStatus).toBe('CLEARED');
    expect(authority.requests.some((q) => q.path.includes('/invoices/reporting/single'))).toBe(true);
    expect((await stored(invoice.id)).zatcaClearedXml).toBeNull();

    const simplified = await clearedXml(company, invoice.id).expect(409);
    expect(simplified.body.message).toBe(ar(MSG.invoice_xml_simplified_out_of_scope));
  });

  it('④ منشأةٌ أخرى لا ترى ملفَّ فاتورةٍ ليست لها ⟵ 404', async () => {
    const invoice = await makeInvoice(businessBuyerId, 'توريد قياسيّ للعزل');
    expect((await submit(invoice.id)).zatcaStatus).toBe('CLEARED');
    // الضابط: صاحبتُها تنزّله.
    await downloadXml(company, invoice.id).expect(200);
    const foreign = await clearedXml(other, invoice.id).expect(404);
    expect(foreign.body.message).toBe(ar(MSG.invoice_not_found));
  });
});
