import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateBankDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  iban?: string;

  @IsOptional()
  @IsNumber()
  openingBalance?: number;

  @IsDateString()
  openingDate!: string;
}
