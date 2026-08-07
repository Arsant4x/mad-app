import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Pagination + search for GET /contracts. The list used to return every
 * contract with its full sub-tree, which blew past the tenant transaction's
 * 5s timeout once a portfolio reached ~1,300 contracts — so the list is now
 * paginated, and search moved server-side (the client can no longer filter
 * rows it never received).
 */
export class ListContractsQueryDto {
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

  /** Matches tenant name, contract no, or unit no — same fields the screen's
   * search box always covered. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
