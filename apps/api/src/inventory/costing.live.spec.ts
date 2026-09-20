import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { LIVE_SPEC_TIMEOUT_MS } from '../../test/live-spec-timeout';
import { consumeFifo, restoreConsumption, weightedAverageCost } from './costing.util';

// مهلة مقيسة لا افتراضية — الرقم ومصدره في `live-spec-timeout.ts`.
jest.setTimeout(LIVE_SPEC_TIMEOUT_MS);

/**
 * بوابة `م٤` — طبقات التكلفة، والمنع البنيوي.
 *
 * وكل ما يُكتب هنا داخل معاملةٍ **تُلغى عمداً**، فلا صفَّ يبقى.
 *
 * ⚠️ **وميل هذه البوابة معلَن**: توكيداتها تفحص **الرقم لا وجود الصفّ** —
 * فطبقةٌ استُهلكت بالمتوسط بدل تكلفتها تمرّ في أي فحصٍ يعدّ الصفوف، وتسقط
 * هنا وحدها.
 */
const HAS_DB = Boolean(process.env.DATABASE_URL);
const d = HAS_DB ? describe : describe.skip;

class RollbackSignal extends Error {}

d('L0-2 — طبقات التكلفة على قاعدة حيّة', () => {
  const prisma = new PrismaClient();
  let companyA: string;
  let companyB: string;

  beforeAll(async () => {
    const companies = await prisma.company.findMany({ select: { id: true }, take: 2, orderBy: { id: 'asc' } });
    expect(companies.length).toBe(2);
    companyA = companies[0].id;
    companyB = companies[1].id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** يهيّئ صنفاً ومستودعاً وثلاث طبقات، ثم يُلغي كل شيء بعد `work`. */
  const withStock = async <T>(
    work: (ctx: {
      tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
      productId: string;
      warehouseId: string;
      movementId: (qty: number) => Promise<string>;
    }) => Promise<T>,
  ): Promise<T> => {
    let captured!: T;
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.company_id', ${companyA}, true)`;
        const warehouse = await tx.warehouse.create({ data: { companyId: companyA, name: 'مستودع بوابة م٤' } });
        const product = await tx.product.create({ data: { companyId: companyA, name: 'صنف بوابة م٤', cost: 7, taxCategory: 'S' } });

        // ثلاث طبقات بثلاث تكاليف وثلاثة تواريخ اقتناء.
        const day = (n: number) => new Date(Date.UTC(2026, 0, n));
        for (const [n, qty, cost] of [
          [1, 10, 10],
          [2, 10, 20],
          [3, 10, 30],
        ] as const) {
          await tx.inventoryLayer.create({
            data: {
              companyId: companyA,
              productId: product.id,
              warehouseId: warehouse.id,
              qtyReceived: qty,
              qtyRemaining: qty,
              unitCost: cost,
              acquiredAt: day(n),
              sourceType: 'GOODS_RECEIPT',
            },
          });
        }

        const movementId = async (qty: number) => {
          const m = await tx.stockMovement.create({
            data: {
              companyId: companyA,
              productId: product.id,
              warehouseId: warehouse.id,
              type: 'OUT',
              qty,
              date: new Date(),
              origin: 'MANUAL',
            },
            select: { id: true },
          });
          return m.id;
        };

        captured = await work({ tx, productId: product.id, warehouseId: warehouse.id, movementId });
        throw new RollbackSignal();
      }),
    ).rejects.toThrow(RollbackSignal);
    return captured;
  };

  it('⭐ ① FIFO يأخذ الأقدم **بتكلفتها هي** لا بالمتوسط', async () => {
    const result = await withStock(async ({ tx, productId, warehouseId, movementId }) => {
      const mid = await movementId(15);
      return consumeFifo(tx, companyA, { productId, warehouseId, qty: 15, movementId: mid });
    });

    // ١٠ من طبقة ١٠ + ٥ من طبقة ٢٠ = ١٠٠ + ١٠٠ = ٢٠٠
    // ⚠️ والمتوسط المرجّح كان سيعطي 15 × 20 = 300 — **فالرقم هو الفاصل**.
    expect(result.totalCost).toBe(200);
    expect(result.provisionalQty).toBe(0);
    expect(result.consumptionIds).toHaveLength(2);
  });

  it('⭐ ② والطبقة تنقص ولا تُحذف — والمرتجع يجدها', async () => {
    const { after, restored } = await withStock(async ({ tx, productId, warehouseId, movementId }) => {
      const mid = await movementId(15);
      await consumeFifo(tx, companyA, { productId, warehouseId, qty: 15, movementId: mid });

      const layers = await tx.inventoryLayer.findMany({ where: { productId }, orderBy: { acquiredAt: 'asc' } });
      const after = layers.map((l) => `${Number(l.unitCost)}:${Number(l.qtyRemaining)}`);

      const restored = await restoreConsumption(tx, companyA, mid);
      const back = await tx.inventoryLayer.findMany({ where: { productId }, orderBy: { acquiredAt: 'asc' } });
      return { after, restored: { ...restored, back: back.map((l) => `${Number(l.unitCost)}:${Number(l.qtyRemaining)}`) } };
    });

    // الطبقة الأولى استُهلكت كاملةً — **وبقيت** برصيد صفر، ولم تُحذف.
    expect(after).toEqual(['10:0', '20:5', '30:10']);
    // والمرتجع أعادها إلى حالها — لا طبقة رابعة بتاريخ اليوم.
    expect(restored.back).toEqual(['10:10', '20:10', '30:10']);
    expect(restored.restoredQty).toBe(15);
    expect(restored.reversedCost).toBe(200);
  });

  it('⭐ ③ وما لا طبقة له يصير استهلاكاً **مؤقّتاً معلَّماً** — لا صامتاً', async () => {
    const { result, rows } = await withStock(async ({ tx, productId, warehouseId, movementId }) => {
      const mid = await movementId(35);
      const result = await consumeFifo(tx, companyA, { productId, warehouseId, qty: 35, movementId: mid });
      const rows = await tx.inventoryConsumption.findMany({ where: { movementId: mid } });
      // «مؤقّت» يُقرأ من غياب الطبقة — لا من علَمٍ يوصفه.
      return { result, rows: rows.map((r) => ({ hasLayer: r.layerId !== null, qty: Number(r.qty) })) };
    });

    // ٣٠ من الطبقات (١٠٠+٢٠٠+٣٠٠=٦٠٠) + ٥ مؤقّتة بآخر تكلفة معروفة (٣٠) = ٧٥٠
    expect(result.totalCost).toBe(750);
    expect(result.provisionalQty).toBe(5);
    expect(result.provisionalUnitCost).toBe(30);
    // والمؤقّت **بلا طبقة** — فلا تُختلق له طبقةٌ تُفسد «كم استلمنا فعلاً».
    expect(rows).toContainEqual({ hasLayer: false, qty: 5 });
    // وثلاثةٌ حقيقية، كلٌّ يسمّي طبقته.
    expect(rows.filter((r) => r.hasLayer)).toHaveLength(3);
  });

  it('⭐ ④ والمتوسط المرجّح **يُشتقّ** من الطبقات — لا يُخزَّن', async () => {
    const avg = await withStock(({ tx, productId, warehouseId }) => weightedAverageCost(tx, productId, warehouseId));
    // (10×10 + 10×20 + 10×30) / 30 = 20
    expect(avg).toBe(20);
  });
});

