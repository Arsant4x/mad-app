import { Type } from 'class-transformer';
import { ArrayMinSize, IsDateString, IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { InvoiceLineDto } from './invoice-line.dto';

export class CreateDebitNoteDto {
  /** Mandatory — ZATCA rejects a 383 without its reason (BR-KSA-17). */
  @IsString()
  @IsNotEmpty()
  reason!: string;

  /** Same client-local-date reasoning as CreateCreditNoteDto. */
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  /** REQUIRED, unlike the credit note's optional full-copy default: a debit
   * note bills additional amounts, and silently duplicating the whole
   * original invoice would be accidental double-billing, not a default. */
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  @ArrayMinSize(1)
  lines!: InvoiceLineDto[];
}
