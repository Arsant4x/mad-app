import { CurrencyFieldsDto } from '../../common/currency/currency-fields.dto';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsDateString, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { InvoiceStatus } from '@prisma/client';
import { InvoiceLineDto } from './invoice-line.dto';

export class UpdateInvoiceDto extends CurrencyFieldsDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  // When provided, replaces every existing line and recomputes totals from
  // scratch (see InvoicesService.update) — there is no partial line-patching.
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  @ArrayMinSize(1)
  lines?: InvoiceLineDto[];
}
