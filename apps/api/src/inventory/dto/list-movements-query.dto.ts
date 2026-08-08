import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Pagination + search for GET /inventory/movements. Unbounded lists blew past
 * the tenant transaction's 5s timeout at scale (contracts hit it at ~1,300
 * rows), and a movement ledger grows with every receipt, sale and transfer —
 * so the list is paginated and search runs server-side.
 */
export class ListMovementsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  /** Capped so a caller can't ask for the old everything-at-once behaviour back. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  /** Matches product name, warehouse name (source or destination), or the
   * reason text — the free-text columns the movements table shows. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
