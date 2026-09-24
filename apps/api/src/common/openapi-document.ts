import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { API_VERSION_PREFIX } from './versioning';

/**
 * **وثيقةُ الواجهة البرمجية — مصدرٌ واحد** (`ق-١٢٩١` · ي/⑫A2).
 *
 * كانت تُبنى في `main.ts` وحدَه. فحارسُ العقد لو بناها بنفسه قارن **وثيقةً أخرى** —
 * وحارسٌ يقيس غيرَ ما يُنشَر يشهد بما لم يفحص (`§8.5`). فصارت دالّةً واحدة يستدعيها
 * الإقلاعُ والحارسُ والسكربت.
 *
 * ⚠️ **والترتيبُ جزءٌ من العقد**: تُبنى **بعد** `applyApiVersioning` كي تحمل المسارات
 * إصدارَها — وهي في `main.ts` بعده فعلاً.
 *
 * ⚖️ **البابُ المحايد خارجَ الوثيقة** (`ق-١٣٨٢` · خطّةُ الأنواع ①): الخادمُ يُجيب `/v1/x` و`/x` معاً
 * (`versioning.ts`)، والمستندُ **بابٌ واحد**. كان يحمل الاثنين — `716` عمليةً بـ`358` معرّفاً، **كلُّ
 * مسارٍ مرّتان** — فمولِّدٌ مفهرسٌ بالمعرّف يتصادم، والنوعُ يُولَّد مرّتين. **والبابُ المحايد يبقى
 * مخدوماً** (حزمُنا تطرقه — `playwright` و`registerIsolatedCompany`) **ولا يُوثَّق**؛ وإسقاطُه قرارٌ مستقلّ.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Mad App API')
    .setDescription('Multi-tenant accounting / real-estate / HR / inventory platform')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  return versionedDocument(SwaggerModule.createDocument(app, config), API_VERSION_PREFIX);
}

/**
 * **مساراتُ الإصدار وحدَها** — نقيّةٌ كي تُثبَت بلا بناء. ما لا يبدأ بـ`/<الإصدار>/` يُسقَط من
 * `paths` (ومخطّطاتُ الأجسام في `components` مشتركةٌ بين البابين فلا يُسقَط منها شيء).
 */
export function versionedDocument(doc: OpenAPIObject, prefix: string): OpenAPIObject {
  const head = `/${prefix}/`;
  const paths = Object.fromEntries(Object.entries(doc.paths ?? {}).filter(([path]) => path.startsWith(head)));
  return { ...doc, paths };
}
