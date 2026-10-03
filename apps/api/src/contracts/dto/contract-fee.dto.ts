import { IsDateString, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

/**
 * ⚖️ **بندُ رسمٍ على العقد** (السؤالان ٤٩ و٤١٣ · `ق-١٦٠٠`) — مسمّى بمبلغه لكلِّ قسطٍ صافياً، والضريبةُ ١٥٪ فوقه على مطالبته
 * ولو كان الإيجارُ معفى. يُرسل مع إنشاء العقد (`fees`) أو يُضاف لعقدٍ قائم.
 */
export class ContractFeeDto {
  /// اسمُ الرسم كما يراه المستأجر (موقف · نظافة · خدمات) — ولا يُقبل فراغٌ بمسافات.
  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  label!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  /// أوّلُ يومٍ يُطالَب فيه — غائبٌ ⇒ بدايةُ العقد عند إنشائه، واليومُ عند إضافته لعقدٍ قائم.
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}

export class EndContractFeeDto {
  /// آخرُ يومٍ يُطالَب فيه — قسطٌ يحلّ بعده لا رسمَ معه، وما طولب عنه قبله يبقى.
  @IsDateString()
  endedAt!: string;
}
