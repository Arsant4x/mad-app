import { IsBoolean, IsEmail, IsOptional, IsString, Matches, MinLength, ValidateIf } from 'class-validator';
import { MSG } from '../../common/i18n/messages';

export class UpdateCompanyProfileDto {
  /**
   * ⚠️ **اختياريٌّ في الإرسال، ممنوعٌ تفريغه حين يُرسَل** (`ق-١٤٦`).
   *
   * كان **إلزامياً** على مسارٍ اسمه `PATCH` — فطلبٌ يغيّر الهاتف وحده يُرَدّ
   * `400` بلا سببٍ مفهوم، **ويُجبَر العميل على إعادة إرسال الاسم في كل حفظ**.
   * وقِيس (2026-09-04): **من ٣٣ نوع `DTO` على مسارات `PATCH` كان هذا المخالف
   * الوحيد** — والثلاثة الأخرى بحقولٍ إلزامية **أوامرُ حقلُها هو الأمر نفسه**
   * (`archived` · `confirmed` · `to`).
   *
   * **والحماية الحقيقية بقيت**: `MinLength(1)` يمنع تفريغه بـ`''`، فالاسم
   * **لا يُمحى** — وهو ما كان الإلزام يُظنّ أنه يحميه.
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  legalName?: string;

  /// 15 digits, must start and end with '3' (the Saudi VAT number format).
  /// @ValidateIf skips the @Matches check for '' (treated as "clear the
  /// field") and for omitted values (handled by @IsOptional) — only a
  /// genuinely non-empty value gets format-checked.
  @IsOptional()
  @ValidateIf((o) => !!o.vatNumber)
  @Matches(/^3\d{13}3$/, { message: MSG.vat_number_invalid })
  vatNumber?: string;

  @IsOptional()
  @ValidateIf((o) => !!o.crNumber)
  @Matches(/^\d{10}$/, { message: MSG.cr_number_invalid })
  crNumber?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @ValidateIf((o) => !!o.email)
  @IsEmail({}, { message: MSG.email_invalid })
  email?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  address?: string;

  /// The address again, in the parts ZATCA's cac:PostalAddress requires. Free
  /// text apart from the postal code, which the authority expects as five
  /// digits — a merchant with none is better served by an empty field than by
  /// a rejected invoice, hence @ValidateIf rather than a hard requirement.
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

  @IsOptional()
  @ValidateIf((o) => !!o.postalCode)
  @Matches(/^\d{5}$/, { message: MSG.postal_code_invalid })
  postalCode?: string;

  /// الرقم الإضافي أربع خانات رسمياً — يُتحقَّق كما يُتحقَّق الرمز البريدي:
  /// عند كتابته فقط، فالتاجر بلا رقم إضافي أولى بحقلٍ فارغ من فاتورة مرفوضة.
  @IsOptional()
  @ValidateIf((o) => !!o.additionalNumber)
  @Matches(/^\d{4}$/, { message: MSG.additional_number_invalid })
  additionalNumber?: string;

  /// رقم الوحدة (شقة/مكتب) — نص حر: تختلف صيغته بين المباني.
  @IsOptional()
  @IsString()
  unitNumber?: string;

  /// Storage key returned by `POST /files` for the uploaded logo. Sending ''
  /// clears the logo (and deletes the stored object); the service verifies the
  /// key is under this company's own prefix before saving it.
  @IsOptional()
  @IsString()
  logoFileKey?: string;
  /// Freezes properties/contracts company-wide (gap-analysis §1).
  @IsOptional()
  @IsBoolean()
  masterDataLocked?: boolean;

  /// «يُشترط شخصان» على شطب المخزون — **مطفأٌ افتراضياً** (`ق-١٤٣`): حين
  /// يُفعَّل، من سجّل الواقعة لا يعتمدها ولو ملك `review`.
  @IsOptional()
  @IsBoolean()
  writeOffRequiresTwoPersons?: boolean;
}
