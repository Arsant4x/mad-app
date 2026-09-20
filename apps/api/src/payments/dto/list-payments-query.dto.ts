import { IsOptional, IsString } from 'class-validator';
import { PagedQueryDto } from '../../common/dto/paged-query.dto';

/**
 * `GET /payments` — ترشيحٌ بالعميل (كما كان: نصٌّ بلا تحقّقِ شكلٍ، فمعرِّفٌ لا يطابق يعيد قائمةً فارغة
 * لا `400`) مع الترقيم بالاختيار (`ق-١٢٣٦`).
 */
export class ListPaymentsQueryDto extends PagedQueryDto {
  @IsOptional()
  @IsString()
  customerId?: string;
}
