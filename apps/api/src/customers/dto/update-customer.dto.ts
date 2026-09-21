import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Matches, Min, ValidateIf } from 'class-validator';
import { MSG } from '../../common/i18n/messages';
import { BUYER_ID_SCHEMES, CUSTOMER_KINDS, type BuyerIdSchemeInput, type CustomerKindInput } from './create-customer.dto';

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  name?: string;

  /** إعلانُ الصفة أو تغييرُها (②A1) — القديمُ غيرُ المعلَن يُعلَن من هنا؛ ولا يُعاد إلى «غير معلَن». */
  @IsOptional()
  @IsIn(CUSTOMER_KINDS, { message: MSG.customer_kind_required })
  kind?: CustomerKindInput;

  /** المعرّفُ البديل — `''` أو `null` يمسحان الاثنين معاً. */
  @IsOptional()
  @ValidateIf((o: UpdateCustomerDto) => !!o.otherIdScheme)
  @IsIn(BUYER_ID_SCHEMES, { message: MSG.customer_other_id_scheme_invalid })
  otherIdScheme?: BuyerIdSchemeInput | null;

  @IsOptional()
  @ValidateIf((o: UpdateCustomerDto) => !!o.otherId)
  @Matches(/^[A-Za-z0-9]+$/, { message: MSG.customer_other_id_invalid })
  otherId?: string | null;

  @IsOptional()
  @ValidateIf((o: UpdateCustomerDto) => !!o.country)
  @Matches(/^[A-Z]{2}$/, { message: MSG.customer_country_invalid })
  country?: string;

  /** نفس فحص الإنشاء — **وإلا صار التعديل باباً خلفياً لرقمٍ مشوَّه**. */
  @IsOptional()
  @ValidateIf((o: UpdateCustomerDto) => !!o.vatNumber)
  @Matches(/^3\d{13}3$/, { message: MSG.vat_number_invalid })
  vatNumber?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  /** العنوان الوطني — انظر `CreateCustomerDto`. */
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
  @ValidateIf((o: UpdateCustomerDto) => !!o.postalCode)
  @Matches(/^\d{5}$/, { message: MSG.postal_code_invalid })
  postalCode?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  /** كما الإنشاء — إعادةُ التسمية إلى اسمٍ قائم تنبيهٌ يُؤكَّد (`ق-١٠٢٨`/⑤). */
  @IsOptional()
  @IsBoolean()
  allowSameName?: boolean;
}
