import { IsIn, IsOptional } from 'class-validator';
import { PagedQueryDto } from './paged-query.dto';

/**
 * قائمةٌ تقبل «عرض المؤرشفة» مع الترقيم بالاختيار (`ق-١٢٣٦`).
 *
 * `includeArchived` كان يُقرأ بـ`@Query('includeArchived')` نصّاً حرّاً؛ ومع `@Query() query: PagedQueryDto`
 * يُفحص الاستعلامُ كلُّه بقائمةٍ بيضاء فيُرفض أيُّ مفتاحٍ غيرِ مُعلَن — فيُعلَن هنا بقيمتيه.
 */
export class ArchivablePagedQueryDto extends PagedQueryDto {
  @IsOptional()
  @IsIn(['true', 'false'])
  includeArchived?: 'true' | 'false';
}
