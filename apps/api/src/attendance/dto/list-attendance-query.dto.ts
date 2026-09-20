import { IsOptional, IsString } from 'class-validator';
import { PagedQueryDto } from '../../common/dto/paged-query.dto';

/**
 * `GET /attendance` — كشفُ يومٍ (`date`) أو سجلُّ موظّف (`employeeId`) كما كان، مع الترقيم بالاختيار
 * (`ق-١٢٣٦`). المعاملان نصّان بلا تحقّقِ شكلٍ كما كانا يُقرآن بـ`@Query('…')` — فلا يتغيّر عقدُهما.
 */
export class ListAttendanceQueryDto extends PagedQueryDto {
  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  employeeId?: string;
}
