import { IsBoolean, IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdatePurchaseDto {
  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  subtotal?: number;

  @IsOptional()
  @IsBoolean()
  exempt?: boolean;

  @IsOptional()
  @IsBoolean()
  paid?: boolean;

  @IsOptional()
  @IsDateString()
  paidDate?: string;
}
