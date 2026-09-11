import { IsIn, IsInt, IsISO8601, IsOptional, IsString, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { ALLOWED_SCREENS } from '../../templates/screens';
import { TASK_PRIORITIES } from '../task-model';

/**
 * ⚠️ `targetScreen` من `ALLOWED_SCREENS` **مقروءةً لا منسوخة**.
 *
 * `TaskEntityType` في `task-model.ts` مشتقٌّ منها أصلاً، وقائمةٌ منسوخة هنا
 * تفترق عنها عند أول شاشة جديدة — وهي عائلة الخمسة عشر اسماً المخترَعة.
 */
export class CreateTaskDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @IsString()
  assigneeId!: string;

  @IsOptional()
  @IsIn(ALLOWED_SCREENS as readonly string[])
  targetScreen?: string;

  /** الرابطة كلٌّ أو لا شيء — والقيد في القاعدة يمسك ما لا يمرّ هنا. */
  @ValidateIf((o: CreateTaskDto) => o.targetScreen != null)
  @IsString()
  targetId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  /** الأولوية من القائمة المغلقة **مقروءةً من نوع القاعدة** (`SPEC 14.2`) — والافتراضُ عادي. */
  @IsOptional()
  @IsIn(TASK_PRIORITIES as readonly string[])
  priority?: string;

  /** القسمُ المختصّ (`SPEC 1.11`) — نصٌّ حرّ قصير. */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  department?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  recurEveryDays?: number;

  @IsOptional()
  @IsISO8601()
  dueAnchor?: string;
}
