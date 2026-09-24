import { ConflictException } from '@nestjs/common';
import { NonDeductibleVatPlacement, NonDeductibleVatTrigger, Prisma } from '@prisma/client';
import { formatMessage, MSG } from '../common/i18n/messages';
import { round2, roundTo } from '../common/money/rounding';
import { postNonDeductibleVatEntry } from '../journal/auto-posting.util';
import { allocationOf, raiseLayerCost, recordCostShares, type CostShareNode } from './layer-cost-allocation.util';

/**
 * ⚖️ **ضريبةُ المدخلات غيرُ القابلة للخصم تدخل تكلفةَ ما اشتُري** (`ق-١٣٣٠` · `ق-١٣٤٢`).
 *
 * بنصّ المالك: «وهو حكمُ المعايير نصّاً: الضرائبُ غيرُ المستردّة جزءٌ من تكلفة الشراء … فبحسب ما اشتُري: مصروفٌ ⟵
 * حسابُ المصروف نفسُه · مخزونٌ ⟵ تكلفةُ الطبقة» — و«يرث قاعدةَ الانتشار القائمة بعينها، ولا منطقَ جديد. ما على الرفّ
 * يرفع تكلفةَ الطبقة، وما استُهلك إلى تكلفة المبيعات في فترة الحدث».
 *
 * ## ما تفعله الدالّة — فرقٌ لا مطلق
 * لمستندٍ واحد (شراءٌ أو إشعارُ مورّد) تحسب **ما يجب أن يكون الآن في كلِّ موضع**، وتطرح منه **ما وُضع فيه قبلُ**
 * (Σ سطور أحداثه)، وتُرحّل الفرقَ وحدَه قيدَ إعادة تصنيفٍ مستقلّاً (`postNonDeductibleVatEntry`) — فتُنادى بعد كلِّ ما
 * يغيّر الجواب (إنشاءٌ · تعديلٌ · استلامٌ · إلغاء) ولا تُكرّر ما وقع. **والمواضعُ أربعة**:
 * - **`LAYER`** طبقةُ استلامٍ حيّة: الحصّةُ على كلِّ ما استُلم فيها — ما على الرفّ يرفع تكلفتَها (`1300`) وما خرج منها
 *   على مخارجه في فترة الحدث (`ق-١٣٦٤`: البيعُ `5100` · الشطبُ `5800` · اليدويُّ `5810` · والمحوَّلُ يتبع طبقةَ مقصِده) —
 *   **بالموزِّع نفسِه** الذي يخدم إشعارَ السعر والتكلفةَ المحمَّلة (`raiseLayerCost`)، وبكتابةٍ مشروطة (`ق-٨١٤`).
 * - **`CLEARING`** وسيطُ الاستلام: حصّةُ ما فُوتر ولم يُستلم — تنتظر طبقتَها، فينقلها الاستلامُ إليها بلا مسّ `1250`.
 * - **`EXPENSE`** حسابُ فئة المستند: البندُ الخدميّ (والمستندُ بلا بنود حصّةً واحدة).
 * - **`COGS`** `5100`: بضاعةٌ أُعيدت إلى المورّد — خرجت بتكلفة طبقتها وفيها حصّتُها، فحصّةُ إشعارها تقابل ذلك.
 *
 * ## متى تكون الحصّةُ غيرَ صفر
 * مستندٌ حيّ **منسوبٌ إلى المعفى وحدَه** (`EXEMPT_ONLY`) **أو بلا فاتورةٍ ضريبيةٍ صحيحة** (`excludeFromVat` — `ق-١٣٦١`: «تدخل تكلفةَ
 * ما اشتُري عند الشراء، كالمنسوب إلى المعفى … فهي غيرُ مستردّة، والمعاييرُ لا تفرّق بسبب عدم الاسترداد») بضريبة، **ومتتبَّعٌ**
 * (`nonDeductibleTracked` — ما سبق البناء يُعدّ ولا يُحوَّل). ⚖️ **والمشتركُ (`MIXED`) بعد إقفال فترته** (`ق-١٣٦٠`): غيرُ القابل منه
 * (`ضريبة × (1 − النسبة)`) بنسبة الإقفال الحيّ أو التسوية السنوية الحيّة (`mixedRatioAt`) — **وقبل الإقفال صفرٌ** يبقى في `1250`
 * ويعلنه الإقرار. والإلغاءُ يجعل الجوابَ صفراً فيُعاد كلُّ ما وُضع.
 *
 * ## توزيعُ ضريبة المستند على بنوده
 * بصافي كلِّ بندٍ بالعملة الأساسية (`qty × price × rate` مدوَّراً — كـ`purchaseLineBase`)، والأخيرُ يحمل بقيّةَ التدوير فلا
 * تبقى هللة. وحصّةُ سطرٍ مخزنيّ على طبقاته بنسبة ما استُلم في كلٍّ، **وحين يكتمل استلامُه يحمل الأخيرُ البقيّة**.
 *
 * **على مستوى المنشأة بحقّها**: مستندٌ بعينه تُقرأ حركاتُه وطبقاتُه بمعرّفاته لا بفرع القارئ — فالحصّةُ تتبع البضاعةَ
 * حيث استُلمت، وقراءةٌ مقصورةٌ على فرعٍ تُسقط طبقةً فتُعيد حصّتَها إلى الوسيط وهي على الرفّ.
 *
 * ⚠️ **وحدودُها معلَنة**: (١) الأصلُ الثابت لا فئةَ شراءٍ له ولا وحدةَ أصول — فحصّتُه تذهب إلى حساب فئة المستند كأيّ بندٍ
 * خدميّ حتى تُبنى الأصول (`م٧`). (٢) ~~حدثٌ لاحق على طبقةٍ خرج منها تحويلٌ أو إتلاف يعدّها «مستهلَكة»~~ — أُصلح (`ق-١٣٦٤`):
 * حصّةُ الخارج تُقسَم على مخارجه.
 */
