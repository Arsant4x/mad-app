import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Min, ValidateIf, ValidateNested } from 'class-validator';

const SETTLEMENT_BASES = ['none', 'amount', 'installments', 'all'] as const;

/** بند من تفصيل التسوية: «شهر إشعار: 3000» · «خصم صيانة: -450». */
export class SettlementLineDto {
  @IsString()
  @IsNotEmpty()
  label!: string;

  /** موجب = على المستأجر، سالب = له — والمجموع يجب أن يساوي مبلغ التسوية. */
  @IsNumber()
  amount!: number;
}

export class CancelContractDto {
  @IsString()
  @IsNotEmpty()
  cancelDate!: string;

  @IsString()
  @IsNotEmpty()
  cancelReason!: string;

  /** 'keep' leaves not-yet-due installments owed as-is; 'cancel' voids every
   * unpaid installment due on/after the cancel date — matches the mockup's
   * cancel-contract dialog. */
  @IsIn(['keep', 'cancel'])
  installmentDisposition!: 'keep' | 'cancel';

  /**
   * How the early-termination settlement is worked out:
   *
   * - `none` — the parties agreed on nothing, so nothing is posted;
   * - `amount` — an explicitly negotiated figure;
   * - `installments` — the next N unpaid installments' worth;
   * - `all` — everything still unpaid from the cancel date onwards.
   *
   * The last two are conveniences that compute an amount; only the number they
   * arrive at is stored, because the installments themselves may be voided in
   * the same call.
   */
  @IsOptional()
  @IsIn(SETTLEMENT_BASES)
  settlementBasis?: (typeof SETTLEMENT_BASES)[number];

  @ValidateIf((o) => o.settlementBasis === 'amount')
  @IsNumber()
  @IsPositive()
  settlementAmount?: number;

  /** تفصيل التسوية بنوداً (§16) — اختياري؛ عند وجوده يُدقَّق مجموعه ضد
   * المبلغ المحسوب ويُخزَّن سطراً سطراً. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SettlementLineDto)
  settlementLines?: SettlementLineDto[];

  @ValidateIf((o) => o.settlementBasis === 'installments')
  @IsInt()
  @Min(1)
  settlementInstallments?: number;
}
