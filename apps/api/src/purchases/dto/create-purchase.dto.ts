import { IsBoolean, IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreatePurchaseDto {
  @IsString()
  @IsNotEmpty()
  supplierId!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsNumber()
  @Min(0.01)
  subtotal!: number;

  @IsOptional()
  @IsBoolean()
  exempt?: boolean;
}
