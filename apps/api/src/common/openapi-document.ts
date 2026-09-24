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
  return arrayEnumsInItems(versionedDocument(SwaggerModule.createDocument(app, config), API_VERSION_PREFIX));
}

/** ما يلزم من مخطَّطِ خاصّيةٍ هنا — `SchemaObject` لا يُصدَّر من جذر `@nestjs/swagger`. */
interface PropertySchema {
  type?: string;
  enum?: unknown[];
  items?: PropertySchema;
  properties?: Record<string, PropertySchema>;
}

/**
 * ⚖️ **التعدادُ في المصفوفة مكانُه عناصرُها** (`ق-١٤٠٤` · ③).
 *
 * المُلحَقُ يقرأ `@IsIn(…, { each: true })` تعداداً **على مستوى الخاصّية**، ويدمجه فوق ما يعلنه
 * `@ApiProperty({ enum, isArray: true })` (يملأ المفتاحَ الغائب ولا يطغى — `createPropertyDecorator`) — فتخرج
 * `{ type: 'array', enum, items: { enum } }`: مصفوفةٌ «قيمتُها واحدةٌ من النصوص»، وهو تناقضٌ يقرؤه المستهلكُ
 * الخارجيّ والمولِّدُ معاً. فيُنقل التعدادُ إلى `items` عند الباب — ويُسقَط إن حملت `items` تعدادَها (المعلَنُ يغلب).
 * نقيّةٌ على الوثيقة كي تُثبَت بلا بناء.
 */
export function arrayEnumsInItems(doc: OpenAPIObject): OpenAPIObject {
  const schemas = doc.components?.schemas as Record<string, PropertySchema> | undefined;
  if (!schemas) return doc;
  const fixed = Object.fromEntries(
    Object.entries(schemas).map(([name, schema]) => {
      if (!schema.properties) return [name, schema];
      const properties = Object.fromEntries(
        Object.entries(schema.properties).map(([key, prop]) => {
          if (prop.type !== 'array' || !prop.enum) return [key, prop];
          const { enum: values, ...rest } = prop;
          const items = prop.items ?? {};
          return [key, { ...rest, items: items.enum ? items : { ...items, enum: values } }];
        }),
      );
      return [name, { ...schema, properties }];
    }),
  );
  return { ...doc, components: { ...doc.components, schemas: fixed as never } };
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
