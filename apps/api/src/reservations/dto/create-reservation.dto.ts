import { IsISO8601, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateReservationDto {
  @IsString()
  @MinLength(1)
  unitId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deposit?: number;

  @IsISO8601()
  expiryDate!: string;
}
