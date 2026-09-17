import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min, ValidateIf } from 'class-validator';
import { MSG } from '../../common/i18n/messages';

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  /**
   * ⚠️ **ويُفحص نمطه كما يُفحص رقم المنشأة**: `^3\d{13}3$`.
   *
   * كان `@IsString()` وحده — بينما رقم المنشأة مفحوصٌ منذ بُني. **والرقم هنا
   * أخطر**: وجودُه يجعل الفاتورة **قياسية** (`invoiceTypeFor`)، فرقمٌ مشوَّه
   * يُرسل مستنداً إلى مسار المقاصّة **ويُرَدّ من الهيئة** — بينما فحصٌ عند
   * الإدخال يقولها للتاجر **وهو ينظر إلى البطاقة**.
   *
   * و`ValidateIf` يترك الفراغ يمرّ: «بلا رقم» حالةٌ مشروعة (مشترٍ فرد).
   */
  @IsOptional()
  @ValidateIf((o: CreateCustomerDto) => !!o.vatNumber)
  @Matches(/^3\d{13}3$/, { message: MSG.vat_number_invalid })
  vatNumber?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  /**
   * العنوان الوطني — **اختياريّ هنا، إلزاميّ عند إصدار فاتورة قياسية**
   * (`BR-KSA-63`). فتاجرٌ يسجّل عميلاً اليوم ويكمل عنوانه غداً لا يُمنع.
   */
  @IsOptional()
  @IsString()
  street?: string;

  @IsOptional()
  @IsString()
  buildingNumber?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  city?: string;

  /** خمس منازل — نفس قيد الرمز البريدي على المنشأة. */
  @IsOptional()
  @ValidateIf((o: CreateCustomerDto) => !!o.postalCode)
  @Matches(/^\d{5}$/, { message: MSG.postal_code_invalid })
  postalCode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  /**
   * **الاسمُ المكرَّر تنبيهٌ لا قيد** (`ق-١٠٢٨`/⑤): عميلٌ حيٌّ (أو في السلة) بالاسم نفسِه يردّ `409`
   * «أهو نفسُه؟» حتى يؤكّد المُنشئ أنه شخصٌ آخر بهذا العلَم. ⛔ ولا يُميَّز بالهاتف — مفتاحٌ ضعيفٌ آخر.
   */
  @IsOptional()
  @IsBoolean()
  allowSameName?: boolean;
}
