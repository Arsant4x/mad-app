import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { HttpExceptionFilter } from '../src/common/i18n/http-exception.filter';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { registerIsolatedCompany, removeIsolatedCompany, type IsolatedCompany } from './isolated-company';

/**
 * ق-١٢٥٢ — **حارسُ المفاتيح المركّبة** `(companyId, col) → Parent(companyId, id)` بجانب المفرد القائم.
 *
 * ① **المخطّطُ والكتالوجُ يتطابقان في الاتجاهين**: كلُّ علاقةٍ في `schema.prisma` حقولُها `[companyId, X]` لها قيدٌ
 *    في `pg_constraint` بعمودين **بلا فعلٍ عند الحذف** (`confdeltype = 'a'` — المفردُ يحمل الفعل)، وكلُّ قيدٍ مركّب في
 *    الكتالوج مُعلَنٌ في المخطّط — فلا يُضاف بيدٍ ولا يُسقَط بصمت. والعدُّ يُطبع في كلِّ تشغيل.
 * ② **كتابةٌ عابرة تُرفض من القاعدة نفسِها** (`23503` باسم القيد المركّب) في سياق منشأةٍ صحيح — أي بعد أن يمرّ
 *    الطلبُ من عزل التطبيق ومن `RLS` (فالصفُّ للمنشأة نفسِها؛ ما تغيّر هو المعرّفُ المُشار إليه). والمنشأةُ نفسُها تُقبل.
 *    عيّنةٌ لكلِّ دفعة، والقيدُ يُقرأ من الكتالوج قبل الحقن (مصادقةُ المسبار — `ق-١٣٦`).
 */
type CompositeRel = { childTable: string; col: string; parentTable: string; relName: string };

