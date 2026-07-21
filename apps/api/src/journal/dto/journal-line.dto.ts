import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class JournalLineDto {
  @IsString()
  @IsNotEmpty()
  accountId!: string;

  @IsNumber()
  @Min(0)
  debit!: number;

  @IsNumber()
  @Min(0)
  credit!: number;
}
