import { INestApplication, VERSION_NEUTRAL, VersioningType } from '@nestjs/common';

/**
 * **الإصدارُ في المسار — `/v1/x` و`/x` معاً** (`ق-١٢٨٦` · ي/⑫A1).
 *
 * ## لماذا قبل أوّل مستهلكٍ خارجيّ
 *
 * سطحُ الواجهة اليوم **بلا إصدار**: `POST /invoices` هو العنوانُ كلُّه (`63` موضعَ
 * `@Controller`، **ولا واحدٌ منها يُعلن `version`**). فأوّلُ مستهلكٍ خارجيّ — تكاملُ
 * تاجرٍ أو مفتاحُ نظام — **يعتمد على مسارٍ لا يحمل تعهّداً**، وأيُّ تغييرٍ بعده يكسره
 * بلا سابق إنذار. **والإصدارُ يُضاف قبله لا بعده**: إضافتُه بعد أن يعتمد أحدٌ على
 * `/invoices` تعني كسرَه، أو حملَ المسارين إلى الأبد بلا قرار.
 *
 * ## والصياغةُ: البابان معاً مدّةً معلَنة
 *
 * `defaultVersion: ['1', VERSION_NEUTRAL]` تجعل كلَّ متحكّمٍ يُجيب على **`/v1/x` و`/x`**
 * معاً. **والترتيبُ في المصفوفة لا أثرَ له** — مقروءاً من `@nestjs/core@10.4.22`
 * (`router/route-path-factory.js`): المصفوفةُ تُبنى **مساراً لكلِّ إصدار**،
 * و`VERSION_NEUTRAL` يُبنى بلا بادئة، والمساران مختلفان فلا يبتلع أحدهما الآخر.
 *
 * ⚠️ **والبابُ المحايد ليس ترفاً اليوم**: `playwright` يطرق `/auth/login` و`/delegations`
 * بمساراتٍ عارية، **وكلُّ حزمةِ `e2e` عندنا** تطرق `/auth/register` عبر
 * `registerIsolatedCompany`. **فإسقاطُه اليوم يكسر حزمَنا نحن قبل أن يكسر أحداً** —
 * ولذلك يبقى، ويُسقَط بقرارٍ مستقلٍّ حين يوجد مستهلكٌ خارجيّ فعلاً.
 *
 * ⚖️ **والبابُ المحايد مخدومٌ لا موثَّق** (`ق-١٣٨٢`): وثيقةُ الواجهة (`openapi-document.ts`) تحمل بابَ
 * الإصدار وحدَه — فالمولِّدُ يرى كلَّ مسارٍ مرّةً بمعرّفٍ فريد، وهذا الملفُّ يبقى كما هو.
 *
 * ⚠️ **وهي دالّةٌ مُصدَّرة لا سطرٌ في `main.ts`** — كي **يُثبَت آلياً أنها تعمل**: حزمةٌ
 * حيّة تُنشئ تطبيقَها وتستدعيها وتطرق البابين. فسطرٌ في `main.ts` وحدَه لا يمرّ به أيُّ
 * اختبار (`main.ts` لا يُشغَّل في الحزم)، وحارسٌ نصّيٌّ عليه يقول «مكتوبة» ولا يقول
 * «تعمل» (`§8.5`) — ولذلك الحارسان معاً: الطرقُ يُثبت العمل، والنصُّ يُثبت الوصل.
 */
export function applyApiVersioning(app: INestApplication): void {
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: ['1', VERSION_NEUTRAL] });
}

/** البادئةُ التي تُعلنها الواجهةُ والوثائق — مصدرٌ واحد لا نصٌّ مكرَّر. */
export const API_VERSION_PREFIX = 'v1';

/**
 * The request path without its leading URI version segment, so `/v1/customers/1` and
 * `/customers/1` name the same route wherever the path is read for meaning.
 */
export function withoutVersionPrefix(path: string): string {
  return path.replace(/^\/v\d+(?=\/|$)/, '') || '/';
}
