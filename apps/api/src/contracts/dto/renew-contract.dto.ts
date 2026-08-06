import { IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

const CYCLES = ['monthly', 'quarterly', 'semiannual', 'annual'] as const;

export class RenewContractDto {
  @IsDateString()
  start!: string;

  @IsDateString()
  end!: string;

  /// Omitted means "same rent as before" — the common renewal. Sent when the
  /// rent was re-negotiated.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  value?: number;

  @IsOptional()
  @IsIn(CYCLES)
  cycle?: (typeof CYCLES)[number];

  /// A manually chosen contract number, for landlords whose renewals must keep
  /// an externally-issued reference. Omitted means the server's own sequence.
  @IsOptional()
  @IsString()
  @MaxLength(40)
  no?: string;

  /// The Ejar registry number of the renewed lease, if there is one.
  @IsOptional()
  @IsString()
  ejarNo?: string;

  /// Moves any still-held deposit onto the renewed contract instead of
  /// refunding and re-collecting it. Defaults to true: that is what actually
  /// happens in practice, and the money genuinely hasn't moved.
  @IsOptional()
  @IsBoolean()
  carryDeposits?: boolean;
}
