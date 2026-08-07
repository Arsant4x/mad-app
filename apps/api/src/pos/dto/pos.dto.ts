import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsDateString, IsIn, IsNumber, IsOptional, IsPositive, IsString, Min, ValidateNested } from 'class-validator';

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

export class PosPaymentPartDto {
  @IsIn(['CASH', 'CARD'])
  method!: 'CASH' | 'CARD';

  @IsNumber()
  @IsPositive()
  amount!: number;
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

  /** SPLIT = نقدي + بطاقة معاً؛ التفصيل في payments. */
  @IsIn(['CASH', 'CARD', 'SPLIT'])
  paymentMethod!: 'CASH' | 'CARD' | 'SPLIT';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PosPaymentPartDto)
  payments?: PosPaymentPartDto[];

  /** Optional named customer; omitted = the walk-in «عميل نقدي». */
  @IsOptional()
  @IsString()
  customerId?: string;
}

/** مزامنة بيع أوفلاين: نفس البيع + هوية الطرفية التي تجعل الإرسال آمن التكرار. */
export class SyncPosSaleDto extends CreatePosSaleDto {
  /** Terminal-generated UUID — the idempotency key. */
  @IsString()
  clientSaleId!: string;

  /** المرجع المؤقت المطبوع على الإيصال قبل وجود رقم حقيقي. */
  @IsOptional()
  @IsString()
  offlineRef?: string;

  /** متى رُنّ البيع فعلاً (ISO) — يُحفظ تاريخَ الفاتورة لا تاريخ عودة الشبكة. */
  @IsOptional()
  @IsDateString()
  ringAt?: string;
}
