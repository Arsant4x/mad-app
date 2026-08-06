import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateActivityDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  /// Free text (عقارات | مطاعم | صيدلية …) rather than an enum: the behaviour
  /// tied to an activity lives in code, and a company must be able to describe
  /// a line of business we didn't anticipate.
  @IsOptional()
  @IsString()
  @MaxLength(60)
  activityType?: string;
}
