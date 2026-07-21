import { IsIn, IsOptional, IsString } from 'class-validator';
import { FURNISHED_OPTIONS } from './create-contract.dto';

/** Deliberately narrow: unit/value/dates/cycle can't be changed after
 * creation (that would require reconciling already-generated installments)
 * — only descriptive fields. Cancellation is its own endpoint. */
export class UpdateContractDto {
  @IsOptional()
  @IsString()
  tenant?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  services?: string;

  @IsOptional()
  @IsIn(FURNISHED_OPTIONS)
  furnished?: (typeof FURNISHED_OPTIONS)[number];

  @IsOptional()
  @IsString()
  ejarNo?: string;
}
