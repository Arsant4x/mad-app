import { Type } from 'class-transformer';
import { ArrayMinSize, IsDateString, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { InvoiceLineDto } from './invoice-line.dto';

export class CreateInvoiceDto {
  @IsString()
  @IsNotEmpty()
  customerId!: string;

  @IsDateString()
  issueDate!: string;

  @IsDateString()
  dueDate!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  @ArrayMinSize(1)
  lines!: InvoiceLineDto[];
}
