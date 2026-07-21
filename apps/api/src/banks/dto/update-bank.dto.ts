import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateBankDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  iban?: string;

  @IsOptional()
  @IsNumber()
  openingBalance?: number;

  @IsOptional()
  @IsDateString()
  openingDate?: string;
}
