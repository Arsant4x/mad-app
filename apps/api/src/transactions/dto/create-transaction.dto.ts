import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateTransactionDto {
  @IsString()
  @IsNotEmpty()
  bankId!: string;

  @IsDateString()
  date!: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsNumber()
  amount!: number;

  @IsOptional()
  @IsString()
  source?: string;
}
