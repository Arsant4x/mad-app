import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';
import { unpostIfLinked } from '../src/journal/auto-posting.util';

/**
 * تنظيفُ اختبارٍ — **لا مسارَ منتج** (`ق-٩٥٣`).
 *
 * الصادرُ لا يُعدَّل ولا يُحذف عبر الواجهة البرمجية (`ق-٩٤٣`)، **والاختبارُ لا يُستثنى من
 * الحارس** («استثناءٌ للاختبار يجعله يشهد لِما لا يقع») — فيُزيل صفوفَه بنفسه في سياق
 * المستأجر، كما تفكّ حزمةُ حارس التعديل السلسلةَ قبل الحذف.
 *
 * ما يُزال، بالترتيب الذي تفرضه المفاتيح (`Restrict`):
 *   ① الإشعاراتُ قبل فواتيرها (`relatedInvoiceId`)، والبدلُ قبل مردودته (`replacesInvoiceId`).
 *   ② لكلِّ مستند: مرتجعُه (حركةُ `IN` بمصدر `SALE`) يُردّ عن طبقاته — لأن الإرجاع زاد
 *      الطبقةَ بلا صفِّ استهلاك (`restoreConsumptionPartial`) — ثم استهلاكاتُ حركاته مع ردِّ
 *      الكمية إلى طبقتها، ثم الحركاتُ نفسُها؛ فلا يُترك دفترُ الطبقات مخالفاً لمعادلته
 *      (`qtyRemaining = received − Σ consumed + returned`).
 *   ③ ما يشير إليه بـ`Restrict`: تخصيصاتُ السداد (ومعها سندُها إن لم يبقَ له تخصيصٌ على
 *      مستندٍ آخر — وقيدُه يُعكس)، وسندُ ردٍّ يردّه، وعرضُ سعرٍ تحوّل إليه (يُفكّ رابطُه).
 *   ④ الصفُّ نفسُه (وسطورُه ودفعاتُ الكاشير تتبعه)، ثم قيدُه عكساً وحذفاً (ما كان `remove()`
 *      يفعله)، وقيدُ تكلفته وعكسِها (يُعرفان بذكرهما — لا مفتاحَ يربطهما)، وحدثُ الطابور.
 *
 * وما يبقى يشير إليه بغير ذلك يُسقط `Restrict` الحذفَ **بصوت** لا بصمت — فيُزيله اختبارُه.
 */
/** معرّفُ المنشأة من رمز الدخول — للحزم التي لا تحتفظ به (المسلكُ نفسُه في `integrations.e2e-spec`). */
export function companyIdOfToken(token: string): string {
  return (JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()) as { companyId: string }).companyId;
}

