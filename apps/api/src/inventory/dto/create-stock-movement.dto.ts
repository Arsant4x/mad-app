import { BranchFieldDto } from '../../branches/dto/branch-field.dto';
import { IsDateString, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export const STOCK_MOVEMENT_TYPES = ['IN', 'OUT', 'TRANSFER', 'ADJUSTMENT'] as const;

export class CreateStockMovementDto extends BranchFieldDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsString()
  @IsNotEmpty()
  warehouseId!: string;

  @IsOptional()
  @IsString()
  toWarehouseId?: string;

  @IsIn(STOCK_MOVEMENT_TYPES)
  type!: (typeof STOCK_MOVEMENT_TYPES)[number];

  @IsNumber()
  qty!: number;

  @IsString()
  @IsNotEmpty()
  date!: string;

  @IsOptional()
  @IsString()
  reason?: string;

  /// Batch/lot number and expiry — used on receiving (IN) perishables.
  @IsOptional()
  @IsString()
  batchNo?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}
