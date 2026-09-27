import { Prisma } from '@mad-app/db';
import { LEDGER_LINES, NUMBERED_DOCUMENTS, REAL_ESTATE_MODELS, retentionDeadline } from '../companies/company-movement.service';

/**
 * ما تحت الحفظ النظاميّ لا يُمحى بالسلّة (`ق-١٢٧١`/أ).
 *
 * الصفُّ في السلّة بياناتٌ رئيسية (عميل · صنف · عقار …) — وما يجعله «تحت الحفظ» ليس هو نفسُه
 * بل **ما يشير إليه**: فاتورةٌ باسم العميل، حركةُ مخزونٍ على الصنف، بلاغُ صيانةٍ على العقار.
 * فمحوُه النهائيُّ إمّا ترفضه القاعدة (`Restrict`) فيبقى صامتاً إلى الأبد، أو **يجرّ معه سجلاتٍ**
 * (`Cascade` — بلاغاتُ الصيانة والضمانات على العقار) — وهذه هي المخالفة: سجلٌّ يُحفظ إحدى عشرةَ
 * سنةً يُمحى بعد ثلاثين يوماً لأن أباه دخل السلّة.
 *
 * **المرجعُ يُشتقّ من `DMMF` لا من قائمة**: كلُّ علاقةٍ تشير إلى نموذج السلّة بحذفٍ `Restrict` أو
 * `Cascade` مرجعٌ حافظ؛ و`SetNull` لا يحفظ (المؤشّرُ يُفرَغ ولا يضيع سجلّ — فرعٌ يشير إلى مستودع).
 * فمن يضيف نموذجاً يشير إلى العميل غداً يدخل الحفظَ بلا لمس هذا الملفّ (`ق-٥٤٥`).
 *
 * **والأجلُ من المدد المقروءة** (`retentionDeadline` — الدفاترُ `10` والعقارُ `11`)، مقيساً من
 * تاريخ الحذف **«على الأقلّ»** كما في إغلاق المنشأة: تاريخُ الحذف يلي كلَّ سجلٍّ يشير إليه، فلا يُوعَد
 * بمحوٍ أبكر من أيّ سجلّ. والعقارُ والوحدةُ عقارٌ بذاتهما — أجلُهما `11` ولو لم يُشر إليهما عقد.
 */

export interface RetainingReference {
  model: Prisma.ModelName;
  field: string;
  onDelete: 'Restrict' | 'Cascade';
}

/** المراجعُ الحافظة لنموذجٍ — من المخطّط المولَّد، بلا تكرار (العلاقةُ المركّبة `_tenant` تُدمج مع بسيطتها). */
export function retainingReferencesOf(target: Prisma.ModelName): RetainingReference[] {
  const seen = new Set<string>();
  const refs: RetainingReference[] = [];
  for (const m of Prisma.dmmf.datamodel.models) {
    for (const f of m.fields) {
      if (f.kind !== 'object' || f.type !== target || !f.relationFromFields?.length) continue;
      const fks = f.relationFromFields.filter((x) => x !== 'companyId');
      if (fks.length !== 1) continue;
      const key = `${m.name}.${fks[0]}`;
      if (seen.has(key)) continue;
      // سلوكُ الحذف يُقرأ من العلاقة **البسيطة** (`_tenant` المركّبة تحمل `NoAction` والبسيطةُ تحمل الحكم — `ق-١٢٥٢`)؛
      // وما لم يُصرَّح به يأخذ افتراضَ Prisma: المطلوبةُ `Restrict` والاختياريةُ `SetNull` — مقيسٌ لا مفترَض
      // (`Invoice.customerId` · `Purchase.supplierId` · `Quote.customerId` بلا تصريح، وكلُّها مطلوبة).
      const simple = m.fields.find((g) => g.kind === 'object' && g.type === target && g.relationFromFields?.length === 1 && g.relationFromFields[0] === fks[0]) ?? f;
      const effective = simple.relationOnDelete ?? (simple.isRequired ? 'Restrict' : 'SetNull');
      if (effective !== 'Restrict' && effective !== 'Cascade') continue;
      seen.add(key);
      refs.push({ model: m.name as Prisma.ModelName, field: fks[0], onDelete: effective });
    }
  }
  return refs;
}

