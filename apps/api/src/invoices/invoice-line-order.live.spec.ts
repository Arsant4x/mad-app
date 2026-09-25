import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { LIVE_SPEC_TIMEOUT_MS } from '../../test/live-spec-timeout';
import { LINE_ORDER } from '../common/document-lines.util';

// مهلة مقيسة لا افتراضية — الرقم ومصدره في `live-spec-timeout.ts`.
jest.setTimeout(LIVE_SPEC_TIMEOUT_MS);

/**
 * ⚖️ **ترتيبُ السطور المعلَن يغلب ترتيبَ القرص — إثباتٌ حيّ** (`ق-١٤١٢` · مكسورُ اليوم ب).
 *
 * ## ما يثبته ولا يثبته غيرُه
 *
 * حارسُ `document-line-order.spec.ts` يثبت أن **كلَّ قراءةٍ تمرّ بـ`LINE_ORDER`**؛ وهذا يثبت أن **`LINE_ORDER`
 * يعطي الترتيبَ المعلَن حيث لا يعطيه القرص**: تُكتب السطورُ **بعكس أرقامها** (٣ ثم ٢ ثم ١ — فترتيبُها على
 * القرص `3,2,1`) ويُفرض على المخطِّط مسحٌ بترتيب القرص (`enable_indexscan`/`enable_bitmapscan` مطفأة)، ثم:
 *
 *   · **القراءةُ بلا ترتيب تعيد `3,2,1`** — المسبارُ يرى ترتيبَ القرص فعلاً (الحالةُ التي يجب أن «تُخطئ»)؛
 *   · **والقراءةُ بـ`LINE_ORDER` تعيد `1,2,3`** — الحالةُ التي يجب أن تصيب.
 *
 * ⚠️ **ولماذا يُطفأ الفهرس**: الفريدُ `(invoiceId, lineNo)` هو نفسُه فهرسُ القراءة، فمسحُه يعيد السطورَ مرتّبةً
 * **ولو بلا `orderBy`** — حمايةٌ **عَرَضية** تختفي حين يختار المخطِّطُ مسحاً آخر (قائمةٌ بمستنداتٍ كثيرة ⟵ مسحٌ
 * نقطيّ بترتيب القرص). فالإثباتُ على الخطّة التي لا يحمي فيها الفهرس.
 *
 * ## والعمودُ نفسُه بوّابة
 *
 * **بلا افتراضٍ في القاعدة** فإنشاءٌ ينسى رقمَ السطر يسقط بصوت، **ومكرَّرُه في المستند يُرفض بالفريد**.
 *
 * كلُّه في معاملةٍ تُلغى عمداً — فلا صفَّ يبقى في قاعدةٍ مشتركة؛ **وفي سياق المستأجر**، فالجداولُ تحت `FORCE`
 * وقراءةٌ خارجه تعود فارغةً بنجاح.
 */
const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

/** إشارة إلغاء — صنفٌ خاص كي لا يبتلع `rejects.toThrow` خطأً حقيقياً. */
class RollbackSignal extends Error {}

