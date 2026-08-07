import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsIn, IsNumber, IsOptional, IsPositive, IsString, Min, ValidateNested } from 'class-validator';

export class OpenShiftDto {
  /** العهدة الافتتاحية — what the drawer starts with. Zero is a valid float. */
  @IsNumber()
  @Min(0)
  openingFloat!: number;

  @IsOptional()
  @IsString()
  branchId?: string;
}

export class CloseShiftDto {
  /** What the cashier actually counted; the variance against the expected
   * drawer is computed server-side, never typed in. */
  @IsNumber()
  @Min(0)
  declaredClosing!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class PosSaleLineDto {
  @IsString()
  productId!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;
}

export class CreatePosSaleDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PosSaleLineDto)
  lines!: PosSaleLineDto[];

  @IsIn(['CASH', 'CARD'])
  paymentMethod!: 'CASH' | 'CARD';

  /** Optional named customer; omitted = the walk-in «عميل نقدي». */
  @IsOptional()
  @IsString()
  customerId?: string;
}
