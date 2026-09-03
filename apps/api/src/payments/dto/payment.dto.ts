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

/**
 * سندُ ردٍّ لمرتجع (`SPEC 30.8`، قرار المالك 2026-09-03): **سندٌ مستقل مربوطٌ بالإشعار الدائن**،
 * لا عكسٌ لسند القبض — فالعكس يمحو واقعة، والدفتر وقائع لا حالات.
 *
 * القابل للردّ يحسبه الخادم: مجموع إشعارات الفاتورة ناقص ما يخصم متبقّيها غير المسدَّد
 * (**الخصم من غير المسدَّدة إلزاميّ**) ناقص ما رُدّ سابقاً. `amount` اختياري = القابل للردّ كلّه.
 */
export class RefundDto extends CurrencyFieldsDto {
  @IsString()
  creditNoteId!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @IsIn(['CASH', 'BANK'])
  method!: 'CASH' | 'BANK';

  /** حساب البنك للتحويل، أو صندوق الفرع الذي يخرج منه النقد. */
  @IsOptional()
  @IsString()
  bankId?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
