import { PrismaClient } from '@mad-app/db';
import { randomUUID } from 'node:crypto';
import { LIVE_SPEC_TIMEOUT_MS } from '../../test/live-spec-timeout';

jest.setTimeout(LIVE_SPEC_TIMEOUT_MS);

/**
 * Live proof, on a real database and with the application role, that the database itself refuses changing a signed
 * invoice, its lines and a posted journal line. The services already refuse these through the API; a raw statement
 * reaches the table without them, so the refusal has to live in the table.
 *
 * Every case runs inside one transaction that is rolled back at the end, so nothing it writes stays behind. A refused
 * statement runs under a savepoint so the transaction can continue after it.
 */
const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

class RolledBack extends Error {}

d('signed invoices and posted journal lines are protected in the database', () => {
  const prisma = new PrismaClient();
  let companyId: string;

  beforeAll(async () => {
    companyId = (await prisma.company.findFirstOrThrow({ select: { id: true }, orderBy: { createdAt: 'asc' } })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Runs `fn` in the company's context and rolls everything back afterwards. */
  async function rolledBack(fn: (tx: Tx) => Promise<void>): Promise<void> {
    await prisma
      .$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
        await fn(tx);
        throw new RolledBack();
      })
      .catch((e: unknown) => {
        if (!(e instanceof RolledBack)) throw e;
      });
  }

  /** The error a statement raised, or null when it went through. */
  async function attempt(tx: Tx, sql: string, ...values: unknown[]): Promise<string | null> {
    await tx.$executeRawUnsafe('SAVEPOINT probe');
    try {
      await tx.$executeRawUnsafe(sql, ...values);
      await tx.$executeRawUnsafe('RELEASE SAVEPOINT probe');
      return null;
    } catch (e) {
      await tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT probe');
      return String((e as Error).message);
    }
  }

  async function customerOf(tx: Tx): Promise<string> {
    const [row] = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "customers" WHERE "companyId" = ${companyId} LIMIT 1`;
    if (!row) throw new Error('the seeded company has no customer; the seed did not run');
    return row.id;
  }

  /** An invoice with one line, then signed when `hash` is given, in the order the product writes them. */
  async function insertInvoice(tx: Tx, hash: string | null): Promise<{ invoiceId: string; lineId: string }> {
    const invoiceId = randomUUID();
    const lineId = randomUUID();
    const customerId = await customerOf(tx);
    await tx.$executeRaw`
      INSERT INTO "invoices" ("id","companyId","no","customerId","issueDate","dueDate","subtotal","taxTotal","total",
                              "baseSubtotal","baseTaxTotal","baseTotal","updatedAt")
      VALUES (${invoiceId}, ${companyId}, ${'PROBE-' + invoiceId}, ${customerId}, DATE '2026-10-01', DATE '2026-10-31',
              100, 15, 115, 100, 15, 115, now())`;
    await tx.$executeRaw`
      INSERT INTO "invoice_lines" ("id","companyId","invoiceId","lineNo","description","quantity","unitPrice","taxRate","taxCategory")
      VALUES (${lineId}, ${companyId}, ${invoiceId}, 1, 'probe line', 1, 100, 15, 'S'::"TaxCategory")`;
    if (hash) {
      await tx.$executeRaw`
        UPDATE "invoices" SET "zatcaHash" = ${hash}, "zatcaSignedXml" = '<Invoice/>', "zatcaStatus" = 'STAMPED' WHERE "id" = ${invoiceId}`;
    }
    return { invoiceId, lineId };
  }

  async function totalOf(tx: Tx, invoiceId: string): Promise<string> {
    const [row] = await tx.$queryRaw<{ total: string }[]>`SELECT "total"::text AS "total" FROM "invoices" WHERE "id" = ${invoiceId}`;
    return row.total;
  }

  async function insertEntry(tx: Tx): Promise<{ entryId: string; lineId: string }> {
    const accounts = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "accounts" WHERE "companyId" = ${companyId} ORDER BY "code" LIMIT 2`;
    if (accounts.length < 2) throw new Error('the seeded company has no chart of accounts; the seed did not run');
    const entryId = randomUUID();
    const lineId = randomUUID();
    await tx.$executeRaw`
      INSERT INTO "journal_entries" ("id","companyId","no","date","memo","totalDebit","totalCredit","baseTotalDebit","baseTotalCredit")
      VALUES (${entryId}, ${companyId}, ${'PROBE-' + entryId}, DATE '2026-10-01', 'probe entry', 50, 50, 50, 50)`;
    await tx.$executeRaw`
      INSERT INTO "journal_lines" ("id","companyId","journalEntryId","accountId","debit","credit")
      VALUES (${lineId}, ${companyId}, ${entryId}, ${accounts[0].id}, 50, 0),
             (${randomUUID()}, ${companyId}, ${entryId}, ${accounts[1].id}, 0, 50)`;
    return { entryId, lineId };
  }

  it('refuses a raw update of a signed invoice total, and the total stays', async () => {
    await rolledBack(async (tx) => {
      const { invoiceId } = await insertInvoice(tx, 'a'.repeat(44));
      const refused = await attempt(tx, `UPDATE "invoices" SET "total" = 1, "baseTotal" = 1 WHERE "id" = $1`, invoiceId);
      expect(refused).toMatch(/signed invoice/);
      expect(await totalOf(tx, invoiceId)).toBe('115.00');
    });
  });

  it('refuses a raw update of the signed document, its chain fields, its party and its dates', async () => {
    await rolledBack(async (tx) => {
      const { invoiceId } = await insertInvoice(tx, 'b'.repeat(44));
      const other = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "customers" WHERE "companyId" = ${companyId} LIMIT 2`;
      for (const [sql, value] of [
        [`UPDATE "invoices" SET "zatcaSignedXml" = $2 WHERE "id" = $1`, '<Invoice>changed</Invoice>'],
        [`UPDATE "invoices" SET "zatcaHash" = $2 WHERE "id" = $1`, 'c'.repeat(44)],
        [`UPDATE "invoices" SET "zatcaPreviousHash" = $2 WHERE "id" = $1`, 'd'.repeat(44)],
        [`UPDATE "invoices" SET "issueDate" = $2::date WHERE "id" = $1`, '2026-09-01'],
        [`UPDATE "invoices" SET "no" = $2 WHERE "id" = $1`, 'PROBE-RENUMBERED'],
        [`UPDATE "invoices" SET "customerId" = $2 WHERE "id" = $1`, other[other.length - 1].id],
      ] as const) {
        // A customer swap is only a change when the company has a second customer; the same id is no change at all.
        if (sql.includes('customerId') && other.length < 2) continue;
        expect([sql, await attempt(tx, sql, invoiceId, value)]).toEqual([sql, expect.stringMatching(/signed invoice/)]);
      }
    });
  });

  it('allows the columns the code writes after signing: authority answer, payment status and links', async () => {
    await rolledBack(async (tx) => {
      const { invoiceId } = await insertInvoice(tx, 'e'.repeat(44));
      expect(
        await attempt(
          tx,
          `UPDATE "invoices" SET "zatcaStatus" = 'CLEARED', "zatcaSubmittedAt" = now(), "zatcaMessage" = 'ok',
                                 "zatcaClearedXml" = '<Invoice/>', "zatcaWarnings" = '[]'::jsonb, "status" = 'PAID',
                                 "notes" = 'paid in cash', "updatedAt" = now()
           WHERE "id" = $1`,
          invoiceId,
        ),
      ).toBeNull();
    });
  });

  it('allows any change before signing, and the signing write itself', async () => {
    await rolledBack(async (tx) => {
      const { invoiceId, lineId } = await insertInvoice(tx, null);
      expect(await attempt(tx, `UPDATE "invoices" SET "total" = 230, "baseTotal" = 230 WHERE "id" = $1`, invoiceId)).toBeNull();
      expect(await attempt(tx, `UPDATE "invoice_lines" SET "quantity" = 2 WHERE "id" = $1`, lineId)).toBeNull();
      expect(
        await attempt(tx, `UPDATE "invoices" SET "zatcaHash" = $2, "zatcaSignedXml" = '<Invoice/>', "zatcaStatus" = 'STAMPED' WHERE "id" = $1`, invoiceId, 'f'.repeat(44)),
      ).toBeNull();
      expect(await attempt(tx, `DELETE FROM "invoice_lines" WHERE "id" = $1`, lineId)).toMatch(/signed invoice/);
    });
  });

  it('refuses changing, removing or adding a line of a signed invoice', async () => {
    await rolledBack(async (tx) => {
      const { invoiceId, lineId } = await insertInvoice(tx, 'g'.repeat(44));
      expect(await attempt(tx, `UPDATE "invoice_lines" SET "unitPrice" = 1 WHERE "id" = $1`, lineId)).toMatch(/signed invoice/);
      expect(await attempt(tx, `DELETE FROM "invoice_lines" WHERE "id" = $1`, lineId)).toMatch(/signed invoice/);
      expect(
        await attempt(
          tx,
          `INSERT INTO "invoice_lines" ("id","companyId","invoiceId","lineNo","description","quantity","unitPrice","taxRate","taxCategory")
           VALUES ($1, $2, $3, 2, 'added later', 1, 5, 15, 'S'::"TaxCategory")`,
          randomUUID(),
          companyId,
          invoiceId,
        ),
      ).toMatch(/signed invoice/);
    });
  });

  it('refuses a raw update of a posted journal line', async () => {
    await rolledBack(async (tx) => {
      const { lineId } = await insertEntry(tx);
      expect(await attempt(tx, `UPDATE "journal_lines" SET "debit" = 5000 WHERE "id" = $1`, lineId)).toMatch(/posted journal/);
      const [row] = await tx.$queryRaw<{ debit: string }[]>`SELECT "debit"::text AS "debit" FROM "journal_lines" WHERE "id" = ${lineId}`;
      expect(row.debit).toBe('50.00');
    });
  });

  it('refuses a raw update of a posted entry date or totals, and allows its memo', async () => {
    await rolledBack(async (tx) => {
      const { entryId } = await insertEntry(tx);
      expect(await attempt(tx, `UPDATE "journal_entries" SET "date" = DATE '2025-01-01' WHERE "id" = $1`, entryId)).toMatch(/posted journal/);
      expect(await attempt(tx, `UPDATE "journal_entries" SET "totalDebit" = 1, "totalCredit" = 1 WHERE "id" = $1`, entryId)).toMatch(/posted journal/);
      expect(await attempt(tx, `UPDATE "journal_entries" SET "memo" = 'renamed' WHERE "id" = $1`, entryId)).toBeNull();
    });
  });
});
