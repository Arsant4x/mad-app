import { IsNumber, IsOptional, IsString, Matches, Min, ValidateIf } from 'class-validator';
import { MSG } from '../../common/i18n/messages';

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  name?: string;

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
}
