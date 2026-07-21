import { IsNotEmpty, IsNumber, IsString, Max, Min } from 'class-validator';

export class InvoiceLineDto {
  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsNumber()
  @Min(0.01)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  taxRate!: number;
}
