import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateActivityDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  activityType?: string;
}
