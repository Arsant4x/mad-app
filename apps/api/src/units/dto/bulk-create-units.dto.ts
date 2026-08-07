import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';

/** إنشاء وحدات بالجملة (§16): بادئة + عدد — «A-» و12 تنتج A-1 حتى A-12. */
export class BulkCreateUnitsDto {
  @IsString()
  @IsNotEmpty()
  propertyId!: string;

  @IsString()
  @IsNotEmpty()
  prefix!: string;

  @IsInt()
  @Min(1)
  @Max(500)
  count!: number;

  /** رقم البداية — افتراضياً 1. */
  @IsOptional()
  @IsInt()
  @Min(1)
  startAt?: number;

  @IsOptional()
  @IsString()
  floor?: string;

  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsOptional()
  @IsString()
  subtype?: string;

  @IsNumber()
  @IsPositive()
  rentMonthly!: number;
}
