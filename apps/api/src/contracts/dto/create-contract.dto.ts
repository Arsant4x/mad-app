import { CurrencyFieldsDto } from '../../common/currency/currency-fields.dto';
import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export const CONTRACT_CYCLES = ['monthly', 'quarterly', 'semiannual', 'annual'] as const;
export const FURNISHED_OPTIONS = ['unfurnished', 'furnished', 'partial'] as const;

/**
 * ⭐ تصنيفُ العقد للضريبة — **مغلقٌ بلا القيمة القديمة** (`ق-٨٩١` · `ق-٨٩٨`):
 * `LEGACY_UNCLASSIFIED` للصفوف التي سبقت الهجرة وحدَها، ولا يقبلها الخادمُ لعقدٍ
 * جديدٍ أو تعديل — «قيمةٌ قديمة يقبلها الخادمُ لعقدٍ جديد افتراضٌ صامتٌ باسمٍ جديد».
 * والقاعدةُ تحبسها بقيد `CHECK` على `createdAt` طبقةً ثانية.
 */
export const CONTRACT_CLASSIFICATIONS = ['RESIDENTIAL', 'COMMERCIAL'] as const;
/** أشاملٌ `value` لضريبة القيمة المضافة أم لا — يُعلَن ولا يُفترض (`ق-٨٩٢`). */
export const CONTRACT_VAT_INCLUSIONS = ['INCLUSIVE', 'EXCLUSIVE'] as const;

export class CreateContractDto extends CurrencyFieldsDto {
  @IsString()
  @IsNotEmpty()
  unitId!: string;

  /** إلزاميٌّ بلا افتراض: عقدٌ بلا تصنيفٍ يُرفض — سكنيٌّ معفى أو تجاريٌّ خاضع. */
  @IsIn(CONTRACT_CLASSIFICATIONS)
  classification!: (typeof CONTRACT_CLASSIFICATIONS)[number];

  /** إلزاميٌّ كذلك: قيمةُ العقد شاملةٌ للضريبة أم غيرُ شاملة. */
  @IsIn(CONTRACT_VAT_INCLUSIONS)
  vatInclusion!: (typeof CONTRACT_VAT_INCLUSIONS)[number];

  /**
   * **المستأجرُ عميلٌ يُختار بمعرّفه** (`§6.3` · `ق-٤٩٧` · `ق-١٠٢٨`/①②) — لا اسمٌ يُبحث عنه ولا
   * هاتفٌ يُدهس؛ والمسوّدةُ تُربط كالعقد الحيّ. اسمُ العقد وهاتفُه يُشتقّان من بطاقة العميل.
   */
  @IsUUID()
  customerId!: string;

  @IsNumber()
  @Min(0.01)
  value!: number;

  @IsIn(CONTRACT_CYCLES)
  cycle!: (typeof CONTRACT_CYCLES)[number];

  @IsString()
  @IsNotEmpty()
  start!: string;

  @IsString()
  @IsNotEmpty()
  end!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deposit?: number;

  @IsOptional()
  @IsString()
  services?: string;

  @IsOptional()
  @IsIn(FURNISHED_OPTIONS)
  furnished?: (typeof FURNISHED_OPTIONS)[number];

  @IsOptional()
  @IsString()
  ejarNo?: string;

  /** Save as draft — skips the whole validation pipeline (unit-type lock,
   * overlap check, head-lease containment) and doesn't generate installments,
   * matching the mockup's "حفظ كمسودة" button. */
  @IsOptional()
  @IsBoolean()
  draft?: boolean;
}
