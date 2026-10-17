import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';
import { IsDateFilter } from '../../common/dto/date-filter.decorator';
import { PagedQueryDto } from '../../common/dto/paged-query.dto';

/**
 * `GET /audit-log` filters, with optional paging.
 *
 * Without `page`, `limit` caps the read (default 200, at most 500 in the service); with `page` the page window
 * governs and `limit` is not read.
 */
export class ListAuditQueryDto extends PagedQueryDto {
  @IsOptional()
  @IsString()
  actorId?: string;

  @IsOptional()
  @IsString()
  screen?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  /** From this moment (a date or a date and time). */
  @IsOptional()
  @IsDateFilter()
  from?: string;

  /** Up to this moment; a date alone includes the whole day. */
  @IsOptional()
  @IsDateFilter()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;
}
