import { IsIn, IsInt, IsLatitude, IsLongitude, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export const OWNERSHIP_TYPES = ['owned', 'leased', 'managed'] as const;
export const ACTIVITY_TYPES = ['residential', 'shop', 'showroom', 'office', 'warehouse', 'mixed'] as const;

export class CreatePropertyDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  floors?: number;

  @IsOptional()
  @IsIn(ACTIVITY_TYPES)
  activityType?: (typeof ACTIVITY_TYPES)[number];

  @IsOptional()
  @IsString()
  activitySubtype?: string;

  @IsIn(OWNERSHIP_TYPES)
  ownership!: (typeof OWNERSHIP_TYPES)[number];

  @IsOptional()
  @IsNumber()
  leaseValue?: number;

  @IsOptional()
  @IsString()
  leaseCycle?: string;

  @IsOptional()
  @IsString()
  leaseStart?: string;

  @IsOptional()
  @IsString()
  leaseEnd?: string;

  @IsOptional()
  @IsNumber()
  opRate?: number;

  @IsOptional()
  @IsString()
  deedNo?: string;

  @IsOptional()
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @IsLongitude()
  lng?: number;
}
