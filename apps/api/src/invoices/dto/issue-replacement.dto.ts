import { IsDateString, IsInt, IsOptional, Max, Min, ValidateIf } from 'class-validator';

/**
 * بدلٌ عن فاتورةٍ مردودة (`ق-٩٥٨`): لا بنودَ ولا عميلَ — **كلُّه من المردودة**، فالبدلُ هو
 * البيعُ نفسُه بعدّادٍ وتجزئةٍ جديدَين. ولا يُرسَل إلا لحظةُ الجهاز وانحرافُه (`ق-١٨٥`) —
 * للقياسية التي يُحدَّث تاريخُها؛ والمبسَّطةُ تحتفظ بلحظة معاملتها الأصلية.
 */
export class IssueReplacementDto {
  @IsOptional()
  @IsDateString()
  issuedAt?: string;

  /** انحرافُ الجهاز عن UTC بالدقائق — يُرسَل مع `issuedAt` أو لا يُرسَل. */
  @ValidateIf((o) => o.issuedAt !== undefined)
  @IsInt()
  @Min(-14 * 60)
  @Max(14 * 60)
  issuedOffsetMin?: number;
}
