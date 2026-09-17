import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { CONTRACT_CLASSIFICATIONS, CONTRACT_VAT_INCLUSIONS, FURNISHED_OPTIONS } from './create-contract.dto';

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
}
