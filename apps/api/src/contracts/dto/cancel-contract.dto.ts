import { IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, Min, ValidateIf } from 'class-validator';

const SETTLEMENT_BASES = ['none', 'amount', 'installments', 'all'] as const;

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

  @ValidateIf((o) => o.settlementBasis === 'installments')
  @IsInt()
  @Min(1)
  settlementInstallments?: number;
}
