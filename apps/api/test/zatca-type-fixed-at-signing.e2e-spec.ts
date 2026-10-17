import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { DEFAULT_LANGUAGE, MSG, resolveMessage } from '../src/common/i18n/messages';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { STORED_TYPE_UNKNOWN } from '../src/zatca/zatca.service';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';
import { purgeInvoicesForTest } from './purge-invoices';
import { writePastDbGuard } from './write-past-db-guard';
import { seedProductionCredential } from './zatca-credential';
import { startAuthorityStub, type AuthorityStub } from './zatca-authority-stub';

// Suite budget: one isolated company, a handful of documents signed and sent to a local server; three times the
// measured run, declared here rather than assumed at five seconds.
jest.setTimeout(300000);

const CLEARANCE = '/invoices/clearance/single';
const REPORTING = '/invoices/reporting/single';

/**
 * A signed document keeps the ZATCA type it was signed with. The buyer's card can change after signing (a VAT
 * number added, a kind changed), but the send, every retry, the list, the cleared copy and a credit note on it
 * all follow the type the signed document carries, never the buyer's current data.
 *
 * Each document is signed first while the local authority is down (the attempt fails, the document stays
 * STAMPED), then the buyer changes, then the send is retried.
 */
describe('ZATCA invoice type is fixed at signing (e2e)', () => {
  let app: INestApplication;
  let authority: AuthorityStub;
  let tenantPrisma: TenantPrismaService;
  let company: IsolatedCompany;
  const created: string[] = [];
  /** Signed documents from the cases below, reused by the backfill case at the end. */
  const signed: { simplified?: string; standard?: string; note?: string } = {};
  const FULL_ADDRESS = { street: 'King Fahd Road', buildingNumber: '7001', district: 'Olaya', city: 'Riyadh', postalCode: '12211' };

  const http = () => request(app.getHttpServer());
  const as = (r: request.Test) => r.set('Authorization', `Bearer ${company.token}`);
  const ar = (raw: string) => resolveMessage(raw, DEFAULT_LANGUAGE);
  let vatSeq = 0;
  /** A well formed VAT number unique inside the isolated company. */
  const freshVat = () => `3${String(Date.now() + vatSeq++).slice(-13).padStart(13, '0')}3`;

  async function makeCustomer(body: Record<string, unknown>): Promise<string> {
    return (await as(http().post('/customers')).send(body).expect(201)).body.id as string;
  }

  async function makeInvoice(customerId: string, description: string): Promise<{ id: string; no: string }> {
    const res = await as(http().post('/invoices'))
      .send({ customerId, issueDate: '2026-06-01', dueDate: '2026-06-30', lines: [{ description, quantity: 1, unitPrice: 100, taxRate: 15 }] })
      .expect(201);
    created.push(res.body.id);
    return { id: res.body.id as string, no: res.body.no as string };
  }

  const submit = (id: string) => as(http().post(`/zatca/invoices/${id}/submit`));

  const row = (id: string) =>
    tenantPrisma.runInTenantContext(company.companyId, (tx) =>
      tx.invoice.findUniqueOrThrow({ where: { id }, select: { zatcaStatus: true, zatcaUuid: true, zatcaSignedXml: true } }),
    );

  /** The type and transaction code stored on a document, read as text. */
  async function storedType(id: string): Promise<{ type: string | null; code: string | null }> {
    const rows = await tenantPrisma.runInTenantContext(company.companyId, (tx) =>
      tx.$queryRaw<{ type: string | null; code: string | null }[]>`SELECT "zatcaInvoiceType"::text AS "type", "zatcaTransactionCode" AS "code" FROM "invoices" WHERE "id" = ${id}`,
    );
    expect(rows).toHaveLength(1);
    return rows[0];
  }

  /**
   * The distinct paths the local authority received for one document, matched by the UUID it was sent with. Distinct,
   * because the outbox job may also try the document once in between.
   */
  async function pathsFor(id: string): Promise<string[]> {
    const { zatcaUuid } = await row(id);
    expect(zatcaUuid).toBeTruthy();
    const paths = authority.requests.filter((q) => q.body.uuid === zatcaUuid).map((q) => (q.path.includes(CLEARANCE) ? CLEARANCE : q.path.includes(REPORTING) ? REPORTING : q.path));
    expect(paths.length).toBeGreaterThan(0);
    return [...new Set(paths)];
  }

  /** Signs the document while the authority is down, so it is stamped and not yet sent. */
  async function signWithoutSending(id: string): Promise<void> {
    authority.set('outage');
    await submit(id).expect(503);
    expect((await row(id)).zatcaStatus).toBe('STAMPED');
  }

  async function listRow(id: string) {
    const list = (await as(http().get('/invoices')).expect(200)).body as Record<string, unknown>[];
    expect(Array.isArray(list)).toBe(true);
    const found = list.find((r) => r.id === id);
    expect(found).toBeDefined();
    return found!;
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

    company = await registerIsolatedCompany(app, 'zatca-type-fixed');
    await as(http().patch('/company-profile')).send({ legalName: 'Fixed Type Trading', vatNumber: '300000000000003' }).expect(200);
    await seedProductionCredential(tenantPrisma, company.companyId);
  });

  afterAll(async () => {
    await purgeInvoicesForTest(tenantPrisma, company.companyId, created);
    await tenantPrisma.runInTenantContext(company.companyId, (tx) => tx.zatcaCredential.deleteMany({ where: { companyId: company.companyId } }));
    await authority.close();
    await removeIsolatedCompany(app, company);
    await app.close();
  });

  it('control: a simplified invoice whose buyer did not change is reported', async () => {
    const buyer = await makeCustomer({ kind: 'NATURAL', name: `Unchanged buyer ${Date.now()}` });
    const invoice = await makeInvoice(buyer, 'Unchanged sale');
    await signWithoutSending(invoice.id);
    authority.set('clear');
    await submit(invoice.id).expect(201);
    expect(await pathsFor(invoice.id)).toEqual([REPORTING]);
    signed.simplified = invoice.id;
  });

  describe('a signed simplified invoice whose buyer gets a VAT number afterwards', () => {
    let invoice: { id: string; no: string };

    it('is still sent on the reporting path', async () => {
      const buyer = await makeCustomer({ kind: 'NATURAL', name: `Late VAT buyer ${Date.now()}` });
      invoice = await makeInvoice(buyer, 'Simplified sale');
      await signWithoutSending(invoice.id);
      expect((await row(invoice.id)).zatcaSignedXml).toContain('<cbc:InvoiceTypeCode name="0200000">388</cbc:InvoiceTypeCode>');

      await as(http().patch(`/customers/${buyer}`)).send({ vatNumber: freshVat() }).expect(200);

      authority.set('clear');
      await submit(invoice.id).expect(201);
      expect(await pathsFor(invoice.id)).toEqual([REPORTING]);
      expect((await row(invoice.id)).zatcaStatus).toBe('CLEARED');
    });

    it('is still listed as simplified, with no cleared copy to wait for', async () => {
      const listed = await listRow(invoice.id);
      expect(listed.invoiceType).toBe('simplified');
      expect(listed.clearedCopy).toBeNull();
      const copy = await as(http().get(`/invoices/${invoice.id}/cleared-xml`)).expect(409);
      expect(copy.body.message).toBe(ar(MSG.invoice_xml_simplified_out_of_scope));
    });

    it('takes a credit note signed as simplified and reported like the invoice it corrects', async () => {
      const note = await as(http().post(`/invoices/${invoice.id}/credit-note`)).send({ reason: 'Returned goods' }).expect(201);
      created.push(note.body.id);
      const sent = await submit(note.body.id);
      expect(sent.status).toBe(201);
      expect((await row(note.body.id)).zatcaSignedXml).toContain('<cbc:InvoiceTypeCode name="0200000">381</cbc:InvoiceTypeCode>');
      expect(await pathsFor(note.body.id)).toEqual([REPORTING]);
      signed.note = note.body.id;
    });
  });

  it('a signed standard invoice stays on the clearance path after its buyer becomes a natural person', async () => {
    const buyer = await makeCustomer({ kind: 'ESTABLISHMENT', name: `Kind change buyer ${Date.now()}`, otherIdScheme: 'CRN', otherId: '1010101010', ...FULL_ADDRESS });
    const invoice = await makeInvoice(buyer, 'Standard supply');
    await signWithoutSending(invoice.id);
    expect((await row(invoice.id)).zatcaSignedXml).toContain('<cbc:InvoiceTypeCode name="0100000">388</cbc:InvoiceTypeCode>');

    await as(http().patch(`/customers/${buyer}`)).send({ kind: 'NATURAL' }).expect(200);

    authority.set('clear');
    await submit(invoice.id).expect(201);
    expect(await pathsFor(invoice.id)).toEqual([CLEARANCE]);
    expect((await listRow(invoice.id)).invoiceType).toBe('standard');
    expect((await listRow(invoice.id)).clearedCopy).toBe('available');
    signed.standard = invoice.id;
  });

  it('signing stores the type and the transaction code the signed document carries', async () => {
    expect(signed.simplified && signed.standard && signed.note).toBeTruthy();
    expect(await storedType(signed.simplified!)).toEqual({ type: 'SIMPLIFIED', code: '0200000' });
    expect(await storedType(signed.standard!)).toEqual({ type: 'STANDARD', code: '0100000' });
    expect(await storedType(signed.note!)).toEqual({ type: 'SIMPLIFIED', code: '0200000' });
  });

  it('a signed document without a stored type is refused at send, not sent on a guessed path', async () => {
    const buyer = await makeCustomer({ kind: 'NATURAL', name: `Untyped buyer ${Date.now()}` });
    const invoice = await makeInvoice(buyer, 'Untyped sale');
    await signWithoutSending(invoice.id);
    const before = authority.requests.length;
    // A document signed before the column existed; the database guard refuses building one now, so it is written past it.
    await tenantPrisma.runInTenantContext(company.companyId, (tx) =>
      writePastDbGuard(tx, 'invoices', () => tx.$executeRaw`UPDATE "invoices" SET "zatcaInvoiceType" = NULL, "zatcaTransactionCode" = NULL WHERE "id" = ${invoice.id}`),
    );

    authority.set('clear');
    await submit(invoice.id).expect(503);
    const { zatcaUuid } = await row(invoice.id);
    expect(authority.requests.slice(before).filter((q) => q.body.uuid === zatcaUuid)).toHaveLength(0);
    const after = await tenantPrisma.runInTenantContext(company.companyId, (tx) =>
      tx.invoice.findUniqueOrThrow({ where: { id: invoice.id }, select: { zatcaStatus: true, zatcaMessage: true } }),
    );
    expect(after).toEqual({ zatcaStatus: 'STAMPED', zatcaMessage: STORED_TYPE_UNKNOWN });
  });

  it('the migration backfill reads the type from each signed document, does nothing when none is missing, and leaves an unreadable one empty', async () => {
    const sql = readFileSync(join(__dirname, '..', 'prisma', 'migrations', '20261017151100_invoice_zatca_type_at_signing', 'migration.sql'), 'utf8');
    const backfill = sql.match(/DO \$\$[\s\S]*?END \$\$/)?.[0];
    // Probe check: the block was read from its file.
    expect(backfill).toContain('RAISE WARNING');
    const ids = [signed.simplified!, signed.standard!, signed.note!];

    const ROLLBACK = new Error('rollback-by-design');
    const seen: Record<string, unknown> = {};
    await expect(
      tenantPrisma.runInTenantContext(
        company.companyId,
        async (tx) => {
          const read = () =>
            tx.$queryRaw<{ id: string; type: string | null; code: string | null }[]>`
              SELECT "id", "zatcaInvoiceType"::text AS "type", "zatcaTransactionCode" AS "code" FROM "invoices" WHERE "id" IN (${ids[0]}, ${ids[1]}, ${ids[2]})`;
          // The backfill ran before the signed invoice guard existed, so it is replayed with the guard lifted as it was then.
          await writePastDbGuard(tx, 'invoices', async () => {
            // Nothing missing on these rows: the block leaves them as they are.
            await tx.$executeRawUnsafe(backfill!);
            seen.untouched = await read();
            await tx.$executeRaw`UPDATE "invoices" SET "zatcaInvoiceType" = NULL, "zatcaTransactionCode" = NULL WHERE "id" IN (${ids[0]}, ${ids[1]}, ${ids[2]})`;
            await tx.$executeRaw`UPDATE "invoices" SET "zatcaSignedXml" = replace("zatcaSignedXml", '<cbc:InvoiceTypeCode name="0200000">', '<cbc:InvoiceTypeCode>') WHERE "id" = ${ids[2]}`;
            await tx.$executeRawUnsafe(backfill!);
          });
          seen.filled = await read();
          throw ROLLBACK;
        },
        { timeout: 60000 },
      ),
    ).rejects.toBe(ROLLBACK);

    const byId = (rows: unknown) => new Map((rows as { id: string; type: string | null; code: string | null }[]).map((r) => [r.id, { type: r.type, code: r.code }]));
    const untouched = byId(seen.untouched);
    expect(untouched.get(ids[0])).toEqual({ type: 'SIMPLIFIED', code: '0200000' });
    expect(untouched.get(ids[1])).toEqual({ type: 'STANDARD', code: '0100000' });
    const filled = byId(seen.filled);
    expect(filled.get(ids[0])).toEqual({ type: 'SIMPLIFIED', code: '0200000' });
    expect(filled.get(ids[1])).toEqual({ type: 'STANDARD', code: '0100000' });
    expect(filled.get(ids[2])).toEqual({ type: null, code: null });
    // What was rolled back stays rolled back.
    expect(await storedType(ids[2])).toEqual({ type: 'SIMPLIFIED', code: '0200000' });
  });
});
