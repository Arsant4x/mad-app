import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateUnitDto {
  @IsOptional()
  @IsString()
  floor?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsString()
  subtype?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  rentMonthly?: number;

  @IsOptional()
  @IsBoolean()
  underMaintenance?: boolean;

  /** وصف الغرف والمحتويات — نص حر يظهر في بطاقة الوحدة. */
  @IsOptional()
  @IsString()
  roomDetails?: string;
}
