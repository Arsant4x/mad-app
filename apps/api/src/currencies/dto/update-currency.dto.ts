import { IsNotEmpty, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

/** The code is deliberately absent: changing it would orphan every document
 * that stored the old one, since documents carry the code, not the row id. */
export class UpdateCurrencyDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  symbol?: string;

  @IsOptional()
  @IsPositive()
  rate?: number;
}
