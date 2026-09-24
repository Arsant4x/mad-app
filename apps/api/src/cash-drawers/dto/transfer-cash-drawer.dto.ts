import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength } from 'class-validator';

/**
 * ⚖️ **نقلُ الدرج إلى فرعٍ آخر إغلاقٌ وفتح** (`ق-١٤١٣` · التوجيه ٢٦٣ §٤): يُعدّ النقدُ ويُغلق الدرجُ في فرعه، ويُنقل
 * رصيدُه بقيدٍ بين الفرعين، ويُفتح درجٌ جديدٌ في الفرع الهدف. **والمعدودُ يُعلَن ولا يُفترض** — الفرقُ عن الدفتر فرقُ جرد.
 */
export class TransferCashDrawerDto {
  /** الفرعُ الذي يُفتح فيه الدرجُ الجديد. */
  @IsUUID()
  toBranchId!: string;

  /** النقدُ المعدود في الدرج لحظةَ إغلاقه — صفرٌ فأكثر. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  countedAmount!: number;

  /** تاريخُ العدّ والنقل — تاريخُ القيود الثلاثة (فرقُ الجرد · الخروج · الدخول). */
  @IsDateString()
  date!: string;

  /** اسمُ الدرج الجديد في الفرع الهدف — بلا اسمٍ يرث اسمَ القديم. */
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;
}