/** أسماءُ المراجع للتاجر — وما لم يُعرف يُعرَض باسمه الخام لا يُخفى (كما في معيار الحركة). */
const REFERENCE_LABELS: Partial<Record<Prisma.ModelName, string>> = {
  ...Object.fromEntries(NUMBERED_DOCUMENTS.map((d) => [d.model, d.label])),
  ...Object.fromEntries(LEDGER_LINES.map((l) => [l.model, l.label])),
  JournalLine: 'سطور قيود',
  InvoiceLine: 'بنود فواتير',
  PurchaseLine: 'بنود مشتريات',
  QuoteLine: 'بنود عروض أسعار',
  InventoryLayer: 'طبقات تكلفة',
  StockBatch: 'دفعات مخزون',
  Unit: 'وحدات',
  MaintenanceRequest: 'بلاغات صيانة',
  Warranty: 'ضمانات',
  LeaveRequest: 'طلبات إجازة',
  AttendanceRecord: 'سجلّات حضور',
};

export function referenceLabel(model: Prisma.ModelName): string {
  return REFERENCE_LABELS[model] ?? model;
}

export interface RowRetention {
  /** الأجلُ الذي لا يُمحى قبله — `null` إن لم يشر إليه سجلّ. */
  retainedUntil: Date | null;
  /** أسماءُ ما يشير إليه — للتاجر وللرسالة. */
  retainedBy: string[];
}

type CountingDelegate = {
  groupBy: (args: unknown) => Promise<Array<Record<string, unknown> & { _count: { _all: number } }>>;
};

/**
 * حفظُ دفعةٍ من صفوف السلّة لنموذجٍ واحد — استعلامٌ مجمَّع لكلِّ مرجعٍ لا لكلِّ صفّ
 * (تسعةُ نماذج × مراجعُها ≈ أربعون استعلاماً لقائمةٍ كاملة، لا آلافاً).
 * يُقرأ **داخل سياق المنشأة**: الجداولُ تحت `FORCE`، وخارجَه يعود كلُّ عدٍّ صفراً بلا خطأ (`ق-٢٦٢`).
 */
export async function retentionOf(
  tx: Prisma.TransactionClient,
  target: Prisma.ModelName,
  rows: ReadonlyArray<{ id: string; deletedAt: Date }>,
): Promise<Map<string, RowRetention>> {
  const out = new Map<string, RowRetention>();
  if (rows.length === 0) return out;
  const ids = rows.map((r) => r.id);
  const byId = new Map<string, Set<Prisma.ModelName>>();
  for (const ref of retainingReferencesOf(target)) {
    const delegate = (tx as unknown as Record<string, CountingDelegate>)[ref.model.charAt(0).toLowerCase() + ref.model.slice(1)];
    const groups = await delegate.groupBy({ by: [ref.field], where: { [ref.field]: { in: ids } }, _count: { _all: true } });
    for (const g of groups) {
      if (!g._count._all) continue;
      const id = g[ref.field] as string;
      if (!byId.has(id)) byId.set(id, new Set());
      byId.get(id)!.add(ref.model);
    }
  }
  const selfIsRealEstate = REAL_ESTATE_MODELS.has(target);
  for (const row of rows) {
    const models = byId.get(row.id);
    if (!models) { out.set(row.id, { retainedUntil: null, retainedBy: [] }); continue; }
    const list = [...models];
    out.set(row.id, {
      retainedUntil: retentionDeadline(row.deletedAt, selfIsRealEstate ? [...list, target] : list),
      retainedBy: list.map(referenceLabel),
    });
  }
  return out;
}
