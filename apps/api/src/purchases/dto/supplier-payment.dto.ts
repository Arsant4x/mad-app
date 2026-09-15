import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString, ValidateNested } from 'class-validator';
import { CurrencyFieldsDto } from '../../common/currency/currency-fields.dto';

/** تخصيصُ جزءٍ من سند الصرف لفاتورة شراءٍ بعينها — بعملة السند. */
export class SupplierAllocationDto {
  @IsString()
  purchaseId!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;
}

/**
 * سندُ صرفٍ لمورّد (`ق-٨٧١`) — مرآةُ `CreatePaymentDto` بمفتاح المورّد.
 *
 * **لا `CARD`**: الشبكةُ ذمّةٌ على البنك المستحوذ عن بيعٍ، لا وسيلةَ دفعٍ لمورّد. ونقداً
 * بلا `bankId` يخرج من `1000`، وعلى بنكٍ من حسابه — **ولا درج** (`ق-٨٧٢`).
 */
export class CreateSupplierPaymentDto extends CurrencyFieldsDto {
  @IsString()
  supplierId!: string;

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

  /** حسابُ البنك للتحويل، أو صندوقُ الفرع الذي خرج منه النقد. */
  @IsOptional()
  @IsString()
  bankId?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  /** التخصيصُ لحظةَ التسجيل — اختياريّ: دفعةٌ على الحساب تُخصَّص لاحقاً. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierAllocationDto)
  allocations?: SupplierAllocationDto[];
}

/** إعادةُ توزيع سندٍ قائم — تحلّ محلَّ تخصيصاته كلِّها. */
export class AllocateSupplierPaymentDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierAllocationDto)
  allocations!: SupplierAllocationDto[];
}

export class ReverseSupplierPaymentDto {
  @IsOptional()
  @IsString()
  reason?: string;

  /** يومُ العكس بتقويم التاجر (`YYYY-MM-DD`) — كما في سند القبض (`ق-٧٣٦`)؛ غيابُه يُبقي ساعةَ الخادم. */
  @IsOptional()
  @IsDateString()
  date?: string;
}
