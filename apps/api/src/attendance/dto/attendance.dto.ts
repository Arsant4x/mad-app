import { IsDateString, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

/** Wall-clock "HH:mm" — what the clock on the wall said, nothing cleverer. */
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export class RecordAttendanceDto {
  @IsUUID()
  employeeId!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsIn(['PRESENT', 'ABSENT'])
  status?: 'PRESENT' | 'ABSENT';

  @IsOptional()
  @IsString()
  @Matches(TIME_RE)
  checkIn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateAttendanceDto {
  @IsOptional()
  @IsIn(['PRESENT', 'ABSENT'])
  status?: 'PRESENT' | 'ABSENT';

  @IsOptional()
  @IsString()
  @Matches(TIME_RE)
  checkIn?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_RE)
  checkOut?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
