import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { decryptField } from '../src/common/crypto/field-cipher.util';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { encryptPlaintextCustomerIds, plaintextOtherIdColumnExists } from '../src/customers/customer-id-backfill.util';
import { customerOtherIdAad, customerOtherIdIndex } from '../src/customers/customer-identity.util';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

// ⏱️ ميزانيةُ الحزمة (ق-١٢٨٥): بنمط هويّة الموظف (ثلاثةُ أضعاف المقيس هناك) — معلَنةٌ هنا لا مفترَضةٌ في خمس ثوانٍ.
jest.setTimeout(316000);

/**
 * ⚖️ **توجيه ٢٨٦ (البندان ٨ و٤) — معرّفُ المشتري البديل ورقمُ هويّة المستأجر مشفَّران في التطبيق** (بنمط `ق-١٣٤٥`).
 *
 * **يُقرأ الصفُّ من القاعدة نفسِها** (لا من ردّ الخادم) فيُثبَت أن الرقمَ الصريح لم يُكتب — ويُقرأ سجلُّ التدقيق كذلك. وكلُّ
 * مسبارِ غيابٍ يُصادَق أوّلاً بحالةٍ يجب أن يجدها (الاسمُ في الصفّ · اسمُ الحقل في السجلّ).
 */
describe('⚖️ معرّفُ العميل البديل وهويّةُ المستأجر مشفَّران في التطبيق (e2e · توجيه ٢٨٦)', () => {
  let app: INestApplication;
  let tenantPrisma: TenantPrismaService;
  let a: IsolatedCompany;
  let b: IsolatedCompany;
  const http = () => request(app.getHttpServer());
  const as = (c: IsolatedCompany) => (r: request.Test) => r.set('Authorization', `Bearer ${c.token}`);

  const NATIONAL_ID = '1234567890';
  const TENANT_ID = '2233445566';
  const LEGACY_ID = '9988776655';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    tenantPrisma = app.get(TenantPrismaService);
    a = await registerIsolatedCompany(app, 'custid-a');
    b = await registerIsolatedCompany(app, 'custid-b');
  });

  afterAll(async () => {
    await removeIsolatedCompany(app, a);
    await removeIsolatedCompany(app, b);
    await app.close();
  });

  const rawRow = (c: IsolatedCompany, table: 'customers' | 'contracts', id: string) =>
    tenantPrisma.runInTenantContext(c.companyId, (tx) =>
      (table === 'customers'
        ? tx.$queryRaw<Record<string, string | null>[]>`SELECT * FROM customers WHERE id = ${id}`
        : tx.$queryRaw<Record<string, string | null>[]>`SELECT * FROM contracts WHERE id = ${id}`
      ).then((r) => r[0]),
    );

  const items = (body: unknown) => (Array.isArray(body) ? body : (body as { items: unknown[] }).items) as Record<string, unknown>[];

  let customerId = '';

  it('① يُكتب مشفَّراً: لا رقمَ صريحاً في الصفّ، والصيغةُ تحمل معرّفَ المفتاح — ولا عمودَ صريحاً بعد الهجرة', async () => {
    const res = await as(a)(http().post('/customers')).send({ kind: 'NATURAL', name: 'عميلُ الهويّة', otherIdScheme: 'NAT', otherId: NATIONAL_ID }).expect(201);
    customerId = res.body.id;
    // الردُّ لا يحمل الرقمَ ولا نصَّه المشفَّر ولا بصمته — وعلامةُ الوجود وحدَها.
    expect(JSON.stringify(res.body)).not.toContain(NATIONAL_ID);
    expect(res.body).not.toHaveProperty('otherIdCipher');
    expect(res.body).not.toHaveProperty('otherIdIndex');
    expect(res.body).toMatchObject({ otherIdScheme: 'NAT', otherIdOnFile: true });

    const row = await rawRow(a, 'customers', customerId);
    const whole = JSON.stringify(row);
    // مصادقةُ المسبار: الصفُّ قُرئ فعلاً (الاسمُ فيه) — ثم لا رقمَ صريحاً.
    expect(whole).toContain('عميلُ الهويّة');
    expect(whole).not.toContain(NATIONAL_ID);
    expect(row).not.toHaveProperty('otherId');
    expect(row.otherIdCipher).toMatch(/^f1:test1:/);
    expect(row.otherIdIndex).toMatch(/^b1:tb1:/);
    expect(row.otherIdScheme).toBe('NAT');
  });

  it('② التفصيلُ يفكّ، والقائمةُ والفاتورةُ لا تحملان الرقمَ ولا نصَّه المشفَّر', async () => {
    const detail = await as(a)(http().get(`/customers/${customerId}`)).expect(200);
    expect(detail.body).toMatchObject({ id: customerId, otherIdScheme: 'NAT', otherId: NATIONAL_ID, otherIdOnFile: true });
    expect(detail.body).not.toHaveProperty('otherIdCipher');

    const listed = items((await as(a)(http().get('/customers')).expect(200)).body).find((c) => c.id === customerId)!;
    expect(listed).toBeDefined();
    expect(listed.otherIdOnFile).toBe(true);
    expect(JSON.stringify(listed)).not.toContain(NATIONAL_ID);
    expect(listed).not.toHaveProperty('otherIdCipher');
    expect(listed).not.toHaveProperty('otherIdIndex');

    const today = new Date().toISOString().slice(0, 10);
    const invoice = await as(a)(http().post('/invoices'))
      .send({ customerId, issueDate: today, dueDate: today, lines: [{ description: 'بندُ الهويّة', quantity: 1, unitPrice: 100, taxRate: 15 }] })
      .expect(201);
    // مصادقةُ المسبار: العميلُ في ردّ الفاتورة فعلاً — ثم بلا نصٍّ مشفَّرٍ ولا بصمة.
    expect(invoice.body.customer).toMatchObject({ id: customerId, name: 'عميلُ الهويّة', otherIdScheme: 'NAT' });
    expect(invoice.body.customer).not.toHaveProperty('otherIdCipher');
    expect(invoice.body.customer).not.toHaveProperty('otherIdIndex');
    const invoices = items((await as(a)(http().get('/invoices')).expect(200)).body);
    const inList = invoices.find((i) => i.id === invoice.body.id)!;
    expect(inList).toBeDefined();
    expect(JSON.stringify(inList)).not.toContain('f1:test1:');
    expect(JSON.stringify(inList)).not.toContain('b1:tb1:');
  });

  it('③ البصمةُ لا تتطابق عبر المنشآت للرقم نفسِه — وتتطابق داخل المنشأة بلا فرقٍ بين حالتَي الحرف', async () => {
    const other = await as(b)(http().post('/customers')).send({ kind: 'NATURAL', name: 'عميلٌ في منشأةٍ أخرى', otherIdScheme: 'NAT', otherId: NATIONAL_ID }).expect(201);
    const [ra, rb] = [await rawRow(a, 'customers', customerId), await rawRow(b, 'customers', other.body.id)];
    expect(ra.otherIdIndex).toMatch(/^b1:/);
    expect(ra.otherIdIndex).not.toEqual(rb.otherIdIndex);
    expect(ra.otherIdIndex).toBe(customerOtherIdIndex(NATIONAL_ID, a.companyId));
  });

  it('④ النصُّ المشفَّر مربوطٌ بصفّه: نسخُه إلى عميلٍ آخر يفشل فكُّه لا يُقرأ رقماً لغيره', async () => {
    const second = await as(a)(http().post('/customers')).send({ kind: 'NATURAL', name: 'عميلٌ ثانٍ', allowSameName: true }).expect(201);
    const row = await rawRow(a, 'customers', customerId);
    await tenantPrisma.runInTenantContext(a.companyId, (tx) =>
      tx.customer.update({ where: { id: second.body.id }, data: { otherIdScheme: 'NAT', otherIdCipher: row.otherIdCipher, otherIdIndex: row.otherIdIndex } }),
    );
    await as(a)(http().get(`/customers/${second.body.id}`)).expect(500);
    // والأصلُ يُفكّ بموضعه.
    expect(decryptField(row.otherIdCipher!, customerOtherIdAad(a.companyId, customerId))).toBe(NATIONAL_ID);
  });

  it('⑤ سجلُّ التدقيق يكتب أن الحقلَ تغيّر ولا يكتب قيمتَه — والمخطّطُ وحدَه يتغيّر بلا مسّ الرقم', async () => {
    await as(a)(http().patch(`/customers/${customerId}`)).send({ otherIdScheme: 'IQA', otherId: '2109876543' }).expect(200);
    let logs: { action: string; details: unknown }[] = [];
    for (let i = 0; i < 50; i++) {
      logs = await tenantPrisma.runInTenantContext(a.companyId, (tx) => tx.auditLog.findMany({ where: { entityId: customerId }, select: { action: true, details: true } }));
      if (JSON.stringify(logs).includes('otherId')) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const text = JSON.stringify(logs);
    // مصادقةُ المسبار: السجلُّ قُرئ وفيه اسمُ الحقل (الإنشاءُ والتعديل) — ثم لا قيمة.
    expect(text).toContain('otherId');
    for (const plain of [NATIONAL_ID, '2109876543']) expect(text).not.toContain(plain);

    // المخطّطُ وحدَه: النصُّ المشفَّر باقٍ كما هو، والتفصيلُ يفكّه.
    const before = await rawRow(a, 'customers', customerId);
    await as(a)(http().patch(`/customers/${customerId}`)).send({ otherIdScheme: 'NAT' }).expect(200);
    const after = await rawRow(a, 'customers', customerId);
    expect(after.otherIdCipher).toBe(before.otherIdCipher);
    expect((await as(a)(http().get(`/customers/${customerId}`)).expect(200)).body).toMatchObject({ otherIdScheme: 'NAT', otherId: '2109876543' });
  });

  it('⑥ هويّةُ المستأجر على العقد: لا صريحَ في الصفّ، والتفصيلُ يفكّ، والقائمةُ لا تحملها', async () => {
    const property = await as(a)(http().post('/properties')).send({ name: 'عقارُ الهويّة', ownership: 'owned' }).expect(201);
    const unit = await as(a)(http().post('/units')).send({ propertyId: property.body.id, unitNo: 'ID-1', type: 'apartment', rentMonthly: 1000 }).expect(201);
    const created = await as(a)(http().post('/contracts'))
      .send({ unitId: unit.body.id, customerId, value: 12000, cycle: 'monthly', start: '2026-01-01', end: '2026-12-31', classification: 'RESIDENTIAL', vatInclusion: 'EXCLUSIVE', tenantIdNumber: TENANT_ID })
      .expect(201);
    const contractId = created.body.id as string;
    expect(JSON.stringify(created.body)).not.toContain(TENANT_ID);
    expect(created.body).toMatchObject({ tenantIdOnFile: true });
    expect(created.body).not.toHaveProperty('tenantIdCipher');

    const row = await rawRow(a, 'contracts', contractId);
    const whole = JSON.stringify(row);
    expect(whole).toContain(contractId);
    expect(whole).not.toContain(TENANT_ID);
    expect(row.tenantIdCipher).toMatch(/^f1:test1:/);
    expect(row.tenantIdIndex).toMatch(/^b1:tb1:/);

    expect((await as(a)(http().get(`/contracts/${contractId}`)).expect(200)).body.tenantIdNumber).toBe(TENANT_ID);
    const listed = items((await as(a)(http().get('/contracts')).expect(200)).body).find((c) => c.id === contractId)!;
    expect(listed).toBeDefined();
    expect(listed.tenantIdOnFile).toBe(true);
    expect(JSON.stringify(listed)).not.toContain(TENANT_ID);
    expect(listed).not.toHaveProperty('tenantIdCipher');
    expect(listed).not.toHaveProperty('tenantIdIndex');

    // والمحوُ بالفراغ يمحو النصَّ وبصمتَه معاً.
    const cleared = await as(a)(http().patch(`/contracts/${contractId}`)).send({ tenantIdNumber: '' }).expect(200);
    expect(cleared.body.tenantIdOnFile).toBe(false);
    const after = await rawRow(a, 'contracts', contractId);
    expect([after.tenantIdCipher, after.tenantIdIndex]).toEqual([null, null]);
  });

  /**
   * ⑦ **الصريحُ القائم — السكربتُ يشفّره، والهجرةُ الثانية ترفض قبله** (في معاملةٍ تُرجَع).
   *
   * لماذا هنا لا على قاعدةٍ ثانية: الهجرةُ الثانية أسقطت العمودَ على قاعدة الاختبار، فيُعاد بناءُ حال ما بين الهجرتين **داخل
   * معاملةٍ تُرجَع** (العمودُ الصريح وقيدُ الزوج الانتقاليّ كما في الهجرة الأولى، نصّاً)، ويُكتب فيه رقمٌ صريح، ثم: كتلةُ الحارس
   * من ملفّ الهجرة الثانية **نفسِه** ترفض · السكربتُ يشفّر ويمحو · إعادتُه لا تجد شيئاً · والحارسُ يمرّ — ثم يُرجَع كلُّ شيء.
   */
  it('⑦ صريحٌ قائم: حارسُ الهجرة الثانية يرفضه، والسكربتُ يشفّره ويمحوه، وإعادتُه لا تجد شيئاً، ثم يمرّ الحارس', async () => {
    const fresh = await as(a)(http().post('/customers')).send({ kind: 'NATURAL', name: 'عميلٌ سبق التشفير', allowSameName: true }).expect(201);
    const migrations = join(__dirname, '..', 'prisma', 'migrations');
    const guard = readFileSync(join(migrations, '20261008120000_customer_id_plaintext_dropped', 'migration.sql'), 'utf8').match(/DO \$\$[\s\S]*?END \$\$/)?.[0];
    const transition = readFileSync(join(migrations, '20261008110000_customer_id_encrypted', 'migration.sql'), 'utf8').match(
      /ALTER TABLE "customers" ADD CONSTRAINT "customers_other_id_pair_transition"[\s\S]*?\);/,
    )?.[0];
    // مصادقةُ المسبار: الكتلتان قُرئتا من الملفّين فعلاً.
    expect(guard).toContain('RAISE EXCEPTION');
    expect(transition).toContain('COALESCE');

    const ROLLBACK = new Error('rollback-by-design');
    const seen: Record<string, unknown> = {};
    await expect(
      tenantPrisma.runInTenantContext(
        a.companyId,
        async (tx) => {
          expect(await plaintextOtherIdColumnExists(tx)).toBe(false);
          await tx.$executeRawUnsafe('ALTER TABLE "customers" ADD COLUMN "otherId" TEXT');
          await tx.$executeRawUnsafe('ALTER TABLE "customers" DROP CONSTRAINT "customers_other_id_pair"');
          await tx.$executeRawUnsafe(transition!.replace(/;$/, ''));
          expect(await plaintextOtherIdColumnExists(tx)).toBe(true);
          await tx.$executeRaw`UPDATE "customers" SET "otherIdScheme" = 'NAT', "otherId" = ${LEGACY_ID} WHERE "id" = ${fresh.body.id}`;

          // الحارسُ يرفض والصريحُ قائم — والخطأُ خطؤه بعينه.
          await tx.$executeRawUnsafe('SAVEPOINT guard_refuses');
          seen.refused = await tx.$executeRawUnsafe(guard!).then(
            () => 'passed',
            (e: Error) => String(e.message),
          );
          await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT guard_refuses');

          seen.first = await encryptPlaintextCustomerIds(tx, a.companyId);
          seen.second = await encryptPlaintextCustomerIds(tx, a.companyId);
          seen.row = (await tx.$queryRaw<Record<string, string | null>[]>`SELECT "otherId", "otherIdCipher", "otherIdIndex", "otherIdScheme" FROM "customers" WHERE "id" = ${fresh.body.id}`)[0];
          seen.passed = await tx.$executeRawUnsafe(guard!).then(
            () => 'passed',
            (e: Error) => String(e.message),
          );
          throw ROLLBACK;
        },
        { timeout: 60000 },
      ),
    ).rejects.toBe(ROLLBACK);

    expect(String(seen.refused)).toContain('توجيه ٢٨٦');
    expect(seen.first).toEqual({ found: 1, encrypted: 1 });
    expect(seen.second).toEqual({ found: 0, encrypted: 0 });
    const row = seen.row as Record<string, string | null>;
    expect(row.otherId).toBeNull();
    expect(row.otherIdScheme).toBe('NAT');
    expect(row.otherIdCipher).toMatch(/^f1:test1:/);
    expect(decryptField(row.otherIdCipher!, customerOtherIdAad(a.companyId, fresh.body.id))).toBe(LEGACY_ID);
    expect(row.otherIdIndex).toBe(customerOtherIdIndex(LEGACY_ID, a.companyId));
    expect(seen.passed).toBe('passed');

    // وما رُجع رُجع: لا عمودَ صريحاً، والعميلُ بلا معرّف.
    expect(await plaintextOtherIdColumnExists(app.get(PrismaService))).toBe(false);
    expect((await rawRow(a, 'customers', fresh.body.id)).otherIdCipher).toBeNull();
  });
});
