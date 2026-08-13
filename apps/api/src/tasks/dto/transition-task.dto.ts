import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { TASK_STATUSES } from '../task-model';

/** الحالة من القائمة المغلقة **مقروءةً من مصدرها** — لا نصّ حر. */
export class TransitionTaskDto {
  @IsIn(TASK_STATUSES as readonly string[])
  to!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
