import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
export const MAX_SEARCH_LENGTH = 200;

/**
 * **الترقيمُ بالاختيار على نقاط القائمة** (`ق-١٢٣٦`).
 *
 * - بلا `page`: تعود **المصفوفةُ كما كانت** — فلا يُكسر مستهلكٌ قائم (`46` نداءً في الواجهة و`151`
 *   موضعاً في الاختبارات تقرأ الجسمَ مصفوفةً).
 * - مع `page`: يعود المغلَّفُ `{ items, total, page, pageSize }` — `pageSize` افتراضُه `25` وسقفُه `100`
 *   (عقدُ `contracts` القائم نفسُه).
 * - `pageSize` **بلا `page`** يُردّ `400` مسمّىً (`line 15`): مُدخَلٌ يقول شيئين لا يُختار له أحدُهما صامتاً.
 * - `search` يعمل في الحالتين، وحقولُه **تُعلَن لكل كيانٍ** في خدمته لا بحثٌ عامّ.
 *
 * والأربعةُ المرقَّمة قبل هذا (`contracts` · `inventory/movements` · `journal` · `transactions`) على
 * عقدها القائم — مغلَّفٌ دائماً — ولا تمرّ من هنا.
 */
export class PagedQueryDto {
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
  @IsString()
  @MaxLength(MAX_SEARCH_LENGTH)
  search?: string;
}