type Tx = Prisma.TransactionClient;

export interface ReconcileNonDeductibleArgs {
  date: Date;
  trigger: NonDeductibleVatTrigger;
  /** ⚖️ `ق-١٣٦٠` حدثُ الإقفال (أو عكسُه أو التسويةُ السنوية) الذي أطلق الترحيل — يُختم على الحدث. */
  vatReturnClosingId?: string;
  /** استلامٌ يُعكس الآن — طبقاتُه تُعامَل كأنها خرجت، فتعود حصّتُها إلى الوسيط **قبل** أن تخرج البضاعة بتكلفتها. */
  excludeReceiptId?: string;
  /** يُلحق بالمذكّرة — رقمُ الاستلام مثلاً. */
  labelSuffix?: string;
}

interface Target {
  purchaseLineId: string | null;
  placement: NonDeductibleVatPlacement;
  layerId: string | null;
  amount: number;
  /** للطبقة: الوحداتُ التي تقع عليها الحصّة — كلُّ ما استُلم فيها لحصّة الشراء، وكمّيةُ الإشعار لإشعار السعر. */
  unitsAffected?: number;
}

const keyOf = (t: { purchaseLineId: string | null; placement: string; layerId: string | null }) => `${t.purchaseLineId ?? '-'}|${t.placement}|${t.layerId ?? '-'}`;

/** حصصٌ بالوزن مدوَّرةً هللةً، والأخيرُ يحمل البقيّة — فيساوي المجموعُ الكلَّ بلا هللةٍ عالقة. */
export function allocateByWeight(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((t, w) => t + w, 0);
  const effective = sum > 0 ? weights : weights.map(() => 1);
  const effectiveSum = sum > 0 ? sum : weights.length;
  const out: number[] = [];
  let allocated = 0;
  for (let i = 0; i < effective.length; i++) {
    const share = i === effective.length - 1 ? round2(total - allocated) : round2((total * effective[i]) / effectiveSum);
    out.push(share);
    allocated = round2(allocated + share);
  }
  return out;
}

/**
 * طبقاتُ استلامٍ حيّة لسطر شراء — بترتيب الاقتناء، وبلا طبقات استلامٍ يُعكس الآن.
 *
 * **على مستوى المنشأة بحقّها**: حركاتُ استلام سطرٍ بعينه تُقرأ بمعرّفه لا بفرع القارئ — فالحصّةُ تتبع البضاعةَ حيث
 * استُلمت، وقراءةٌ مقصورةٌ على فرعٍ تُسقط طبقةً فتُعيد حصّتَها إلى الوسيط وهي على الرفّ.
 */
