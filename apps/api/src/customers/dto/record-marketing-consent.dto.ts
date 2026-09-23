import { IsBoolean, IsDateString, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CONSENT_SOURCES, MARKETING_CHANNELS } from '../marketing-consent.util';

/**
 * **تسجيلُ واقعةِ موافقةٍ أو رجوعٍ عنها** (`ق-١٣٠٣` · ك/⑰A1).
 *
 * **القناةُ والمصدرُ من الكتالوج** لا نصّاً حرّاً — ونصٌّ حرٌّ في المصدر يُكتب «موافق»
 * فلا يُثبت شيئاً، واللائحةُ (م٢٨/٢) توجب توثيقاً **يقبل التحقّق مستقبلاً**.
 */
export class RecordMarketingConsentDto {
  @IsIn([...MARKETING_CHANNELS])
  channel!: string;

  /// `true` موافقة · `false` رجوعٌ عنها — **والرجوعُ واقعةٌ تالية لا تعديلٌ للأولى**.
  @IsBoolean()
  granted!: boolean;

  @IsIn([...CONSENT_SOURCES])
  source!: string;

  /// **متى وقعت** — اختياريّ، وغيابُه يعني الآن. **ولا تُقبل من المستقبل** (تُفحص في الخدمة).
  @IsOptional()
  @IsDateString()
  at?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
