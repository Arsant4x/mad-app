import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

/**
 * سطرُ القيد اليدويّ بخانتين كما يُخزَّن (`Decimal(18,2)`): سطرٌ بثلاثٍ كان يُقبل ثم يُدوَّر في القاعدة، فيُخزَّن القيدُ غيرَ
 * متوازنٍ وهو متوازنٌ في الطلب (توجيه ٢٧٤ · مراجعة 3.3 البند 2). والتوازنُ نفسُه يُحرس في `createJournalEntry` لكلِّ المسارات.
 */
export class JournalLineDto {
  @IsString()
  @IsNotEmpty()
  accountId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  debit!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  credit!: number;
}
