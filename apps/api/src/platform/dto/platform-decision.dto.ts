import { PlatformDecisionAction } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * ⚖️ `ق-١٣٨٣` — **في ملفّ `.dto.ts` لا في المتحكّم**: مُلحَقُ `@nestjs/swagger` يقرأ هذه اللاحقةَ وحدَها
 * (`nest-cli.json`)، فالصنفان في المتحكّم كانا يُولَّدان في الوثيقة **مخطَّطَين بلا خاصيّة** — والحقولُ إلزاميةٌ وقتَ التشغيل أصلاً.
 */
export class RequestDecisionDto {
  @IsIn(Object.values(PlatformDecisionAction))
  action!: PlatformDecisionAction;

  @IsString()
  @MinLength(1)
  targetId!: string;

  /** ملخّصُ الأثر كما سيقرؤه المُقرّ — **إلزاميّ**: إقرارٌ على معرّفٍ مجرَّد ليس إقراراً. */
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  summary!: string;
}

export class DecideDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
