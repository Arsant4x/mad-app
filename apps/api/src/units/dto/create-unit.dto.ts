import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateUnitDto {
  @IsString()
  @IsNotEmpty()
  propertyId!: string;

  @IsString()
  @IsNotEmpty()
  unitNo!: string;

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
  @Min(0)
  rentMonthly!: number;

  @IsOptional()
  @IsBoolean()
  underMaintenance?: boolean;

  /** وصف الغرف والمحتويات — نص حر يظهر في بطاقة الوحدة. */
  @IsOptional()
  @IsString()
  roomDetails?: string;
}
