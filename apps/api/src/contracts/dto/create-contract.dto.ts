import { Type } from 'class-transformer';
import { CurrencyFieldsDto } from '../../common/currency/currency-fields.dto';
import { IsArray, IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { MSG } from '../../common/i18n/messages';
import { SAUDI_VAT_NUMBER_PATTERN } from '../../common/vat/vat-number';
import { ContractFeeDto } from './contract-fee.dto';

export const CONTRACT_CYCLES = ['monthly', 'quarterly', 'semiannual', 'annual'] as const;
export const FURNISHED_OPTIONS = ['unfurnished', 'furnished', 'partial'] as const;

/**
 * ⭐ تصنيفُ العقد للضريبة — **مغلقٌ بلا القيمة القديمة** (`ق-٨٩١` · `ق-٨٩٨`):
 * `LEGACY_UNCLASSIFIED` للصفوف التي سبقت الهجرة وحدَها، ولا يقبلها الخادمُ لعقدٍ
 * جديدٍ أو تعديل — «قيمةٌ قديمة يقبلها الخادمُ لعقدٍ جديد افتراضٌ صامتٌ باسمٍ جديد».
 * والقاعدةُ تحبسها بقيد `CHECK` على `createdAt` طبقةً ثانية.
 *
 * ⚖️ ومعهما (السؤالان ٥٩ و٤١٢ · `ق-١٦٠٠`): `SERVICED_LODGING` إيواءٌ مخدومٌ أو مؤقّت خاضع، و`MIXED` عقدٌ بجزأين بنسبةٍ معلَنة.
 */
export const CONTRACT_CLASSIFICATIONS = ['RESIDENTIAL', 'COMMERCIAL', 'SERVICED_LODGING', 'MIXED'] as const;
/** نصيبُ المعفى في المختلط: بين 0 و100 لا يشملهما — فالمعفى كلُّه سكنيٌّ والخاضعُ كلُّه تجاريّ. */
export const EXEMPT_SHARE_MIN = 0.01;
export const EXEMPT_SHARE_MAX = 99.99;
/** أشاملٌ `value` لضريبة القيمة المضافة أم لا — يُعلَن ولا يُفترض (`ق-٨٩٢`). */
export const CONTRACT_VAT_INCLUSIONS = ['INCLUSIVE', 'EXCLUSIVE'] as const;
/**
 * ⚖️ من المؤجّر (السؤال ٥٧٧ · `ق-١٦٠٠`) — **مغلقٌ بلا القيمة القديمة** كالتصنيف: `LEGACY_UNDECLARED` لعقدٍ على عقار تشغيلٍ
 * سبق الحقلَ وحدَه. وإلزامُه على عقار التشغيل في الخدمة (`lessorFieldsFor`) لأنه يتبع العقارَ لا الطلب.
 * ورقمُ المالك الضريبيّ يُفحص نمطُه كرقم العميل والمنشأة، والفراغُ يمرّ: السكنيُّ قد يؤجّره فردٌ غيرُ مسجَّل. والصيغةُ من الوحدة
 * السعودية لا حرفاً هنا (`ق-١٣٥٠`).
 */
export const CONTRACT_LESSORS = ['COMPANY', 'OWNER'] as const;
export const OWNER_VAT_NUMBER_PATTERN = SAUDI_VAT_NUMBER_PATTERN;

export class CreateContractDto extends CurrencyFieldsDto {
  @IsString()
  @IsNotEmpty()
  unitId!: string;

  /** إلزاميٌّ بلا افتراض: عقدٌ بلا تصنيفٍ يُرفض — سكنيٌّ معفى · تجاريٌّ خاضع · إيواءٌ مخدومٌ خاضع · مختلطٌ بنسبة. */
  @IsIn(CONTRACT_CLASSIFICATIONS)
  classification!: (typeof CONTRACT_CLASSIFICATIONS)[number];

  /** ⚖️ المختلطُ وحدَه: نصيبُ الجزء المعفى بالمئة — وإلزامُه للمختلط ومنعُه لغيره في الخدمة (`mixedShareFieldsFor`). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(EXEMPT_SHARE_MIN)
  @Max(EXEMPT_SHARE_MAX)
  exemptSharePercent?: number;

  /** وأساسُ النسبة كما يعلنه المؤجّر (المساحة · القيمةُ السوقية · …). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  exemptShareBasis?: string;

  /** إلزاميٌّ كذلك: قيمةُ العقد شاملةٌ للضريبة أم غيرُ شاملة. */
  @IsIn(CONTRACT_VAT_INCLUSIONS)
  vatInclusion!: (typeof CONTRACT_VAT_INCLUSIONS)[number];

  @IsOptional()
  @IsIn(CONTRACT_LESSORS)
  lessor?: (typeof CONTRACT_LESSORS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  ownerName?: string;

  @IsOptional()
  @ValidateIf((o: CreateContractDto) => !!o.ownerVatNumber)
  @Matches(OWNER_VAT_NUMBER_PATTERN, { message: MSG.vat_number_invalid })
  ownerVatNumber?: string;

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

  /**
   * ⚖️ **رقمُ هويّة المستأجر — اختياريّ، ويُشفَّر في التطبيق** (حكمُ صاحب المشروع على السؤال ٩٤٨، الخيار «ب»: كهويّة الموظف
   * `ق-١٣٤٥` · توجيه ٢٨٦). يُطبَّع بقاعدة المعرّفات (`normalizeIdentifier`) ويُكتب نصّاً مشفَّراً ببصمته، ولا يخرج إلا في التفصيل.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  tenantIdNumber?: string;

  /** ⚖️ بنودُ الرسوم فوق الإيجار (السؤالان ٤٩ و٤١٣ · `ق-١٦٠٠`) — كلٌّ يُطالَب مع كلِّ قسطٍ يحلّ بضريبته. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractFeeDto)
  fees?: ContractFeeDto[];

  /** Save as draft — skips the whole validation pipeline (unit-type lock,
   * overlap check, head-lease containment) and doesn't generate installments,
   * matching the mockup's "حفظ كمسودة" button. */
  @IsOptional()
  @IsBoolean()
  draft?: boolean;
}
