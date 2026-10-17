import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsString, Matches } from 'class-validator';
import { PagedQueryDto } from '../../common/dto/paged-query.dto';

/**
 * A calendar date, optionally with a time and a zone. ISO 8601 alone also admits week, ordinal and basic forms
 * (`2026-W01`, `2026001`, `20260101`) that a JavaScript date cannot read.
 */
const READABLE_ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/;

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
  @IsISO8601({ strict: true })
  @Matches(READABLE_ISO_DATE)
  from?: string;

  /** Up to this moment; a date alone includes the whole day. */
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(READABLE_ISO_DATE)
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;
}
