import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';
import { PagedQueryDto } from '../../common/dto/paged-query.dto';

/**
 * `GET /audit-log` — مرشّحاتُ السجلّ كما كانت (نصوصٌ بلا تحقّقِ شكلٍ كما كانت تُقرأ بـ`@Query('…')`)
 * مع الترقيم بالاختيار (`ق-١٢٣٦`).
 *
 * `limit` يبقى سقفَ القراءة **بلا `page`** كما كان (افتراضُه `200` وسقفُه `500` في الخدمة)؛ ومع `page`
 * النافذةُ هي الحاكمة ولا يُقرأ.
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

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;
}
