import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Pagination + search for GET /journal. Unbounded lists blew past the tenant
 * transaction's 5s timeout at scale — contracts hit this at ~1,300 rows — and
 * the ledger grows faster than any list, since every invoice, purchase and
 * payment posts an entry. So the list is paginated, and search moved
 * server-side (the client can no longer filter rows it never received).
 */
export class ListJournalQueryDto {
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

  /** Matches memo, entry no, or a line's account code — same fields the
   * screen's search box always covered. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
