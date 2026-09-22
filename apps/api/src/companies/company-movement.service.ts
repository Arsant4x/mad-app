import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantPrismaService } from '../common/tenant/tenant-prisma.service';

/**
 * معيارُ الحركة — **معتمدٌ بنصّه** (`ق-٥٤٦`):
 *
 * > ذاتُ حركة = صفٌّ في جدولٍ ترفض القاعدةُ حذفَه · أو مستندٌ مرقَّمٌ صدر · أو سطرُ دفترٍ
 * > (مخزون · بنك · وردية · عقد).
 *
 * **ويقرأ الأثرَ لا العدّاد**: سبعٌ وعشرون منشأةً لها صفُّ عدّادٍ في `document_sequences`
 * ومئةٌ لها فواتير — فالمستنداتُ تُعدّ في جداولها نفسِها.
 *
 * ثلاثةُ أصناف:
 * - **①** يُشتقّ من المخطّط: كلُّ نموذجٍ علاقتُه بالمنشأة `Restrict` — لا يُعدَّد بالعين
 *   (`ق-٥٤٥`)، فمن يضيف نموذجاً كهذا غداً يدخل المعيارَ بلا لمس هذا الملفّ.
 * - **②** المستنداتُ المرقَّمة: سلاسلُ `document-sequence` العشرُ في جداولها.
 * - **③** دفاترُ الحركة بلا سلسلة.
 *
 * ⚠️ **ويُقرأ تحت سياق المنشأة**: الجداولُ تحت `FORCE ROW LEVEL SECURITY`، وبلا
 * `app.company_id` تعود كلُّ العدّات صفراً **بلا خطأ ولا تحذير** (`ق-٢٦٢`) — فصفرٌ
 * بلا سياقٍ عمىً لا نظافة.
 *
 * **حدُّه المعلَن**: الصنفان ② و③ قائمتان مكتوبتان بحجّتهما — **وحارسُهما**
 * (`company-movement.spec.ts`) يُثبت أن كلَّ اسمٍ فيهما نموذجٌ في المخطّط يحمل
 * `companyId`، وأن كلَّ سلسلةٍ يستعملها الكودُ لها جدولٌ هنا.
 */
export type MovementClass = 'refused' | 'numbered' | 'ledger';

export interface MovementSource {
  model: Prisma.ModelName;
  label: string;
  cls: MovementClass;
}

/** ① كلُّ نموذجٍ علاقتُه بالمنشأة `Restrict` — مشتقٌّ من `DMMF` العميل المولَّد. */
export function refusedByDatabase(): Prisma.ModelName[] {
  return Prisma.dmmf.datamodel.models
    .filter((m) => m.fields.some((f) => f.kind === 'object' && f.type === 'Company' && f.relationOnDelete === 'Restrict'))
    .map((m) => m.name as Prisma.ModelName);
}

/** أسماءُ الصنف ① للرسالة — وما لم يُعرف يُعرَض باسمه الخام لا يُخفى. */
const REFUSED_LABELS: Partial<Record<Prisma.ModelName, string>> = {
  Task: 'مهامّ',
  TaskLog: 'سجلّ المهام',
  DelegationLog: 'سجلّ التفويض',
};

/** ② المستنداتُ المرقَّمة — كلُّ سلسلةٍ في جدولها (`SequenceSpec.kind`). */
export const NUMBERED_DOCUMENTS: ReadonlyArray<{ model: Prisma.ModelName; kinds: string[]; label: string }> = [
  // السلاسلُ كما يستعملها الكودُ فعلاً (الحارسُ يقرأها من المصدر) — لا كما يعدّدها تعليقُ المخطّط.
  { model: 'Invoice', kinds: ['INV'], label: 'فواتير' },
  { model: 'JournalEntry', kinds: ['JE'], label: 'قيود' },
  { model: 'Payment', kinds: ['RCV', 'REFUND'], label: 'سندات' },
  { model: 'SupplierPayment', kinds: ['PAY'], label: 'سندات صرف' },
  { model: 'Purchase', kinds: ['PUR'], label: 'مشتريات' },
  // ٢٥ الاستلامُ المستقلّ (ق-١١٣١): مستندُ وصول البضاعة — سلسلةٌ سنوية `GR-YYYY-NNNN`، وأثرُه حركةُ منشأة كالشراء.
  { model: 'GoodsReceipt', kinds: ['GR'], label: 'استلامات بضاعة' },
  { model: 'CashDeposit', kinds: ['CD'], label: 'إيداعات الأدراج' },
  { model: 'NetworkSettlement', kinds: ['NS'], label: 'تسويات الشبكة' },
  // ٣٠ إعلانُ الرصيد الافتتاحي للمخزون (ق-١١٧٩): مستندٌ مختومٌ بسلسلةٍ سنوية `SO-YYYY-NNNN`، وأثرُه حركةُ منشأة كالاستلام.
  { model: 'StockOpening', kinds: ['SO'], label: 'أرصدة افتتاحية للمخزون' },
  { model: 'InventoryWriteOff', kinds: ['WO'], label: 'إعدام مخزون' },
  { model: 'Quote', kinds: ['Q'], label: 'عروض أسعار' },
  { model: 'Contract', kinds: ['EJ'], label: 'عقود' },
];