export async function purgeInvoicesForTest(tenantPrisma: TenantPrismaService, companyId: string, invoiceIds: string[]): Promise<void> {
  const ids = [...new Set(invoiceIds)];
  if (ids.length === 0) return;
  await tenantPrisma.runInTenantContext(companyId, async (tx) => {
    const rows = await tx.invoice.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        no: true,
        journalEntryId: true,
        reversalJournalEntryId: true,
        relatedInvoiceId: true,
        replacesInvoiceId: true,
        lines: { select: { id: true, returnsLineId: true } },
      },
    });
    // الأوراقُ أولاً: ما لا يشير إليه صفٌّ باقٍ — فإشعارٌ على إشعارٍ (`ق-٩٥٢`) يُزال قبل الإشعار
    // الذي يصحّحه، والإشعارُ قبل فاتورته، والبدلُ قبل مردودته (`replacesInvoiceId` بـ`Restrict`).
    const remaining = new Map(rows.map((r) => [r.id, r]));
    const ordered: typeof rows = [];
    while (remaining.size > 0) {
      const referenced = new Set(
        [...remaining.values()].flatMap((r) => [r.relatedInvoiceId, r.replacesInvoiceId]).filter((x): x is string => x !== null),
      );
      const leaves = [...remaining.values()].filter((r) => !referenced.has(r.id));
      if (leaves.length === 0) throw new Error('purgeInvoicesForTest: دورةٌ في إحالات الإشعارات — لا ورقةَ تُزال');
      for (const leaf of leaves) {
        ordered.push(leaf);
        remaining.delete(leaf.id);
      }
    }

    for (const inv of ordered) {
      const lineIds = inv.lines.map((l) => l.id);
      const movements = lineIds.length
        ? await tx.stockMovement.findMany({ where: { invoiceLineId: { in: lineIds } }, select: { id: true, type: true, origin: true, qty: true, invoiceLineId: true } })
        : [];

      // ② المرتجعُ يُردّ عن طبقاته أولاً — بالتوزيع نفسِه الذي زادها به (الأحدثُ استهلاكاً أولاً).
      for (const m of movements.filter((x) => x.type === 'IN' && x.origin === 'SALE')) {
        const line = inv.lines.find((l) => l.id === m.invoiceLineId);
        if (!line) continue;
        // مرتجعُ إشعارٍ يردّ سطرَ فاتورته؛ وإغلاقُ مردودةٍ ببدل يردّ السطرَ نفسَه (`ق-٩٦٥`).
        const sale = await tx.stockMovement.findFirst({ where: { invoiceLineId: line.returnsLineId ?? line.id, type: 'OUT' }, select: { id: true } });
        if (!sale) continue;
        const consumptions = await tx.inventoryConsumption.findMany({ where: { movementId: sale.id, layerId: { not: null } }, orderBy: { createdAt: 'desc' } });
        let remaining = Number(m.qty);
        for (const c of consumptions) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, Number(c.qty));
          remaining -= take;
          await tx.inventoryLayer.update({ where: { id: c.layerId! }, data: { qtyRemaining: { decrement: take } } });
        }
      }

      const movementIds = movements.map((m) => m.id);
      if (movementIds.length) {
        const consumptions = await tx.inventoryConsumption.findMany({
          where: { movementId: { in: movementIds } },
          select: { id: true, layerId: true, qty: true, settlesId: true },
        });
        // ما سوّى غيرَه يُزال قبله (`settlesId` فريدٌ بـ`Restrict`).
        for (const c of [...consumptions.filter((x) => x.settlesId !== null), ...consumptions.filter((x) => x.settlesId === null)]) {
          if (c.layerId !== null) await tx.inventoryLayer.update({ where: { id: c.layerId }, data: { qtyRemaining: { increment: Number(c.qty) } } });
          await tx.inventoryConsumption.delete({ where: { id: c.id } });
        }
        await tx.stockMovement.deleteMany({ where: { id: { in: movementIds } } });
      }

      // ③ ما يشير إليه بـ`Restrict`: التخصيصاتُ وسنداتُها اليتيمة (وقيودُها)، وسنداتُ الردّ، وروابطُ عروض السعر.
      const allocations = await tx.paymentAllocation.findMany({ where: { invoiceId: inv.id }, select: { paymentId: true } });
      await tx.paymentAllocation.deleteMany({ where: { invoiceId: inv.id } });
      const refunds = await tx.payment.findMany({ where: { refundsInvoiceId: inv.id }, select: { id: true } });
      for (const pid of new Set([...allocations.map((a) => a.paymentId), ...refunds.map((r) => r.id)])) {
        if ((await tx.paymentAllocation.count({ where: { paymentId: pid } })) > 0) continue; // سندٌ يخصّ مستنداً آخر أيضاً — يبقى
        const payment = await tx.payment.findUnique({ where: { id: pid }, select: { journalEntryId: true } });
        await tx.payment.delete({ where: { id: pid } });
        await unpostIfLinked(tx, payment?.journalEntryId ?? null);
      }
      await tx.quote.updateMany({ where: { convertedInvoiceId: inv.id }, data: { convertedInvoiceId: null } });

      // ④ الصفُّ ثم قيودُه — كما كان `remove()` يفعل قبل أن يُغلَق. ومردودةٌ أُغلقت ببدلٍ تحمل
      //    قيدَ عكسها (`ق-٩٦٥`) وقيدَ عكس تكلفتها (بذكره) — يُزالان معها.
      await tx.invoice.delete({ where: { id: inv.id } });
      await unpostIfLinked(tx, inv.journalEntryId);
      await unpostIfLinked(tx, inv.reversalJournalEntryId);
      const costEntries = await tx.journalEntry.findMany({
        where: { memo: { in: [`تكلفة مبيعات ${inv.no}`, `عكس تكلفة مبيعات — مرتجع ${inv.no}`, `عكس تكلفة مبيعات — إغلاقُ مردودة ${inv.no}`] } },
        select: { id: true },
      });
      for (const e of costEntries) await unpostIfLinked(tx, e.id);
      await tx.outboxEvent.deleteMany({ where: { type: 'invoice.issued', payload: { path: ['invoiceId'], equals: inv.id } } });
    }
  });
}