d('L0-2 — المنع البنيوي: مُشغِّل القاعدة', () => {
  const prisma = new PrismaClient();
  let companyId: string;

  beforeAll(async () => {
    const c = await prisma.company.findFirstOrThrow({ select: { id: true } });
    companyId = c.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /**
   * ⚠️ **يُفحص المنع من القاعدة لا من الخدمة.**
   *
   * حارسٌ في الشيفرة يُخدَع بالشكل (§8.21)، ونوعٌ في TypeScript يتجاوزه
   * `as any`. فالكتابة هنا تقع مباشرةً على الجدول — **كما يفعل مبرمجٌ لم يقرأ
   * القاعدة، أو `psql`**.
   */
  const attempt = (fn: (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => Promise<unknown>) =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
      await fn(tx);
      throw new RollbackSignal();
    });

  it('⭐ ① بيعٌ بلا سطر مستند — يُرفض من القاعدة', async () => {
    await expect(
      attempt(async (tx) => {
        const w = await tx.warehouse.create({ data: { companyId, name: 'م٤ منع ١' } });
        const p = await tx.product.create({ data: { companyId, name: 'صنف منع ١', taxCategory: 'S' } });
        await tx.stockMovement.create({
          data: { companyId, productId: p.id, warehouseId: w.id, type: 'OUT', qty: 1, date: new Date(), origin: 'SALE' },
        });
      }),
    ).rejects.toThrow(/stock_movements_origin_matches_source|violates check constraint/i);
  });

  it('⭐ ② وحركةٌ تشير إلى سطرٍ بلا صنف — تُرفض بنصٍّ مفهوم', async () => {
    await expect(
      attempt(async (tx) => {
        const w = await tx.warehouse.create({ data: { companyId, name: 'م٤ منع ٢' } });
        const p = await tx.product.create({ data: { companyId, name: 'صنف منع ٢', taxCategory: 'S' } });
        const customer = await tx.customer.create({ data: { companyId, name: 'عميل منع ٢' } });
        const inv = await tx.invoice.create({
          data: {
            companyId, no: `MP2-${randomUUID().slice(0, 8)}`, customerId: customer.id,
            issueDate: new Date(), dueDate: new Date(),
            subtotal: 1, taxTotal: 0, total: 1, baseSubtotal: 1, baseTaxTotal: 0, baseTotal: 1,
            lines: { create: [{ companyId, description: 'سطر خدمي بلا صنف', quantity: 1, unitPrice: 1, taxRate: 15, taxCategory: 'S' }] },
          },
          include: { lines: true },
        });
        await tx.stockMovement.create({
          data: {
            companyId, productId: p.id, warehouseId: w.id, type: 'OUT', qty: 1, date: new Date(),
            origin: 'SALE', invoiceLineId: inv.lines[0].id,
          },
        });
      }),
    ).rejects.toThrow(/بلا صنف/);
  });

  it('⭐ ③ وصنفُ الحركة يخالف صنف السطر — يُرفض', async () => {
    await expect(
      attempt(async (tx) => {
        const w = await tx.warehouse.create({ data: { companyId, name: 'م٤ منع ٣' } });
        const sold = await tx.product.create({ data: { companyId, name: 'الصنف المبيع', taxCategory: 'S' } });
        const other = await tx.product.create({ data: { companyId, name: 'صنفٌ آخر', taxCategory: 'S' } });
        const customer = await tx.customer.create({ data: { companyId, name: 'عميل منع ٣' } });
        const inv = await tx.invoice.create({
          data: {
            companyId, no: `MP3-${randomUUID().slice(0, 8)}`, customerId: customer.id,
            issueDate: new Date(), dueDate: new Date(),
            subtotal: 1, taxTotal: 0, total: 1, baseSubtotal: 1, baseTaxTotal: 0, baseTotal: 1,
            lines: { create: [{ companyId, description: 'سطر بصنف', productId: sold.id, quantity: 1, unitPrice: 1, taxRate: 15, taxCategory: 'S' }] },
          },
          include: { lines: true },
        });
        await tx.stockMovement.create({
          data: {
            companyId, productId: other.id, warehouseId: w.id, type: 'OUT', qty: 1, date: new Date(),
            origin: 'SALE', invoiceLineId: inv.lines[0].id,
          },
        });
      }),
    ).rejects.toThrow(/يخالف صنف سطر المستند/);
  });

  it('⭐ ④ والحركة الصحيحة تمرّ — وإلا كان المنع منعاً للكل', async () => {
    // حارسٌ على الحارس: ثلاثة رفضٍ بلا قبولٍ واحد يعني قاعدةً تمنع كل شيء.
    await expect(
      attempt(async (tx) => {
        const w = await tx.warehouse.create({ data: { companyId, name: 'م٤ قبول' } });
        const p = await tx.product.create({ data: { companyId, name: 'صنف القبول', taxCategory: 'S' } });
        const customer = await tx.customer.create({ data: { companyId, name: 'عميل القبول' } });
        const inv = await tx.invoice.create({
          data: {
            companyId, no: `MP4-${randomUUID().slice(0, 8)}`, customerId: customer.id,
            issueDate: new Date(), dueDate: new Date(),
            subtotal: 1, taxTotal: 0, total: 1, baseSubtotal: 1, baseTaxTotal: 0, baseTotal: 1,
            lines: { create: [{ companyId, description: 'سطر بصنف', productId: p.id, quantity: 1, unitPrice: 1, taxRate: 15, taxCategory: 'S' }] },
          },
          include: { lines: true },
        });
        const m = await tx.stockMovement.create({
          data: {
            companyId, productId: p.id, warehouseId: w.id, type: 'OUT', qty: 1, date: new Date(),
            origin: 'SALE', invoiceLineId: inv.lines[0].id,
          },
          select: { id: true },
        });
        expect(m.id).toBeTruthy();
      }),
    ).rejects.toThrow(RollbackSignal); // الإلغاء وحده، لا رفضُ القاعدة
  });
});
