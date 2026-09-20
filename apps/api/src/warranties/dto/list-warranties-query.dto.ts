import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { PagedQueryDto } from '../../common/dto/paged-query.dto';

/** `GET /warranties` — ترشيحٌ بالعقار كما كان (نصٌّ بلا تحقّقِ شكل) مع الترقيم بالاختيار (`ق-١٢٣٦`). */
export class ListWarrantiesQueryDto extends PagedQueryDto {
  @IsOptional()
  @IsString()
  propertyId?: string;
}

/**
 * `GET /warranties/cover` — ما يغطّي موقعاً في يوم: العقارُ **واجب** (كان يُقرأ بـ`@Query('propertyId')`
 * بلا تحقّق فيمرّ فارغاً إلى الخدمة)، والوحدةُ والتاريخُ اختياريان كما كانا.
 */
export class CoverQueryDto extends PagedQueryDto {
  @IsString()
  @IsNotEmpty()
  propertyId!: string;

  @IsOptional()
  @IsString()
  unitId?: string;

  @IsOptional()
  @IsString()
  date?: string;
}
