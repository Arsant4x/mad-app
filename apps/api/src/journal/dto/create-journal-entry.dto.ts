import { CurrencyFieldsDto } from '../../common/currency/currency-fields.dto';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsDateString, IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { JournalLineDto } from './journal-line.dto';

export class CreateJournalEntryDto extends CurrencyFieldsDto {
  @IsDateString()
  date!: string;

  @IsString()
  @IsNotEmpty()
  memo!: string;

  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  @ArrayMinSize(1)
  lines!: JournalLineDto[];
}
