import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min, ValidateIf } from 'class-validator';
import { MSG } from '../../common/i18n/messages';

/** صفاتُ المشتري التي يقبلها الإنشاء — القديمةُ غيرُ المعلَنة ليست منها (لا تُعطى لصفٍّ جديد). */
export const CUSTOMER_KINDS = ['NATURAL', 'ESTABLISHMENT', 'LEGAL_PERSON'] as const;
export type CustomerKindInput = (typeof CUSTOMER_KINDS)[number];

/** مخطّطاتُ المعرّف البديل (BR-KSA-14) — تُخزَّن كما هي، والقاعدةُ تقيّدها بالقائمة نفسِها. */
export const BUYER_ID_SCHEMES = ['TIN', 'CRN', 'MOM', 'MLS', '700', 'SAG', 'NAT', 'GCC', 'IQA', 'PAS', 'OTH'] as const;
export type BuyerIdSchemeInput = (typeof BUYER_ID_SCHEMES)[number];

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  /**
   * **صفةُ المشتري — إلزاميةٌ بلا افتراض** (ق-١٢٦١ أ — ②A1): تقرّر نوعَ الفاتورة (م٥٣): مؤسّسةٌ فردية أو شخصٌ
   * اعتباريّ ⟵ ضريبيةٌ كاملة ولو بلا رقم؛ طبيعيٌّ ⟵ مبسّطة. رقمٌ ضريبيّ مع أيِّ صفة ⟵ كاملة.
   */
  @IsIn(CUSTOMER_KINDS, { message: MSG.customer_kind_required })
  kind!: CustomerKindInput;

  /** معرّفٌ بديل لمشترٍ غيرِ مسجَّل (BR-KSA-14): المخطّطُ والرقمُ معاً أو لا شيء. */
  @IsOptional()
  @IsIn(BUYER_ID_SCHEMES, { message: MSG.customer_other_id_scheme_invalid })
  otherIdScheme?: BuyerIdSchemeInput;

  @IsOptional()
  @ValidateIf((o: CreateCustomerDto) => !!o.otherId)
  @Matches(/^[A-Za-z0-9]+$/, { message: MSG.customer_other_id_invalid })
  otherId?: string;

  /** رمزُ البلد ISO 3166-1 alpha-2 (BT-55) — الغيابُ يعني `SA`. */
  @IsOptional()
  @ValidateIf((o: CreateCustomerDto) => !!o.country)
  @Matches(/^[A-Z]{2}$/, { message: MSG.customer_country_invalid })
  country?: string;

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
