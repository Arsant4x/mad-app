import { IsDateString, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { MSG } from '../../common/i18n/messages';
import { BANK_KINDS, BankKindInput } from './create-bank.dto';

export class UpdateBankDto {
  @IsOptional()
  @IsString()
  name?: string;

  /** إعلانُ النوع لصفٍّ «غيرِ معلَن»، أو تصحيحُه — صريحٌ دائماً، ولا عودةَ إلى «غيرِ معلَن» (ق-١٤٣١). */
  @IsOptional()
  @IsIn(BANK_KINDS, { message: MSG.bank_kind_required })
  kind?: BankKindInput;

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
