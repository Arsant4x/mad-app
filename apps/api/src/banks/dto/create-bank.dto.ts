import { CurrencyFieldsDto } from '../../common/currency/currency-fields.dto';
import { IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { MSG } from '../../common/i18n/messages';

/**
 * ⚖️ ق-١٤٣١ — نوعُ الصفّ **يُعلَن ولا يُستنبط**: «صندوقٌ نقديّ» (فرعُه مكانُ النقد — النقلُ إغلاقٌ وفتح) أو «حسابٌ
 * بنكيّ» (فرعُه بُعدٌ ورؤية — النقلُ للقادم). و`LEGACY_UNDECLARED` ليس مدخلاً: هو وسمُ القائم قبل الهجرة وحدَه،
 * وقيدُ `CHECK` في القاعدة يرفضه على كلِّ صفٍّ جديد.
 */
export const BANK_KINDS = ['CASH_BOX', 'BANK_ACCOUNT'] as const;
export type BankKindInput = (typeof BANK_KINDS)[number];

export class CreateBankDto extends CurrencyFieldsDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsIn(BANK_KINDS, { message: MSG.bank_kind_required })
  kind!: BankKindInput;

  @IsOptional()
  @IsString()
  iban?: string;

  @IsOptional()
  @IsNumber()
  openingBalance?: number;

  @IsDateString()
  openingDate!: string;
}
