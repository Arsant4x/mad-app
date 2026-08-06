import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, Min, ValidateIf } from 'class-validator';

const CHANNELS = ['WHATSAPP', 'SMS', 'CALL', 'EMAIL', 'OTHER'] as const;

/** At least one non-whitespace character — a blank message is not a reminder. */
const NON_BLANK = /\S/;

export class UpdateReminderPolicyDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /// 0 means "on the due date". Capped at 30: a reminder a quarter early is
  /// noise, not notice.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  daysBefore?: number;

  /// At least 1 — chasing the same tenant twice in one day is how a reminder
  /// becomes something they mute.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  repeatEveryDays?: number;

  /// Days overdue before the arrear is raised to the manager. Null switches
  /// escalation off. Floor of 1: escalating on the due date itself would mean
  /// escalating everything, which is the same as escalating nothing.
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(365)
  escalateAfterDays?: number | null;

  /// Which company user receives escalations. Null = the account owner.
  /// Checked against this company's own users before it is stored.
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  escalateToUserId?: string | null;
}

export class SendReminderDto {
  @IsIn(CHANNELS)
  channel!: (typeof CHANNELS)[number];

  /// Stored as sent, not regenerated later: templates change, and what matters
  /// afterwards is what the tenant was actually told.
  @IsString()
  @Matches(NON_BLANK)
  message!: string;
}
