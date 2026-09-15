import { PrismaClient } from '@prisma/client';
import { LIVE_SPEC_TIMEOUT_MS } from '../../test/live-spec-timeout';
import { consumeFifo, restoreConsumptionPartial } from './costing.util';

/**
 * ⭐ سباقُ طبقات التكلفة — **الحارسُ يُثبت السباقَ نفسَه لا المعادلةَ وحدَها** (ق-٨١٤ · شرطُ المالك الرابع).
 *
 * الواقعةُ المقيسة (ق-٨٠٦): بيعتان متزامنتان بثلاثٍ على طبقةٍ بعشر — قرأ الاثنان `10` وكتب الاثنان قيمةً
 * مطلقة `7`، فأعلنت الطبقةُ ثلاثَ وحداتٍ لا وجود لها، في `20/20` جولة. والعلاجُ (ق-٨١٤): نقصانٌ ذرّيٌّ
 * مشروط (`updateMany` بـ`qtyRemaining >= take`) — يصحّ ولو تقادمت القراءة.
 *
 * حالتان متزامنتان **على صفوفٍ من صنع الحارس** (لا بذرة — ق-٦٥٩)، وكلٌّ منهما تكشف كسراً بعينه:
 *   ② طبقةٌ بأربع × بيعتان بثلاث ⇒ المتبقّي `0` لا `-2`، والفائضُ استهلاكٌ مؤقّت — تسقط على
 *      **نقصانٍ بلا شرط** (بإزالة `gte` من `where` — قيدُ `CHECK` في القاعدة يرمي) **وعلى الكتابة
 *      المطلقة** (تُعطي `1` ومستهلَكاً `6` من `4`).
 *   ① طبقةٌ بعشر × بيعتان بثلاث ⇒ المتبقّي `4` لا `7` — تسقط على **الكتابة المطلقة**.
 *
 * ⚠️ **والتداخلُ مفروضٌ لا متروكٌ للتوقيت** (وإلا شهد الحارسُ لنفسه — ق-٢٦٧): الأولى تقفل صفَّ الطبقة
 * (`FOR UPDATE`) وتنام `600 ms` قبل أن تستهلك، والثانيةُ تبدأ بعد `150 ms` فتقرأ الطبقةَ **قبل** كتابة
 * الأولى (القراءةُ لا تنتظر قفلَ الكتابة) ثم تنتظر عند كتابتها حتى تلتزم الأولى — وهي الواقعةُ بعينها.
 * ومعادلةٌ محسوبةٌ يداً بعد استهلاكٍ وإعادةٍ جزئية (ق-٧١٥) — **بحدّها**: الإعادةُ تزيد الطبقةَ ولا تكتب
 * صفَّ استهلاكٍ سالباً، فالمعادلةُ `qtyRemaining = qtyReceived − Σ الاستهلاكات + المُعاد`.
 *
 * ⚠️ الحارسُ يفحص صفوفَه لا كلَّ طبقات القاعدة — فطبقاتٌ راسبةٌ من تشغيلاتٍ سابقة لا تُسقطه.
 */
const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

