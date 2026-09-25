import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

/**
 * ⚖️ **نقلُ صفّ البنك بين الفروع — بنوعه المعلَن** (`ق-١٤٣١` · التوجيه ٢٦٤ §٢):
 * - **الصندوقُ النقديّ** (`CASH_BOX` — `ق-١٤١٣`): فرعُه مكانُ النقد، فالنقلُ إغلاقٌ وفتح — **المعدودُ والتاريخُ إلزاميّان**،
 *   والفرقُ عن الدفتر فرقُ جرد، ويُنقل المعدودُ بقيدين عبر `1190` (`ق-١٤٣٣`)، ويُفتح خلفُه في الهدف.
 * - **الحسابُ البنكيّ** (`BANK_ACCOUNT` — `ق-١٤١٤`): فرعُه بُعدٌ ورؤية، فالنقلُ للقادم وحدَه — **لا عدَّ ولا تاريخ** (يُرفضان مسمّىً).
 * - **«غيرُ المعلَن»** لا يُنقل حتى يُعلَن.
 */
export class TransferBankDto {
  /** الفرعُ الهدف. */
  @IsUUID()
  toBranchId!: string;

  /** للصندوق وحدَه: النقدُ المعدود لحظةَ إغلاقه — صفرٌ فأكثر. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  countedAmount?: number;

  /** للصندوق وحدَه: تاريخُ العدّ والنقل — تاريخُ القيود الثلاثة. */
  @IsOptional()
  @IsDateString()
  date?: string;

  /** للصندوق وحدَه: اسمُ الخلف في الفرع الهدف — بلا اسمٍ يرث اسمَ القديم. */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;
}
