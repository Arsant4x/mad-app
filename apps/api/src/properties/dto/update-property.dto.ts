import { IsIn, IsInt, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ACTIVITY_TYPES, OWNERSHIP_TYPES } from './create-property.dto';

export class UpdatePropertyDto {
  @IsOptional()
  @IsString()
  name?: string;

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

  @IsOptional()
  @IsIn(OWNERSHIP_TYPES)
  ownership?: (typeof OWNERSHIP_TYPES)[number];

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
