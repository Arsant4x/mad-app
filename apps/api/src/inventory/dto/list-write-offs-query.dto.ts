import { IsOptional, IsString } from 'class-validator';
import { PagedQueryDto } from '../../common/dto/paged-query.dto';

/**
 * `GET /inventory/write-offs` — مرشّحُ الحالة كما كان مع الترقيم بالاختيار (`ق-١٢٣٦`).
 * `status` يبقى نصّاً هنا **والخدمةُ هي التي تردّ المجهولَ برسالةٍ تسمّي المقبول** (`writeoff_status_unknown`)
 * — فلا يُستبدل بـ`@IsIn` كي تبقى الرسالةُ العربيةُ القائمة لا رسالةَ التحقّق العامّة.
 */
export class ListWriteOffsQueryDto extends PagedQueryDto {
  @IsOptional()
  @IsString()
  status?: string;
}
