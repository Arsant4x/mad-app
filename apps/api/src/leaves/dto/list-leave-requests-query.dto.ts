import { IsOptional, IsString } from 'class-validator';
import { PagedQueryDto } from '../../common/dto/paged-query.dto';

/**
 * `GET /leaves/requests` — مرشّحا الموظّف والحالة كما كانا (نصّان بلا تحقّقِ شكلٍ كما كانا يُقرآن
 * بـ`@Query('…')`) مع الترقيم بالاختيار (`ق-١٢٣٦`).
 */
export class ListLeaveRequestsQueryDto extends PagedQueryDto {
  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
