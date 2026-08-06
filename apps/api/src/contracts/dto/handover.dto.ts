import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';

const HANDOVER_TYPES = ['DELIVERY', 'RECEIPT'] as const;
const CONDITIONS = ['GOOD', 'FAIR', 'DAMAGED', 'MISSING'] as const;

/** At least one non-whitespace character — `@IsNotEmpty` accepts a run of
 * spaces, which is not a label. */
const NON_BLANK = /\S/;

export class HandoverItemDto {
  @IsString()
  @Matches(NON_BLANK)
  label!: string;

  @IsIn(CONDITIONS)
  condition!: (typeof CONDITIONS)[number];

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateHandoverDto {
  @IsIn(HANDOVER_TYPES)
  type!: (typeof HANDOVER_TYPES)[number];

  @IsDateString()
  date!: string;

  /// The two numbers tenants and landlords argue about most, so they are their
  /// own fields rather than buried in the notes.
  @IsOptional()
  @IsString()
  electricityMeter?: string;

  @IsOptional()
  @IsString()
  waterMeter?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /// May be empty at first — a form is often created and filled in room by
  /// room before anyone signs it.
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HandoverItemDto)
  items!: HandoverItemDto[];
}

/** Everything a draft form can still change. Sending it against a signed form
 * is refused. */
export class UpdateHandoverDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  electricityMeter?: string;

  @IsOptional()
  @IsString()
  waterMeter?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /// Replaces the item list wholesale — simpler and less error-prone than
  /// per-row edits for a form that is filled in one sitting.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HandoverItemDto)
  items?: HandoverItemDto[];
}

export class SignHandoverDto {
  /// Who signed. Recorded because "signed" without a name settles nothing.
  @IsString()
  @Matches(NON_BLANK)
  signedBy!: string;
}
