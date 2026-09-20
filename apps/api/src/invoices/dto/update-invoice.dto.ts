import { CurrencyFieldsDto } from '../../common/currency/currency-fields.dto';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsDateString, IsOptional, IsString, ValidateNested } from 'class-validator';
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

  // ⚖️ لا `status` هنا (`ق-١١٩٨`/②): حالةُ السداد **مشتقّةٌ من التخصيصات** ويكتبها
  // `recomputeInvoiceStatus` وحدَه (4.5)؛ وكان هذا الحقلُ يقبلها من الخارج فتُختم فاتورةٌ
  // «مسدَّدة» بلا ريال — والمُرسِلُ يُردّ `400` بالقائمة البيضاء لا يُتجاهَل بصمت.

  // When provided, replaces every existing line and recomputes totals from
  // scratch (see InvoicesService.update) — there is no partial line-patching.
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  @ArrayMinSize(1)
  lines?: InvoiceLineDto[];
}
