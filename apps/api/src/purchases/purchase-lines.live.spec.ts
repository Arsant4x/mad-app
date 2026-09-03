import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { LIVE_SPEC_TIMEOUT_MS } from '../../test/live-spec-timeout';

// مهلة مقيسة لا افتراضية — الرقم ومصدره في `live-spec-timeout.ts`.
jest.setTimeout(LIVE_SPEC_TIMEOUT_MS);

/**
 * بوابة الموجة L0-0 — **بند المستند**.
 *
 * وثلاثة توكيدات، وثالثها هو الذي يجعل الجدول صالحاً للوجود أصلاً:
 *
 *   ① شراءٌ ببندين — **مخزني وخدمي** — يُحفظ ويُقرأ بصنفه وبلا صنفه.
 *   ② والمستندات القائمة تُقرأ كما هي: `productId` فيها `null` لا خطأ.
 *   ③ **والعزل**: بندُ منشأةٍ لا يُقرأ من سياق منشأةٍ أخرى.
 *
 * ⚠️ **والثالث ليس تزيّداً**: `purchase_lines` جدولٌ جديد للمستأجر، وجدولٌ
 * بلا RLS **يُقرأ عبر المنشآت كلها**. والفحص البنيوي («هل السياسة مكتوبة في
 * الترحيل؟») يثبت أنها كُتبت لا أنها تعمل — و`FORCE` بالذات يسقط صامتاً:
 * بدونه يتجاوز **مالك الجدول** السياسة، والاتصال الذي تُشغَّل به الترحيلات
 * هو المالك. فيبدو الجدول محميّاً وهو مكشوف.
 *
 * وكل ما يُكتب هنا يقع داخل معاملةٍ **تُلغى عمداً** — فلا صفَّ يبقى.
 */
const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

/** إشارة إلغاء — صنفٌ خاص كي لا يبتلع `rejects.toThrow` خطأً حقيقياً. */
class RollbackSignal extends Error {}

d('L0-0 — بند المستند على قاعدة حيّة', () => {
  const prisma = new PrismaClient();
  let companyA: string;
  let companyB: string;

  beforeAll(async () => {
    const companies = await prisma.company.findMany({ select: { id: true }, take: 2, orderBy: { id: 'asc' } });
    // منشأتان لازمتان للتوكيد ③. وقاعدةٌ بأقلّ من اثنتين تعني أن البذرة لم
    // تُشغَّل — سقوطٌ صريح لا تخطٍّ صامت.
    expect(companies.length).toBe(2);
    companyA = companies[0].id;
    companyB = companies[1].id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** ينشئ مورّداً وصنفاً وشراءً ببندين داخل معاملةٍ تُلغى. */
  const withPurchase = async <T>(work: (ctx: {
    tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
    purchaseId: string;
    productId: string;
  }) => Promise<T>): Promise<T> => {
    let captured!: T;
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.company_id', ${companyA}, true)`;
        const supplier = await tx.supplier.create({ data: { companyId: companyA, name: 'مورّد بوابة L0-0' } });
        const product = await tx.product.create({ data: { companyId: companyA, name: 'صنف بوابة L0-0' } });
        const purchase = await tx.purchase.create({
          data: {
            companyId: companyA,
            no: `PL-${randomUUID().slice(0, 8)}`,
            supplierId: supplier.id,
            date: new Date(),
            subtotal: 1000,
            taxAmount: 150,
            total: 1150,
            baseSubtotal: 1000,
            baseTaxAmount: 150,
            baseTotal: 1150,
            lines: {
              create: [
                { companyId: companyA, description: 'بند مخزني', productId: product.id, quantity: '10.5', unitPrice: '80.123456', taxRate: 15 },
                { companyId: companyA, description: 'بند خدمي — أجرة تركيب', productId: null, quantity: '1', unitPrice: '160', taxRate: 15 },
              ],
            },
          },
        });
        captured = await work({ tx, purchaseId: purchase.id, productId: product.id });
        throw new RollbackSignal();
      }),
    ).rejects.toThrow(RollbackSignal);
    return captured;
  };

  it('[SPEC 5.2] ⭐ ① شراءٌ ببندين — مخزنيٍّ وخدميٍّ — يُحفظ ويُقرأ', async () => {
    const lines = await withPurchase(({ tx, purchaseId }) =>
      tx.purchaseLine.findMany({ where: { purchaseId }, orderBy: { description: 'asc' } }),
    );

    expect(lines.length).toBe(2);

    const stocked = lines.find((l) => l.productId !== null)!;
    const service = lines.find((l) => l.productId === null)!;

    expect(stocked.description).toBe('بند مخزني');
    // الدقّة المولودة مع الجدول — لا موسَّعة إليه لاحقاً (موجة ٢).
    expect(stocked.quantity.toString()).toBe('10.5');
    expect(stocked.unitPrice.toString()).toBe('80.123456');

    // ⚠️ **والبند الخدمي يُحفظ بلا صنف** — لا يُرفض ولا يُختلق له صنف.
    expect(service.description).toBe('بند خدمي — أجرة تركيب');
    expect(service.productId).toBeNull();
  });

  it('⭐ ② والمستندات القائمة تُقرأ كما هي — `productId` فيها فارغ لا خاطئ', async () => {
    /**
     * كل سطر فاتورة كُتب قبل هذه الموجة يجب أن يُقرأ بلا انفجار. والقراءة
     * وحدها لا تكفي: يُفحص أن العمود **موجود وفارغ** — لأن سطراً بصنفٍ
     * مخترَع أسوأ من سطرٍ بلا صنف.
     */
    const legacy = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.company_id', ${companyA}, true)`;
      return tx.invoiceLine.findMany({ select: { id: true, productId: true }, take: 20 });
    });

    expect(legacy.every((l) => l.productId === null)).toBe(true);
  });

  it('[SPEC 1.2] ⭐ ③ والعزل: بندُ منشأةٍ لا يُقرأ من سياق منشأةٍ أخرى', async () => {
    const seenByOther = await withPurchase(async ({ tx, purchaseId }) => {
      // نفس المعاملة، سياقٌ آخر — فالفحص يقع على السياسة لا على الاتصال.
      await tx.$executeRaw`SELECT set_config('app.company_id', ${companyB}, true)`;
      const rows = await tx.purchaseLine.findMany({ where: { purchaseId } });
      // ويُعاد السياق كي يكتمل الإلغاء تحت المنشأة التي كتبت.
      await tx.$executeRaw`SELECT set_config('app.company_id', ${companyA}, true)`;
      return rows.length;
    });

    expect(seenByOther).toBe(0);
  });

  it('⭐ ④ ولا يبقى صفٌّ بعد البوابة — الإلغاء وقع فعلاً', async () => {
    // §8.8: يُفحص وقوع الإلغاء قبل الوثوق بنتيجة ما قبله.
    const left = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.company_id', ${companyA}, true)`;
      return tx.purchaseLine.count({ where: { description: { startsWith: 'بند ' } } });
    });
    expect(left).toBe(0);
  });
});
