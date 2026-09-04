import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * رفض واقعة شطب — **والسبب إلزاميّ**.
 *
 * رفضٌ بلا سبب يترك من سجّل الواقعة بلا ما يصحّحه، **ويترك التقرير يقول
 * «رُفضت» بلا أن يقول لماذا** — فيعود السؤال إلى ذاكرة شخصٍ بعد شهر.
 */
export class RejectWriteOffDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
