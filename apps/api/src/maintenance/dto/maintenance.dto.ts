import { IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Matches } from 'class-validator';
import { CurrencyFieldsDto } from '../../common/currency/currency-fields.dto';

const PRIORITIES = ['URGENT', 'HIGH', 'NORMAL'] as const;

/** At least one non-whitespace character — `@IsNotEmpty` passes a run of
 * spaces, which is not a title. */
const NON_BLANK = /\S/;

export class CreateMaintenanceDto {
  @IsUUID()
  propertyId!: string;

  /// Optional: a fault in a shared area (lift, generator, roof) belongs to the
  /// property, not to any one unit.
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @IsString()
  @Matches(NON_BLANK)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: (typeof PRIORITIES)[number];

  @IsOptional()
  @IsString()
  reportedBy?: string;

  @IsDateString()
  reportedAt!: string;
}

/** Editable while the work is still open — see the status guard in the service. */
export class UpdateMaintenanceDto {
  @IsOptional()
  @IsString()
  @Matches(NON_BLANK)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(PRIORITIES)
  priority?: (typeof PRIORITIES)[number];

  @IsOptional()
  @IsString()
  reportedBy?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AssignMaintenanceDto {
  /// An employee or an outside contractor, so free text rather than an id.
  @IsString()
  @Matches(NON_BLANK)
  assignedTo!: string;
}

export class StartMaintenanceDto {
  @IsDateString()
  startedAt!: string;
}

export class CompleteMaintenanceDto extends CurrencyFieldsDto {
  @IsDateString()
  completedAt!: string;

  /// Omitted when the work cost the landlord nothing — an in-house fix, or one
  /// the contractor covered under warranty. Nothing is posted in that case.
  @IsOptional()
  @IsNumber()
  @IsPositive()
  cost?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CloseMaintenanceDto {
  @IsDateString()
  closedAt!: string;
}

export class CancelMaintenanceDto {
  /// A cancelled request with no reason is indistinguishable from a forgotten
  /// one.
  @IsString()
  @Matches(NON_BLANK)
  cancelReason!: string;
}
