import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { MAX_PAGE_SIZE } from '../../common/dto/paged-query.dto';

/** GET /admin/platform-audit-log: always a page, newest first, filtered by administrator, company and date. */
export class ListPlatformAuditQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number;

  @IsOptional()
  @IsUUID()
  adminId?: string;

  /** The company a route acted on. */
  @IsOptional()
  @IsUUID()
  companyId?: string;

  /** From this moment (a date or a date and time). */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** Up to this moment; a date alone includes the whole day. */
  @IsOptional()
  @IsISO8601()
  to?: string;
}
