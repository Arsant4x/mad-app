import { IsDateString, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

/** At least one non-whitespace character — `@IsNotEmpty` happily accepts a run
 * of spaces, which is how a blank subject reaches the database. */
const NON_BLANK = /\S/;

export class CreateWarrantyDto {
  @IsString()
  @Matches(NON_BLANK)
  subject!: string;

  @IsUUID()
  propertyId!: string;

  /// Omit to cover the whole property: a building's lift belongs to the
  /// building, a flat's air conditioner to the flat.
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsString()
  @Matches(NON_BLANK)
  provider!: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsDateString()
  startDate!: string;

  /// Required. A warranty with no end date cannot be checked against a fault
  /// date, and checking is the entire purpose of recording it.
  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  terms?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateWarrantyDto {
  @IsOptional()
  @IsString()
  @Matches(NON_BLANK)
  subject?: string;

  @IsOptional()
  @IsUUID()
  unitId?: string | null;

  @IsOptional()
  @IsString()
  @Matches(NON_BLANK)
  provider?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string | null;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  terms?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

/** Records that a maintenance job was claimed under a warranty — or clears the
 * claim when it turns out cover was refused. */
export class ClaimWarrantyDto {
  @IsOptional()
  @IsUUID()
  warrantyId?: string | null;
}
