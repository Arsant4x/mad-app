import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';

/**
 * **وثيقةُ الواجهة البرمجية — مصدرٌ واحد** (`ق-١٢٩١` · ي/⑫A2).
 *
 * كانت تُبنى في `main.ts` وحدَه. فحارسُ العقد لو بناها بنفسه قارن **وثيقةً أخرى** —
 * وحارسٌ يقيس غيرَ ما يُنشَر يشهد بما لم يفحص (`§8.5`). فصارت دالّةً واحدة يستدعيها
 * الإقلاعُ والحارسُ والسكربت.
 *
 * ⚠️ **والترتيبُ جزءٌ من العقد**: تُبنى **بعد** `applyApiVersioning` كي تحمل المسارات
 * إصدارَها (`/v1/x` و`/x` معاً) — وهي في `main.ts` بعده فعلاً.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Mad App API')
    .setDescription('Multi-tenant accounting / real-estate / HR / inventory platform')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config);
}
