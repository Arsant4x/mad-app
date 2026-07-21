import { IsIn, IsNotEmpty, IsString } from 'class-validator';

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
}
