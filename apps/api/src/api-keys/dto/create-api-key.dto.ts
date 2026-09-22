import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateApiKeyDto {
  /** اسمٌ يعرفه التاجر — به يُميّز ما يُبطله. */
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  /** قالبُ الصلاحيات — **المفردةُ نفسُها للموظّف والمفتاح**، فلا نظامَ صلاحياتٍ ثانٍ. */
  @IsUUID()
  permissionTemplateId!: string;
}