d('سطورُ الفاتورة بترتيبها المعلَن على قاعدةٍ حيّة (ق-١٤١٢)', () => {
  const prisma = new PrismaClient();
  let companyId: string;

  beforeAll(async () => {
    // منشأةٌ من البذرة — والصفوفُ كلُّها تُصنع هنا داخل المعاملة، فلا يُعتمد على ما تركته البذرة.
    companyId = (await prisma.company.findFirstOrThrow({ select: { id: true } })).id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** فاتورةٌ بلا سطور في سياق المنشأة داخل المعاملة. */
  const bareInvoice = async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
    const customer = await tx.customer.create({ data: { companyId, kind: 'NATURAL', name: 'عميل مجسّ الترتيب' } });
    return tx.invoice.create({
      data: {
        companyId, no: `LO-${randomUUID().slice(0, 8)}`, customerId: customer.id,
        issueDate: new Date(), dueDate: new Date(),
        subtotal: 3, taxTotal: 0, total: 3, baseSubtotal: 3, baseTaxTotal: 0, baseTotal: 3,
      },
    });
  };

  const line = (invoiceId: string, lineNo: number) => ({
    companyId, invoiceId, lineNo, description: `السطر ${lineNo}`, quantity: 1, unitPrice: 1, taxRate: 15, taxCategory: 'S' as const,
  });

  it('⭐ القراءةُ بلا ترتيب ترى القرص (3,2,1) — وبـLINE_ORDER ترى المعلَن (1,2,3)', async () => {
    let unordered: number[] = [];
    let ordered: number[] = [];
    await expect(
      prisma.$transaction(async (tx) => {
        const invoice = await bareInvoice(tx);
        // تُكتب بعكس أرقامها — فترتيبُها على القرص 3,2,1.
        for (const n of [3, 2, 1]) await tx.invoiceLine.create({ data: line(invoice.id, n) });
        // المخطِّطُ لا يحمي بالفهرس: مسحٌ بترتيب القرص وحدَه.
        await tx.$executeRaw`SET LOCAL enable_indexscan = off`;
        await tx.$executeRaw`SET LOCAL enable_bitmapscan = off`;
        unordered = (await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { lines: true } })).lines.map((l) => l.lineNo);
        ordered = (await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { lines: LINE_ORDER } })).lines.map((l) => l.lineNo);
        throw new RollbackSignal();
      }),
    ).rejects.toThrow(RollbackSignal);
    // المسبارُ مُصادَق بحالتَين: لو أعادت القراءةُ بلا ترتيب 1,2,3 لما ثبت شيءٌ عن LINE_ORDER.
    expect(unordered).toEqual([3, 2, 1]);
    expect(ordered).toEqual([1, 2, 3]);
  });

  it('⭐ ورقمُ السطر بوّابةٌ في القاعدة: غيابُه يسقط، ومكرَّرُه في المستند يُرفض', async () => {
    // الإدراجُ الخامُ نفسُه **برقمٍ يمرّ** (ثم يُلغى) — فسقوطُه بلا رقمٍ لغيابه لا لعيبٍ آخر في الصفّ.
    await expect(
      prisma.$transaction(async (tx) => {
        const invoice = await bareInvoice(tx);
        await tx.$executeRaw`INSERT INTO "invoice_lines" ("id", "companyId", "invoiceId", "lineNo", "description", "quantity", "unitPrice", "taxRate", "taxCategory")
          VALUES (${randomUUID()}, ${companyId}, ${invoice.id}, 1, ${'برقم'}, 1, 1, 15, 'S')`;
        throw new RollbackSignal();
      }),
    ).rejects.toThrow(RollbackSignal);
    // وبلا رقم: `23502` — خرقُ «غيرُ فارغ» (Prisma لا يسمّي العمودَ في الإدراج الخام، والرمزُ يسمّي الصنف).
    await expect(
      prisma.$transaction(async (tx) => {
        const invoice = await bareInvoice(tx);
        await tx.$executeRaw`INSERT INTO "invoice_lines" ("id", "companyId", "invoiceId", "description", "quantity", "unitPrice", "taxRate", "taxCategory")
          VALUES (${randomUUID()}, ${companyId}, ${invoice.id}, ${'بلا رقم'}, 1, 1, 15, 'S')`;
      }),
    ).rejects.toThrow(/23502/);

    await expect(
      prisma.$transaction(async (tx) => {
        const invoice = await bareInvoice(tx);
        await tx.invoiceLine.create({ data: line(invoice.id, 1) });
        await tx.invoiceLine.create({ data: line(invoice.id, 1) });
      }),
    ).rejects.toThrow(/Unique constraint failed/);
  });

  it('⭐ ولا يبقى صفٌّ بعد المجسّ — الإلغاء وقع فعلاً', async () => {
    const left = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
      return tx.invoiceLine.count({ where: { description: { startsWith: 'السطر ' }, invoice: { no: { startsWith: 'LO-' } } } });
    });
    expect(left).toBe(0);
  });
});