d('سباق طبقات التكلفة — نقصانٌ ذرّيٌّ مشروط (ق-٨١٤)', () => {
  const prisma = new PrismaClient();
  let companyId: string;
  let warehouseId: string;
  const created = { products: [] as string[], movements: [] as string[], layers: [] as string[] };

  const inTenant = <T>(work: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<T>) =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
      return work(tx);
    });

  /** صنفٌ وطبقةٌ واحدة بكميةٍ وتكلفةٍ معلومتَين — ملتزَمةٌ فعلاً كي تتنازع عليها معاملتان. */
  async function stockedProduct(qty: number, unitCost: number) {
    return inTenant(async (tx) => {
      const product = await tx.product.create({ data: { companyId, name: `صنف سباق ${Date.now()}-${Math.random()}`, cost: unitCost } });
      const layer = await tx.inventoryLayer.create({
        data: { companyId, productId: product.id, warehouseId, qtyReceived: qty, qtyRemaining: qty, unitCost, acquiredAt: new Date(Date.UTC(2026, 0, 1)), sourceType: 'GOODS_RECEIPT' },
      });
      created.products.push(product.id);
      created.layers.push(layer.id);
      return { productId: product.id, layerId: layer.id };
    });
  }

  /** بيعةٌ كاملةٌ في معاملتها: حركةُ إخراجٍ ثم استهلاكٌ — كما يقع في `fulfilStockedLines`. */
  const sell = async (productId: string, qty: number, barrier?: { holdMs?: number; startAfterMs?: number }) => {
    if (barrier?.startAfterMs) await new Promise((r) => setTimeout(r, barrier.startAfterMs));
    return inTenant(async (tx) => {
      if (barrier?.holdMs) {
        // تقفل صفوفَ الطبقة أوّلاً ثم تنام — فتقرأ الثانيةُ القيمةَ القديمة وتنتظر عند الكتابة.
        await tx.$executeRaw`SELECT id FROM inventory_layers WHERE "productId" = ${productId} FOR UPDATE`;
        await tx.$executeRaw`SELECT pg_sleep(${barrier.holdMs / 1000})`;
      }
      const m = await tx.stockMovement.create({
        data: { companyId, productId, warehouseId, type: 'OUT', qty, date: new Date(), origin: 'MANUAL' },
        select: { id: true },
      });
      created.movements.push(m.id);
      return consumeFifo(tx, companyId, { productId, warehouseId, qty, movementId: m.id });
    });
  };

  async function layerState(layerId: string) {
    return inTenant(async (tx) => {
      const layer = await tx.inventoryLayer.findUniqueOrThrow({ where: { id: layerId } });
      const rows = await tx.inventoryConsumption.findMany({ where: { layerId }, select: { qty: true } });
      const provisional = await tx.inventoryConsumption.findMany({ where: { layerId: null, movement: { productId: layer.productId } }, select: { qty: true } });
      return {
        received: Number(layer.qtyReceived),
        remaining: Number(layer.qtyRemaining),
        consumed: rows.reduce((s, r) => s + Number(r.qty), 0),
        provisional: provisional.reduce((s, r) => s + Number(r.qty), 0),
      };
    });
  }

  beforeAll(async () => {
    const company = await prisma.company.findFirst({ select: { id: true }, orderBy: { id: 'asc' } });
    expect(company).not.toBeNull();
    companyId = company!.id;
    warehouseId = (await inTenant((tx) => tx.warehouse.create({ data: { companyId, name: `مستودع سباق ${Date.now()}` } }))).id;
  }, LIVE_SPEC_TIMEOUT_MS);

  afterAll(async () => {
    // الترتيبُ بحسب القيود: الاستهلاكاتُ قبل الحركات والطبقات، ثم الأصنافُ فالمستودع.
    await inTenant(async (tx) => {
      await tx.inventoryConsumption.deleteMany({ where: { movementId: { in: created.movements } } });
      await tx.stockMovement.deleteMany({ where: { id: { in: created.movements } } });
      await tx.inventoryLayer.deleteMany({ where: { id: { in: created.layers } } });
      await tx.product.deleteMany({ where: { id: { in: created.products } } });
      await tx.warehouse.delete({ where: { id: warehouseId } });
    });
    await prisma.$disconnect();
  }, LIVE_SPEC_TIMEOUT_MS);

  it('⭐ ① بيعتان متزامنتان بثلاثٍ على طبقةٍ بعشر ⇒ المتبقّي 4 والاستهلاكاتُ 6 — لا 7', async () => {
    const { productId, layerId } = await stockedProduct(10, 40);
    const [a, b] = await Promise.all([sell(productId, 3, { holdMs: 600 }), sell(productId, 3, { startAfterMs: 150 })]);
    expect(a.totalCost).toBe(120);
    expect(b.totalCost).toBe(120);
    const s = await layerState(layerId);
    expect(s).toEqual({ received: 10, remaining: 4, consumed: 6, provisional: 0 });
  }, LIVE_SPEC_TIMEOUT_MS);

  it('⭐ ② بيعتان متزامنتان بثلاثٍ على طبقةٍ بأربع ⇒ المتبقّي 0 لا −2، والفائضُ 2 استهلاكٌ مؤقّت', async () => {
    const { productId, layerId } = await stockedProduct(4, 40);
    const [a, b] = await Promise.all([sell(productId, 3, { holdMs: 600 }), sell(productId, 3, { startAfterMs: 150 })]);
    const s = await layerState(layerId);
    expect(s.remaining).toBe(0);
    expect(s.consumed).toBe(4);
    expect(s.provisional).toBe(2);
    expect(a.provisionalQty + b.provisionalQty).toBe(2);
    // ومجموعُ التكلفة يعكس ما حدث: 4 من الطبقة بـ40 + 2 مؤقّتاً بآخر تكلفةٍ معروفة (40)
    expect(a.totalCost + b.totalCost).toBe(240);
  }, LIVE_SPEC_TIMEOUT_MS);

  it('③ المعادلةُ بعد استهلاكٍ وإعادةٍ جزئية — جوابُها محسوبٌ يداً: 10 − 3 + 2 = 9', async () => {
    const { productId, layerId } = await stockedProduct(10, 40);
    await sell(productId, 3);
    const movementId = created.movements[created.movements.length - 1];
    const back = await inTenant((tx) => restoreConsumptionPartial(tx, companyId, movementId, 2));
    expect(back.restoredQty).toBe(2);
    const s = await layerState(layerId);
    // الإعادةُ تزيد الطبقةَ ولا تكتب صفَّ استهلاكٍ سالباً — فالمعادلةُ تحمل المُعادَ صراحةً.
    expect(s).toEqual({ received: 10, remaining: 9, consumed: 3, provisional: 0 });
    expect(s.remaining).toBe(s.received - s.consumed + back.restoredQty);
  }, LIVE_SPEC_TIMEOUT_MS);
});
