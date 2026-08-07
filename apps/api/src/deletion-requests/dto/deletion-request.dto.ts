import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SubmitDeletionRequestDto {
  /// Why the merchant is leaving — support reads this before executing.
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class DeletionRequestDecisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
