import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString, ValidateIf, ValidateNested } from 'class-validator';
import { CurrencyFieldsDto } from '../../common/currency/currency-fields.dto';

/** تخصيص جزء من الدفعة لفاتورة بعينها — بعملة الدفعة. */
export class AllocationDto {
  @IsString()
  invoiceId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;
}

/**
 * ④A1 (`ق-١٢٦٤`/② · `ق-١٢٦٥`/أ) — **فئةُ ما يُدفع مقدَّماً عنه**، بمفردات سطر المستند نفسِها (`S` · `Z` بسببه ·
 * `E` بسببه · `O` بسببٍ يُكتب): إيجارٌ سكنيٌّ معفى لا يُفوتَر بالنسبة الأساسية. **تُعلَن ولا تُفترض** — كان `S`
 * افتراضاً مكتوباً؛ والخادمُ يرفض دفعةً مقدَّمة بلا فئة، ويفحص السببَ من القائمة الواحدة (`resolveDeclaredLineTax`).
 */
export class PrepaymentTaxDto {
  @IsIn(['S', 'Z', 'E', 'O'])
  taxCategory!: 'S' | 'Z' | 'E' | 'O';

  @IsOptional()
  @IsString()
  taxExemptionReasonCode?: string;

  @IsOptional()
  @IsString()
  taxExemptionReason?: string;
}

export class CreatePaymentDto extends CurrencyFieldsDto {
  @IsString()
  customerId!: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsDateString()
  date!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  /**
   * `CARD` هي **الشبكة** (`ق-٣٢٠`): تُقيَّد على `1251` مدينو شبكة المدفوعات حتى يحوّلها المستحوذ — فلا بنكَ لها
   * (`⑦A2` تسويةُ الشبكة تُدخلها البنكَ صافيةً). كانت مقصورةً على بيع الكاشير، وفُتحت هنا لسند القبض اليدويّ
   * (`ق-١٢٦١` ج): تاجرٌ يُفوتر بالأجل ويقبض على جهاز البنك يسجّلها هنا.
   */
  @IsIn(['CASH', 'BANK', 'CARD'])
  method!: 'CASH' | 'BANK' | 'CARD';

  /** حساب البنك للتحويل، أو صندوق الفرع الذي استلم النقد — ولا يُختار مع الشبكة. */
  @IsOptional()
  @IsString()
  bankId?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** التخصيص لحظة التسجيل — اختياري: دفعة على الحساب تُخصَّص لاحقاً. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllocationDto)
  allocations?: AllocationDto[];

  /**
   * ④A1 (`ق-١٢٦١` ب) — **مصيرُ ما في السند فوق المخصَّص للفواتير**، ويُعلَن حين يفوق الفائضُ هللاتِ التدوير
   * (`UNALLOCATED_DECLARATION_MIN`):
   * - `PREPAYMENT`: مقبوضٌ قبل التوريد — تُصدَر له **فاتورةُ دفعةٍ مقدَّمة (386)** يومَ القبض بضريبتها
   *   (م٥٣(١)(أ)(٢) للكاملة · م٥٣(٧)(أ)(٢) للمبسّطة)، وتُطبَّق على فاتورة التوريد لاحقاً.
   * - `ON_ACCOUNT`: مبلغٌ يُخصَّص لاحقاً على **فواتيرَ مفتوحةٍ قائمة** تغطّيه — فليس مقبوضاً قبل توريد؛
   *   ويُرفض إن لم تغطِّه فواتيرُ العميل المفتوحة، لأنه حينها دفعةٌ مقدَّمة بالتعريف مهما سُمّي.
   * ⛔ لا افتراضَ صامتاً (`ق-٨٩٨`): فائضٌ بلا إعلانٍ يُرفض مسمّىً بمبلغه.
   */
  @IsOptional()
  @IsIn(['PREPAYMENT', 'ON_ACCOUNT'])
  unallocated?: 'PREPAYMENT' | 'ON_ACCOUNT';

  /** فئةُ الدفعة المقدَّمة — تُقرأ حين `unallocated = PREPAYMENT` وتُلزم في الخدمة باسمها. */
  @ValidateIf((o: CreatePaymentDto) => o.unallocated === 'PREPAYMENT')
  @ValidateNested()
  @Type(() => PrepaymentTaxDto)
  prepaymentTax?: PrepaymentTaxDto;
}

/** ④A1 — ما دون هذا من فائضٍ هللاتُ تدويرٍ تبقى على الحساب بلا إعلانٍ ولا مستند. */
export const UNALLOCATED_DECLARATION_MIN = 0.05;

/** إعادة توزيع دفعة قائمة — تحلّ محلّ تخصيصاتها كلها. */
export class AllocateDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllocationDto)
  allocations!: AllocationDto[];

  /**
   * **يومُ إعادة التوزيع بتقويم التاجر** (`YYYY-MM-DD`) — به يُؤرَّخ قيدُ فرق الذمّة حين يختلف سعرُ الفواتير
   * الجديدة عن القديمة (`ق-١٤٨٩`/B1)، ويخضع لقفل الفترات كأيِّ قيد. والغيابُ يؤرّخه بساعة الخادم كالعكس بلا
   * تاريخ (`ReversePaymentDto.date` · `ق-٧٣٦`) — **حدٌّ معلَنٌ لا تخمين**.
   */
  @IsOptional()
  @IsDateString()
  date?: string;
}

export class ReversePaymentDto {
  @IsOptional()
  @IsString()
  reason?: string;

  /**
   * **يومُ العكس بتقويم التاجر** (`YYYY-MM-DD`) — كما يُؤرَّخ كلُّ مستندٍ من العميل (`ق-٧٣٦`).
   *
   * كان العكسُ يُؤرَّخ بـ`new Date()` على الخادم (`UTC`)، فبين منتصف الليل والثالثة فجراً بتوقيت
   * المملكة يقع في **اليوم السابق** — وإن كان شهرُه مقفلاً رُفض العكسُ («الفترةُ مقفلة») على فعلٍ في
   * أوّل يومٍ من الشهر التالي. الغيابُ يُبقي السلوكَ القديم (عميلٌ أقدم) — **حدٌّ معلَنٌ لا تخمين**.
   */
  @IsOptional()
  @IsDateString()
  date?: string;
}

/**
 * سندُ ردٍّ لمرتجع (`SPEC 30.8`، قرار المالك 2026-09-03): **سندٌ مستقل مربوطٌ بالإشعار الدائن**،
 * لا عكسٌ لسند القبض — فالعكس يمحو واقعة، والدفتر وقائع لا حالات.
 *
 * القابل للردّ يحسبه الخادم: مجموع إشعارات الفاتورة ناقص ما يخصم متبقّيها غير المسدَّد
 * (**الخصم من غير المسدَّدة إلزاميّ**) ناقص ما رُدّ سابقاً. `amount` اختياري = القابل للردّ كلّه.
 */
export class RefundDto extends CurrencyFieldsDto {
  @IsString()
  creditNoteId!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @IsIn(['CASH', 'BANK'])
  method!: 'CASH' | 'BANK';

  /** حساب البنك للتحويل، أو صندوق الفرع الذي يخرج منه النقد. */
  @IsOptional()
  @IsString()
  bankId?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
