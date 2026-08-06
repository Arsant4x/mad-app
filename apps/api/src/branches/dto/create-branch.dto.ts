import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateBranchDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  /// 'فرع' | 'محل' | 'مستودع' … — display only, deliberately free text like
  /// Account.type and Unit.type elsewhere in this app.
  @IsOptional()
  @IsString()
  type?: string;

  /// Defaults to the company's single seeded activity when omitted, so a
  /// single-business company never has to think about activities.
  @IsOptional()
  @IsString()
  activityId?: string;

  @IsOptional()
  @IsString()
  propertyId?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  hours?: string;
}
