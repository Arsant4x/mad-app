import { CurrencyFieldsDto } from '../../common/currency/currency-fields.dto';
import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export const CONTRACT_CYCLES = ['monthly', 'quarterly', 'semiannual', 'annual'] as const;
export const FURNISHED_OPTIONS = ['unfurnished', 'furnished', 'partial'] as const;

export class CreateContractDto extends CurrencyFieldsDto {
  @IsString()
  @IsNotEmpty()
  unitId!: string;

  @IsString()
  @IsNotEmpty()
  tenant!: string;

  @IsOptional()
  @IsString()
  phone?: string;

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
