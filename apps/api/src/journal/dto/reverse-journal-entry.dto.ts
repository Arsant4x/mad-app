import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * ⚖️ **عكسُ قيدٍ مرحَّل** (`ق-١٢٥٣`/①) — القيدُ المرحَّل يُعكس ولا يُحذف.
 *
 * التاريخُ اختياريّ: غيابُه = يومُ الطلب. **ويخضع لقفل الفترات** كأيِّ قيد
 * (`assertPeriodOpen` داخل `createJournalEntry`) — فالتصحيحُ «بقيدٍ عكسي في فترةٍ
 * مفتوحة» (`CLAUDE.md 6.9`) لا بإعادة فتح الماضي.
 */
export class ReverseJournalEntryDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  /** بيانُ القيد العكسي — غيابُه = «عكس القيد {no} — {بيان الأصل}». */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  memo?: string;
}
