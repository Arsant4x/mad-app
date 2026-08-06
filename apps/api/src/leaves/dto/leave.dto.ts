import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min } from 'class-validator';

/** At least one non-whitespace character — `@IsNotEmpty` accepts a run of
 * spaces, which is how a blank name reaches the database. */
const NON_BLANK = /\S/;

export class CreateLeaveTypeDto {
  @IsString()
  @Matches(NON_BLANK)
  name!: string;

  /// Yearly entitlement in days. 0 = no fixed entitlement (unpaid/unlimited).
  /// The owner sets this — the code never guesses a statutory figure.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  annualDays?: number;

  @IsOptional()
  @IsBoolean()
  paid?: boolean;
}

export class UpdateLeaveTypeDto {
  @IsOptional()
  @IsString()
  @Matches(NON_BLANK)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  annualDays?: number;

  @IsOptional()
  @IsBoolean()
  paid?: boolean;
}

export class CreateLeaveRequestDto {
  @IsUUID()
  employeeId!: string;

  @IsUUID()
  leaveTypeId!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

/** Approve or reject carries only an optional note — the decision itself is the
 * endpoint (`/approve` vs `/reject`), not a field a client could spoof. */
export class DecideLeaveRequestDto {
  @IsOptional()
  @IsString()
  note?: string;
}
