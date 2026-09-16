import { IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { CONTRACT_CLASSIFICATIONS, CONTRACT_VAT_INCLUSIONS } from './create-contract.dto';

const CYCLES = ['monthly', 'quarterly', 'semiannual', 'annual'] as const;

export class RenewContractDto {
  @IsDateString()
  start!: string;

  @IsDateString()
  end!: string;

  /**
   * التجديدُ عقدٌ جديد — فتصنيفُه وشمولُ قيمته **يُعلَنان لا يُورَّثان** (`ق-٨٩١`:
   * إلزاميٌّ بلا افتراضٍ صامت). الواجهةُ تُعبّئهما من العقد الأصل ليُراجَعا، لا الخادم.
   */
  @IsIn(CONTRACT_CLASSIFICATIONS)
  classification!: (typeof CONTRACT_CLASSIFICATIONS)[number];

  @IsIn(CONTRACT_VAT_INCLUSIONS)
  vatInclusion!: (typeof CONTRACT_VAT_INCLUSIONS)[number];

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