async function liveLayersOf(tx: Tx, purchaseLineId: string, excludeReceiptId?: string) {
  const movements = await tx.stockMovement.findMany({
    where: {
      purchaseLineId,
      type: 'IN',
      origin: 'RECEIPT',
      OR: [{ goodsReceiptLineId: null }, { goodsReceiptLine: { goodsReceipt: { voidedAt: null } } }],
    },
    select: {
      goodsReceiptLine: { select: { goodsReceiptId: true } },
      layers: { select: { id: true, qtyReceived: true, acquiredAt: true, createdAt: true } },
    },
  });
  return movements
    .filter((m) => !excludeReceiptId || m.goodsReceiptLine?.goodsReceiptId !== excludeReceiptId)
    .flatMap((m) => m.layers)
    .sort((a, b) => a.acquiredAt.getTime() - b.acquiredAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
    .map((l) => ({ id: l.id, qtyReceived: Number(l.qtyReceived) }));
}

/** ما يجب أن يكون في كلِّ موضعٍ الآن — انظر رأسَ الملفّ. */
async function targetsFor(tx: Tx, doc: NonNullable<Awaited<ReturnType<typeof loadDoc>>>, excludeReceiptId?: string): Promise<Target[]> {
  // والمستندُ مرحَّلٌ (`journalEntryId`) — ما لم يُرحَّل لم تدخل ضريبتُه `1250` أصلاً، فلا يُخرَج منها ما لم يدخل.
  // ⚖️ ق-١٣٦١ — **والضريبةُ بلا فاتورةٍ صحيحة كالمنسوب إلى المعفى**: غيرُ مستردّة، «والمعاييرُ لا تفرّق بسبب عدم الاسترداد».
  const nonRecoverable = doc.inputVatUse === 'EXEMPT_ONLY' || doc.excludeFromVat;
  // ⚖️ ق-١٣٦٠ — **والمشتركُ بعد إقفال فترته**: غيرُ القابل منه (`ضريبة × (1 − النسبة)`) بنسبة الإقفال الحيّ لفترته أو بنسبة التسوية
  // السنوية الحيّة لسنته — وقبل الإقفال صفرٌ (يبقى في 1250 ويعلنه الإقرار). ⛔ ولا نسبةَ تُقرأ من علَم «قُدِّم».
  const mixed = !nonRecoverable && (doc.inputVatUse === 'MIXED' || doc.inputVatUse === 'LEGACY_UNASSIGNED');
  const active = doc.voidedAt === null && doc.journalEntryId !== null && doc.nonDeductibleTracked && (nonRecoverable || mixed) && !doc.exempt && Number(doc.baseTaxAmount) > 0;
  if (!active) return [];
  let tax = round2(Number(doc.baseTaxAmount));
  if (mixed) {
    const ratio = await mixedRatioAt(tx, doc.date);
    if (ratio === null) return [];
    tax = round2(tax * (1 - ratio));
    if (tax === 0) return [];
  }
  // مستندٌ بلا بنود: ضريبتُه كلُّها حصّةٌ واحدة على حساب فئته.
  if (doc.lines.length === 0) return [{ purchaseLineId: null, placement: 'EXPENSE', layerId: null, amount: tax }];

  const rate = Number(doc.exchangeRate);
  const shares = allocateByWeight(
    tax,
    doc.lines.map((l) => round2(Number(l.quantity) * Number(l.unitPrice) * rate)),
  );
  const out: Target[] = [];

  if (doc.docType === 'PURCHASE') {
    for (let i = 0; i < doc.lines.length; i++) {
      const line = doc.lines[i];
      const share = shares[i];
      if (!line.productId) {
        out.push({ purchaseLineId: line.id, placement: 'EXPENSE', layerId: null, amount: share });
        continue;
      }
      const lineQty = Number(line.quantity);
      const layers = await liveLayersOf(tx, line.id, excludeReceiptId);
      const received = roundTo(layers.reduce((t, l) => t + l.qtyReceived, 0), 'DERIVED_QUANTITY');
      const complete = roundTo(lineQty - received, 'DERIVED_QUANTITY') <= 0;
      let placed = 0;
      layers.forEach((layer, k) => {
        const amount = complete && k === layers.length - 1 ? round2(share - placed) : lineQty > 0 ? round2((share * layer.qtyReceived) / lineQty) : 0;
        placed = round2(placed + amount);
        out.push({ purchaseLineId: line.id, placement: 'LAYER', layerId: layer.id, amount, unitsAffected: layer.qtyReceived });
      });
      out.push({ purchaseLineId: line.id, placement: 'CLEARING', layerId: null, amount: round2(share - placed) });
    }
    return out;
  }

  // إشعارُ المورّد: الدائنُ يُنقص التكلفة (حصّتُه سالبة) والمدينُ يزيدها — وموضعُ كلِّ سطرٍ من سطر أصله.
  const sign = doc.docType === 'SUPPLIER_CREDIT_NOTE' ? -1 : 1;
  for (let i = 0; i < doc.lines.length; i++) {
    const line = doc.lines[i];
    const amount = round2(sign * shares[i]);
    const original = line.returnsPurchaseLineId
      ? await tx.purchaseLine.findUnique({ where: { id: line.returnsPurchaseLineId }, select: { id: true, productId: true } })
      : null;
    if (!original?.productId) {
      out.push({ purchaseLineId: line.id, placement: 'EXPENSE', layerId: null, amount });
      continue;
    }
    if (sign === -1 && line.goodsReturned) {
      out.push({ purchaseLineId: line.id, placement: 'COGS', layerId: null, amount });
      continue;
    }
    // إشعارُ سعرٍ على بندٍ مخزنيّ: على طبقة استلام الأصل الواحدة (الإشعارُ نفسُه يشترطها — `purchase-return.util`).
    const [layer] = await liveLayersOf(tx, original.id);
    if (!layer) {
      out.push({ purchaseLineId: line.id, placement: 'COGS', layerId: null, amount });
      continue;
    }
    out.push({ purchaseLineId: line.id, placement: 'LAYER', layerId: layer.id, amount, unitsAffected: Number(line.quantity) });
  }
  return out;
}

/**
 * ⚖️ `ق-١٣٦٠` — **نسبةُ المشترك النافذة على يوم مستند**: التسويةُ السنوية الحيّة لسنته أوّلاً (نسبةُ السنة الفعلية — م٥١/٧)، ثم إقفالُ
 * فترته الحيّ (نسبةُ الفترة) — و«الحيّ» ما لم يُعكس. **وبلاهما لا شيء**: الفترةُ لم تُقفل فالمشتركُ باقٍ في `1250`.
 */
export async function mixedRatioAt(tx: Tx, date: Date): Promise<number | null> {
  const live = { periodFrom: { lte: date }, periodTo: { gte: date }, reversedBy: { is: null } };
  const adjustment = await tx.vatReturnClosing.findFirst({ where: { kind: 'ANNUAL_ADJUSTMENT', ...live }, orderBy: { createdAt: 'desc' }, select: { ratio: true } });
  if (adjustment) return Number(adjustment.ratio);
  const closing = await tx.vatReturnClosing.findFirst({ where: { kind: 'CLOSING', ...live }, orderBy: { createdAt: 'desc' }, select: { ratio: true } });
  return closing ? Number(closing.ratio) : null;
}

function loadDoc(tx: Tx, purchaseId: string) {
  return tx.purchase.findUnique({
    where: { id: purchaseId },
    select: {
      id: true,
      no: true,
      date: true,
      docType: true,
      supplierId: true,
      branchId: true,
      categoryCode: true,
      inputVatUse: true,
      exempt: true,
      excludeFromVat: true,
      voidedAt: true,
      journalEntryId: true,
      nonDeductibleTracked: true,
      baseTaxAmount: true,
      exchangeRate: true,
      lines: {
        where: { supersededAt: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, productId: true, quantity: true, unitPrice: true, returnsPurchaseLineId: true, goodsReturned: true },
      },
    },
  });
}

/**
 * يُرحّل فرقَ ضريبة المدخلات غيرِ القابلة للخصم لمستندٍ واحد — ويعيد الحدثَ المكتوب أو `null` حين لا فرق.
 * تُنادى داخل معاملة المستند نفسِها، بعد كلِّ ما يغيّر الجواب — انظر رأسَ الملفّ.
 */
export async function reconcileNonDeductibleVat(tx: Tx, companyId: string, purchaseId: string, args: ReconcileNonDeductibleArgs) {
  const doc = await loadDoc(tx, purchaseId);
  if (!doc) return null;
  // مستندٌ لم يُتتبَّع قطّ لا أحداثَ له — والإلغاءُ لا يُنشئ ما لم يكن.
  const targets = await targetsFor(tx, doc, args.excludeReceiptId);

  const appliedRows = await tx.nonDeductibleVatEventLine.findMany({
    where: { event: { purchaseId: doc.id } },
    select: { purchaseLineId: true, placement: true, layerId: true, baseAmount: true },
  });
  const applied = new Map<string, number>();
  for (const r of appliedRows) applied.set(keyOf(r), round2((applied.get(keyOf(r)) ?? 0) + Number(r.baseAmount)));

  const wanted = new Map(targets.map((t) => [keyOf(t), t]));
  const keys = new Set([...wanted.keys(), ...applied.keys()]);

  type Written = {
    purchaseLineId: string | null;
    placement: NonDeductibleVatPlacement;
    layerId: string | null;
    baseAmount: number;
    baseInventory: number;
    baseCogs: number;
    qtyRemainingAt: number | null;
    unitCostBefore: number | null;
    unitCostAfter: number | null;
  };
  const written: Written[] = [];
  const nodes: CostShareNode[] = [];
  for (const key of keys) {
    const target = wanted.get(key);
    const delta = round2((target?.amount ?? 0) - (applied.get(key) ?? 0));
    if (delta === 0) continue;
    const [lineId, placement, layerId] = key.split('|');
    const base = { purchaseLineId: lineId === '-' ? null : lineId, placement: placement as NonDeductibleVatPlacement, layerId: layerId === '-' ? null : layerId };

    if (base.placement !== 'LAYER') {
      written.push({ ...base, baseAmount: delta, baseInventory: 0, baseCogs: base.placement === 'COGS' ? delta : 0, qtyRemainingAt: null, unitCostBefore: null, unitCostAfter: null });
      continue;
    }

    // الطبقة: الحكمُ نفسُه بلا نسخة — ما على الرفّ يتبعها، وما خرج منها على مخارجه في فترة الحدث (`ق-١٣٦٤`: البيعُ `5100` ·
    // الشطبُ `5800` · اليدويُّ `5810` · والمحوَّلُ يتبع إلى طبقة مقصِده).
    const layer = await tx.inventoryLayer.findUnique({ where: { id: base.layerId! }, select: { id: true, qtyReceived: true } });
    if (!layer) continue;
    const units = target?.unitsAffected ?? Number(layer.qtyReceived);
    const node = await raiseLayerCost(tx, {
      layerId: layer.id,
      unitsAffected: units,
      amount: delta,
      onConflict: (layerId) => new ConflictException(formatMessage(MSG.non_deductible_vat_layer_changed, { layerId })),
    });
    nodes.push(node);
    written.push({ ...base, baseAmount: delta, baseInventory: node.baseShelf, baseCogs: round2(delta - node.baseShelf), qtyRemainingAt: node.qtyRemainingAt, unitCostBefore: node.unitCostBefore, unitCostAfter: node.unitCostAfter });
  }
  if (written.length === 0) return null;

  const sum = (pick: (w: Written) => number) => round2(written.reduce((t, w) => t + pick(w), 0));
  // ما يُقيَّد: الرفوفُ كلُّها (الطبقةُ وما تبعها إلى المقصِد) · وما خرج بأنواعه · وموضعُ «المُعاد» (COGS) كما كان.
  const allocation = allocationOf(nodes);
  const layerTotal = sum((w) => (w.placement === 'LAYER' ? w.baseAmount : 0));
  const returnedCogs = sum((w) => (w.placement === 'COGS' ? w.baseAmount : 0));
  const baseInventory = allocation.shelf;
  const baseCogs = round2(layerTotal - allocation.shelf + returnedCogs);
  const baseExpense = sum((w) => (w.placement === 'EXPENSE' ? w.baseAmount : 0));
  const baseClearing = sum((w) => (w.placement === 'CLEARING' ? w.baseAmount : 0));
  const event = await tx.nonDeductibleVatEvent.create({
    data: {
      companyId,
      purchaseId: doc.id,
      trigger: args.trigger,
      date: args.date,
      vatReturnClosingId: args.vatReturnClosingId ?? null,
      baseAmount: round2(baseInventory + baseCogs + baseExpense + baseClearing),
      baseInventory,
      baseCogs,
      baseExpense,
      baseClearing,
      lines: { create: written.map((w) => ({ companyId, ...w })) },
    } as unknown as Prisma.NonDeductibleVatEventUncheckedCreateInput,
    select: { id: true },
  });
  await recordCostShares(tx, companyId, { event: 'NON_DEDUCTIBLE_VAT', nonDeductibleVatEventId: event.id }, nodes);
  const label = `${doc.docType === 'PURCHASE' ? 'فاتورة شراء' : 'إشعار مورّد'} ${doc.no}${args.labelSuffix ? ` — ${args.labelSuffix}` : ''}`;
  const entry = await postNonDeductibleVatEntry(tx, companyId, {
    supplierId: doc.supplierId,
    branchId: doc.branchId,
    docLabel: label,
    categoryCode: doc.categoryCode,
    date: args.date,
    baseInventory,
    // ⚖️ ق-١٣٦٤ ما خرج من الطبقات مقسوماً: المبيعُ والمُعادُ إلى المورّد `5100` · المشطوبُ `5800` · المُخرَجُ يدوياً `5810`.
    baseCogs: round2(allocation.cogs + returnedCogs),
    baseWriteOff: allocation.writeOff,
    baseVariance: allocation.variance,
    baseExpense,
    baseClearing,
  });
  if (entry) await tx.nonDeductibleVatEvent.update({ where: { id: event.id }, data: { journalEntryId: entry.id } });
  return { id: event.id, baseInventory, baseCogs, baseExpense, baseClearing };
}
