import { IntegrationKind } from '@prisma/client';
import { IsBoolean, IsIn, IsObject, IsOptional, IsString } from 'class-validator';

/**
 * ⚖️ `ق-١٣٨٣` — **في ملفّ `.dto.ts` لا في المتحكّم**: مُلحَقُ `@nestjs/swagger` يقرأ هذه اللاحقةَ وحدَها
 * (`nest-cli.json`)، فالصنفان في المتحكّم كانا يُولَّدان في الوثيقة **مخطَّطَين بلا خاصيّة** — والحقولُ إلزاميةٌ وقتَ التشغيل أصلاً.
 */
export class CreateIntegrationDto {
  @IsIn(['PAYMENT_GATEWAY', 'BNPL', 'ECOMMERCE'])
  kind!: IntegrationKind;

  @IsString()
  provider!: string;

  @IsOptional()
  @IsString()
  label?: string;

  /** {apiKey: '...', merchantId: '...'} — تُشفَّر فور الوصول ولا تُقرأ ثانيةً. */
  @IsObject()
  credentials!: Record<string, string>;
}

export class SetEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}