function compositeRelationsFromSchema(): CompositeRel[] {
  const src = readFileSync(join(__dirname, '..', 'prisma', 'schema.prisma'), 'utf8').split(/\r?\n/);
  const models = new Map<string, { map: string; rels: { col: string; parentModel: string; relName: string }[] }>();
  let cur: { map: string; rels: { col: string; parentModel: string; relName: string }[] } | null = null;
  let curName = '';
  for (const line of src) {
    const m = line.match(/^model (\w+) \{$/);
    if (m) { curName = m[1]; cur = { map: m[1], rels: [] }; models.set(curName, cur); continue; }
    if (!cur) continue;
    if (line === '}') { cur = null; continue; }
    const mm = line.match(/^\s*@@map\("([^"]+)"\)/);
    if (mm) { cur.map = mm[1]; continue; }
    const r = line.match(/^\s{2}\w+\s+(\w+)\??\s+@relation\("([^"]+)", fields: \[companyId, (\w+)\], references: \[companyId, id\]/);
    if (r) cur.rels.push({ parentModel: r[1], relName: r[2], col: r[3] });
  }
  const out: CompositeRel[] = [];
  for (const [, m] of models) for (const r of m.rels) out.push({ childTable: m.map, col: r.col, parentTable: models.get(r.parentModel)!.map, relName: r.relName });
  return out;
}

describe('Composite tenant foreign keys (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tenantPrisma: TenantPrismaService;
  let a: IsolatedCompany;
  let b: IsolatedCompany;
  const expected = compositeRelationsFromSchema();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);
    tenantPrisma = app.get(TenantPrismaService);
    a = await registerIsolatedCompany(app, 'cfk-a');
    b = await registerIsolatedCompany(app, 'cfk-b');
  }, 60000);

  afterAll(async () => {
    await removeIsolatedCompany(app, a);
    await removeIsolatedCompany(app, b);
    await app.close();
  });

  const auth = (c: IsolatedCompany) => (r: request.Test) => r.set('Authorization', `Bearer ${c.token}`);

  it('[SPEC 1.2] ① every composite relation in the schema is a two-column NO ACTION constraint in the catalog — and vice versa', async () => {
    // توكيدُ سلامة: القارئُ رأى المخطّطَ فعلاً (لا صفر بسبب نمطٍ لا يطابق).
    expect(expected.length).toBeGreaterThan(0);

    const rows = await prisma.$queryRaw<{ conname: string; child: string; parent: string; cols: string[]; deltype: string; updtype: string }[]>`
      SELECT c.conname,
             c.conrelid::regclass::text  AS child,
             c.confrelid::regclass::text AS parent,
             (SELECT array_agg(a.attname ORDER BY k.ord)
                FROM unnest(c.conkey) WITH ORDINALITY k(attnum, ord)
                JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum) AS cols,
             c.confdeltype AS deltype,
             c.confupdtype AS updtype
      FROM pg_constraint c
      WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace AND array_length(c.conkey, 1) = 2
      ORDER BY 1
    `;
    const strip = (s: string) => s.replace(/^"|"$/g, '');
    const catalog = new Map(rows.map((r) => [`${strip(r.child)}.${r.cols[1]} → ${strip(r.parent)}`, r]));
    const schema = new Map(expected.map((e) => [`${e.childTable}.${e.col} → ${e.parentTable}`, e]));

    const missingInCatalog = [...schema.keys()].filter((k) => !catalog.has(k));
    const undeclaredInSchema = [...catalog.keys()].filter((k) => !schema.has(k));
    const wrongShape = rows
      .filter((r) => r.cols[0] !== 'companyId' || r.deltype !== 'a' || r.updtype !== 'a')
      .map((r) => `${r.conname} cols=${r.cols.join(',')} del=${r.deltype} upd=${r.updtype}`);

    // eslint-disable-next-line no-console
    console.log(`composite FKs — schema: ${schema.size} · catalog: ${catalog.size}`);
    expect({ missingInCatalog, undeclaredInSchema, wrongShape }).toEqual({ missingInCatalog: [], undeclaredInSchema: [], wrongShape: [] });
  }, 60000);

  /** يكتب على صفٍّ من `child` (للمنشأة أ) معرّفَ أصلٍ من المنشأة ب داخل سياق أ في معاملةٍ تُرجَع — ويُعيد رمزَ الخطأ واسمَ القيد. */
  async function crossWrite(childTable: string, col: string, childId: string, foreignParentId: string) {
    let sqlstate: string | null = null;
    let constraint: string | null = null;
    try {
      await tenantPrisma.runInTenantContext(a.companyId, async (tx) => {
        try {
          await tx.$executeRawUnsafe(`UPDATE "${childTable}" SET "${col}" = $1 WHERE id = $2`, foreignParentId, childId);
        } catch (e) {
          const msg = String((e as Error).message);
          sqlstate = (msg.match(/Code: `(\d{5})`/) ?? [])[1] ?? null;
          constraint = (msg.match(/violates foreign key constraint "([^"]+)"/) ?? [])[1] ?? null;
          throw e;
        }
      });
    } catch {
      /* الرفضُ متوقَّع — قُرئ أعلاه */
    }
    return { sqlstate, constraint };
  }

  async function constraintNamed(childTable: string, col: string): Promise<string> {
    const [row] = await prisma.$queryRawUnsafe<{ conname: string }[]>(
      `SELECT c.conname FROM pg_constraint c
       WHERE c.contype = 'f' AND c.conrelid = $1::regclass AND array_length(c.conkey, 1) = 2
         AND (SELECT a.attname FROM pg_attribute a WHERE a.attrelid = c.conrelid AND a.attnum = c.conkey[2]) = $2`,
      childTable,
      col,
    );
    expect(row?.conname).toBeDefined();
    return row.conname;
  }

  it('[SPEC 1.2] ② batch 1 sample — banks.branchId → branches: a foreign company\'s branch is refused by the composite key, its own is accepted', async () => {
    const conname = await constraintNamed('banks', 'branchId');
    const branchA = await auth(a)(request(app.getHttpServer()).post('/branches')).send({ name: 'فرع أ' }).expect(201);
    const branchB = await auth(b)(request(app.getHttpServer()).post('/branches')).send({ name: 'فرع ب' }).expect(201);
    const bankA = await auth(a)(request(app.getHttpServer()).post('/banks')).send({ name: 'بنك أ', openingDate: '2026-01-01' }).expect(201);

    const refused = await crossWrite('banks', 'branchId', bankA.body.id, branchB.body.id);
    expect(refused).toEqual({ sqlstate: '23503', constraint: conname });

    await tenantPrisma.runInTenantContext(a.companyId, (tx) =>
      tx.$executeRawUnsafe(`UPDATE "banks" SET "branchId" = $1 WHERE id = $2`, branchA.body.id, bankA.body.id),
    );
    const [after] = await tenantPrisma.runInTenantContext(a.companyId, (tx) =>
      tx.$queryRawUnsafe<{ branchId: string }[]>(`SELECT "branchId" FROM "banks" WHERE id = $1`, bankA.body.id),
    );
    expect(after.branchId).toBe(branchA.body.id);
  }, 60000);

  it('[SPEC 1.2] ③ batch 2 sample — invoice_lines.invoiceId → invoices: a foreign company\'s invoice is refused, its own is accepted', async () => {
    const conname = await constraintNamed('invoice_lines', 'invoiceId');
    const invoiceOf = async (c: IsolatedCompany, tag: string) => {
      const customer = await auth(c)(request(app.getHttpServer()).post('/customers')).send({ kind: 'NATURAL', name: `عميل ${tag}` }).expect(201);
      const inv = await auth(c)(request(app.getHttpServer()).post('/invoices'))
        .send({ customerId: customer.body.id, issueDate: '2026-06-10', dueDate: '2026-07-10', lines: [{ description: `بند ${tag}`, quantity: 1, unitPrice: 100, taxRate: 15 }] })
        .expect(201);
      return inv.body as { id: string; lines: { id: string }[] };
    };
    const invA = await invoiceOf(a, 'أ');
    const invA2 = await invoiceOf(a, 'أ٢');
    const invB = await invoiceOf(b, 'ب');
    expect(invA.lines?.[0]?.id).toBeDefined();

    const refused = await crossWrite('invoice_lines', 'invoiceId', invA.lines[0].id, invB.id);
    expect(refused).toEqual({ sqlstate: '23503', constraint: conname });

    await tenantPrisma.runInTenantContext(a.companyId, (tx) =>
      tx.$executeRawUnsafe(`UPDATE "invoice_lines" SET "invoiceId" = $1 WHERE id = $2`, invA2.id, invA.lines[0].id),
    );
    const [after] = await tenantPrisma.runInTenantContext(a.companyId, (tx) =>
      tx.$queryRawUnsafe<{ invoiceId: string }[]>(`SELECT "invoiceId" FROM "invoice_lines" WHERE id = $1`, invA.lines[0].id),
    );
    expect(after.invoiceId).toBe(invA2.id);
  }, 60000);

  it('[SPEC 1.2] ④ batch 3 sample — journal_lines.journalEntryId → journal_entries: a foreign company\'s entry is refused, its own is accepted', async () => {
    const conname = await constraintNamed('journal_lines', 'journalEntryId');
    const entryOf = async (c: IsolatedCompany, tag: string) => {
      const accounts = await auth(c)(request(app.getHttpServer()).get('/accounts')).expect(200);
      const cash = accounts.body.find((x: { code: string }) => x.code === '1000').id;
      const revenue = accounts.body.find((x: { code: string }) => x.code === '4100').id;
      const res = await auth(c)(request(app.getHttpServer()).post('/journal'))
        .send({ date: '2026-06-15', memo: `قيد ${tag}`, lines: [{ accountId: cash, debit: 50, credit: 0 }, { accountId: revenue, debit: 0, credit: 50 }] })
        .expect(201);
      return res.body as { id: string; lines: { id: string }[] };
    };
    const jeA = await entryOf(a, 'أ');
    const jeA2 = await entryOf(a, 'أ٢');
    const jeB = await entryOf(b, 'ب');
    expect(jeA.lines?.[0]?.id).toBeDefined();

    const refused = await crossWrite('journal_lines', 'journalEntryId', jeA.lines[0].id, jeB.id);
    expect(refused).toEqual({ sqlstate: '23503', constraint: conname });

    await tenantPrisma.runInTenantContext(a.companyId, (tx) =>
      tx.$executeRawUnsafe(`UPDATE "journal_lines" SET "journalEntryId" = $1 WHERE id = $2`, jeA2.id, jeA.lines[0].id),
    );
    const [after] = await tenantPrisma.runInTenantContext(a.companyId, (tx) =>
      tx.$queryRawUnsafe<{ journalEntryId: string }[]>(`SELECT "journalEntryId" FROM "journal_lines" WHERE id = $1`, jeA.lines[0].id),
    );
    expect(after.journalEntryId).toBe(jeA2.id);
  }, 60000);

  it('[SPEC 1.2] ⑤ batch 4 sample — units.propertyId → properties: a foreign company\'s property is refused, its own is accepted', async () => {
    const conname = await constraintNamed('units', 'propertyId');
    const propertyOf = async (c: IsolatedCompany, tag: string) =>
      (await auth(c)(request(app.getHttpServer()).post('/properties')).send({ name: `عقار ${tag}`, ownership: 'owned' }).expect(201)).body as { id: string };
    const propA = await propertyOf(a, 'أ');
    const propA2 = await propertyOf(a, 'أ٢');
    const propB = await propertyOf(b, 'ب');
    const unitA = await auth(a)(request(app.getHttpServer()).post('/units'))
      .send({ propertyId: propA.id, unitNo: 'U-1', type: 'سكني', rentMonthly: 1000 })
      .expect(201);

    const refused = await crossWrite('units', 'propertyId', unitA.body.id, propB.id);
    expect(refused).toEqual({ sqlstate: '23503', constraint: conname });

    await tenantPrisma.runInTenantContext(a.companyId, (tx) =>
      tx.$executeRawUnsafe(`UPDATE "units" SET "propertyId" = $1 WHERE id = $2`, propA2.id, unitA.body.id),
    );
    const [after] = await tenantPrisma.runInTenantContext(a.companyId, (tx) =>
      tx.$queryRawUnsafe<{ propertyId: string }[]>(`SELECT "propertyId" FROM "units" WHERE id = $1`, unitA.body.id),
    );
    expect(after.propertyId).toBe(propA2.id);
  }, 60000);
});
