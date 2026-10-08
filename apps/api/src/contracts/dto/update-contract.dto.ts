import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { MSG } from '../../common/i18n/messages';
import { CONTRACT_CLASSIFICATIONS, CONTRACT_LESSORS, CONTRACT_VAT_INCLUSIONS, EXEMPT_SHARE_MAX, EXEMPT_SHARE_MIN, FURNISHED_OPTIONS, OWNER_VAT_NUMBER_PATTERN } from './create-contract.dto';

/** Deliberately narrow: unit/value/dates/cycle can't be changed after
 * creation (that would require reconciling already-generated installments)
 * — only descriptive fields. Cancellation is its own endpoint. */
export class UpdateContractDto {
  /**
   * **تغييرُ الطرف** — بمعرّفه، **وقبل أوّل ترحيلٍ فقط** (`ق-١٠٢٨`/③): بعده ذمّةٌ وقيودٌ نُسبت إليه،
   * والخدمةُ ترفض وتسمّي المخرج (إنهاءُ العقد وعقدٌ جديد). أمّا `tenant`/`phone` فمشتقّان من
   * العميل لا مُدخَلان — تصحيحُ اسمٍ يقع في بطاقة العميل ويصل عقودَه.
   */
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  services?: string;

  @IsOptional()
  @IsIn(FURNISHED_OPTIONS)
  furnished?: (typeof FURNISHED_OPTIONS)[number];

  @IsOptional()
  @IsString()
  ejarNo?: string;

  /** ⚖️ رقمُ هويّة المستأجر (السؤال ٩٤٨ · الخيار «ب» · توجيه ٢٨٦) — يُشفَّر من جديد بصفّه، و`''` أو `null` يمحوه. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  tenantIdNumber?: string | null;

  /**
   * التصنيفُ وشمولُ الضريبة — اختياريان هنا **لعقدٍ مصنَّف**، **وإلزاميان لعقدٍ قديم**:
   * أوّلُ تعديلٍ لعقدٍ سبق الهجرة يوجب إعلانَهما (`ق-٨٩٨` — «يُنقص بيدٍ عند لمس العقد»)،
   * والخدمةُ ترفض التعديلَ بدونهما. والتعدادُ مغلقٌ بلا القيمة القديمة.
   */
  @IsOptional()
  @IsIn(CONTRACT_CLASSIFICATIONS)
  classification?: (typeof CONTRACT_CLASSIFICATIONS)[number];

  @IsOptional()
  @IsIn(CONTRACT_VAT_INCLUSIONS)
  vatInclusion?: (typeof CONTRACT_VAT_INCLUSIONS)[number];

  /** ⚖️ نسبةُ المختلط وأساسُها (السؤال ٤١٢ · `ق-١٦٠٠`): تُعلَن مع «مختلط» وتُمحى مع غيره — وتسري على ما يُستحقّ بعدها كالتصنيف. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(EXEMPT_SHARE_MIN)
  @Max(EXEMPT_SHARE_MAX)
  exemptSharePercent?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  exemptShareBasis?: string;

  /**
   * ⚖️ من المؤجّر (السؤال ٥٧٧ · `ق-١٦٠٠`) — **إلزاميٌّ لعقدٍ على عقار تشغيلٍ سبق الحقل** قبل أيّ تعديل، ولا يُغيَّر بعد
   * قبضٍ أو استحقاق؛ واسمُ المالك ورقمُه يُصحَّحان متى شئت.
   */
  @IsOptional()
  @IsIn(CONTRACT_LESSORS)
  lessor?: (typeof CONTRACT_LESSORS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(200)
  ownerName?: string;

  @IsOptional()
  @ValidateIf((o: UpdateContractDto) => !!o.ownerVatNumber)
  @Matches(OWNER_VAT_NUMBER_PATTERN, { message: MSG.vat_number_invalid })
  ownerVatNumber?: string;
}