/** ③ دفاترُ الحركة بلا سلسلة. */
export const LEDGER_LINES: ReadonlyArray<{ model: Prisma.ModelName; label: string }> = [
  { model: 'StockMovement', label: 'حركات مخزون' },
  { model: 'BankTransaction', label: 'حركات بنكية' },
  { model: 'PosShift', label: 'ورديات نقاط البيع' },
  { model: 'RentPayment', label: 'دفعات إيجار' },
  { model: 'Reservation', label: 'حجوزات' },
];

/** الأصنافُ الثلاثة مجتمعةً — ① مشتقٌّ ثم ② و③. */
export function movementSources(): MovementSource[] {
  return [
    ...refusedByDatabase().map((model) => ({ model, label: REFUSED_LABELS[model] ?? model, cls: 'refused' as const })),
    ...NUMBERED_DOCUMENTS.map(({ model, label }) => ({ model, label, cls: 'numbered' as const })),
    ...LEDGER_LINES.map(({ model, label }) => ({ model, label, cls: 'ledger' as const })),
  ];
}

/** مددُ الحفظ المقروءة (وثيقةُ الترخيص — سطرُ «مددُ الحفظ»): الدفاترُ ١٠ سنوات · والعقارُ ١١. */
export const RETENTION_YEARS = { books: 10, realEstate: 11 } as const;
/**
 * سجلّاتُ العقار — أجلُها `11`: العقدُ ودفعاتُه وحجوزاتُه (حركةُ المنشأة)، **والعقارُ والوحدةُ بذاتهما وما يشير
 * إليهما** (بلاغاتُ الصيانة والضمانات — `Cascade` على العقار) لأجل السلّة (`ق-١٢٧١`/أ): عقارٌ بلا وحدات
 * يُمحى نهائياً فتذهب بلاغاتُه وضماناتُه معه. والحارسُ في `company-movement.spec` يُثبت أن كلَّ اسمٍ هنا
 * إمّا العقارُ أو الوحدةُ أو نموذجٌ يشير إلى أحدهما — لا اسمَ مخترَع.
 */
export const REAL_ESTATE_MODELS: ReadonlySet<Prisma.ModelName> = new Set<Prisma.ModelName>([
  'Contract', 'RentPayment', 'Reservation', 'Property', 'Unit', 'MaintenanceRequest', 'Warranty',
]);

/**
 * أجلُ الحفظ الأدنى (`ق-٥٤٧`): «حتى {التاريخ} على الأقلّ» — أطولُ المدد المقروءة لصنف
 * المنشأة. **«على الأقلّ»** لأن مصدراً يقول ١٥ ولم يُحسَم (`ق-٥٣٩`) — فلا يُوعَد بمحوٍ أبكر.
 */
export function retentionDeadline(closedAt: Date, models: ReadonlyArray<string>): Date {
  const years = models.some((m) => REAL_ESTATE_MODELS.has(m as Prisma.ModelName)) ? RETENTION_YEARS.realEstate : RETENTION_YEARS.books;
  const until = new Date(closedAt);
  until.setFullYear(until.getFullYear() + years);
  return until;
}

export interface MovementReport {
  hasMovement: boolean;
  /** أسماءُ النماذج التي وُجد فيها أثر — للحكم (أجلُ الحفظ) وللسجل. */
  models: Prisma.ModelName[];
  /** أسماؤها للتاجر والمنصّة — تُكتب على قرار الطلب. */
  labels: string[];
}

const delegateOf = (model: Prisma.ModelName) => model.charAt(0).toLowerCase() + model.slice(1);

type Countable = Record<string, { count: (args: { where: { companyId: string } }) => Promise<number> }>;

@Injectable()
export class CompanyMovementService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /** تحت سياق المنشأة — فالصفرُ بلا سياقٍ عمى (`ق-٢٦٢`)، والصفرُ هنا حقيقة. */
  describe(companyId: string): Promise<MovementReport> {
    return this.tenantPrisma.runInTenantContext(companyId, async (tx) => {
      const found: MovementSource[] = [];
      for (const source of movementSources()) {
        const n = await (tx as unknown as Countable)[delegateOf(source.model)].count({ where: { companyId } });
        if (n > 0) found.push(source);
      }
      return { hasMovement: found.length > 0, models: found.map((s) => s.model), labels: found.map((s) => s.label) };
    });
  }
}
