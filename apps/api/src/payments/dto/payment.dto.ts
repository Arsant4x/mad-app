import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString, ValidateNested } from 'class-validator';
import { CurrencyFieldsDto } from '../../common/currency/currency-fields.dto';

/** تخصيص جزء من الدفعة لفاتورة بعينها — بعملة الدفعة. */
export class AllocationDto {
  @IsString()
  invoiceId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;
}

export class CreatePaymentDto extends CurrencyFieldsDto {
  @IsString()
  customerId!: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsDateString()
  date!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsIn(['CASH', 'BANK'])
  method!: 'CASH' | 'BANK';

  /** حساب البنك للتحويل، أو صندوق الفرع الذي استلم النقد. */
  @IsOptional()
  @IsString()
  bankId?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** التخصيص لحظة التسجيل — اختياري: دفعة على الحساب تُخصَّص لاحقاً. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllocationDto)
  allocations?: AllocationDto[];
}

/** إعادة توزيع دفعة قائمة — تحلّ محلّ تخصيصاتها كلها. */
export class AllocateDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllocationDto)
  allocations!: AllocationDto[];
}

export class ReversePaymentDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
