import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * ⚖️ **إعادةُ فتح الفترة بسببٍ مكتوبٍ يُسجَّل** (توجيه ٢٧٥ · `ق-١٥٨٣`، بحكم صاحب المشروع).
 *
 * فتحُ فترةٍ مقفلة يغيّر ما سُلّم من أرقامها (ويعكس قيدَ إقفال سنتها، `ق-١٢٨٣`/ج)، فلا يقع بلا سبب. والسببُ يُحفظ على الفترة
 * مع لحظته ومن فتحها؛ والفراغُ بعد التشذيب يُرفض في الخدمة برسالته.
 */
export class ReopenPeriodDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}
