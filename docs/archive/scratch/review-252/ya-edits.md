# تعديلاتُ ي/⑫A1 — الإصدارُ في المسار (تُطبَّق حين تتحرّر الشجرة)

## ① `apps/api/src/main.ts`

**الاستيراد** بعد `import { requestIdMiddleware } …`:

```ts
import { applyApiVersioning } from './common/versioning';
```

**والنداء** بعد `app.set('trust proxy', 1);` مباشرةً — **قبل بناء وثيقة `Swagger`**
كي تحمل الوثيقةُ المسارَ بإصداره:

```ts
  // ⭐ الإصدارُ في المسار (`ق-١٢٨٦` · ي/⑫A1): `/v1/x` و`/x` معاً — قبل بناء الوثيقة
  //    كي تحملها، وقبل أيّ مسارٍ يُسجَّل.
  applyApiVersioning(app);
```

## ② `apps/web/src/api/client.ts`

```ts
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
/**
 * ⭐ **الواجهةُ على `/v1`** (`ق-١٢٨٦`): الخادمُ يُجيب المحايدَ أيضاً **مدّةً معلَنة**،
 * والواجهةُ تُعلن إصدارَها كي لا تصير هي نفسُها المستهلكَ الذي يحبس المسارَ المحايد.
 * ولا يُمسّ `VITE_API_URL` ولا وثائقُ النشر — البادئةُ تُلحق هنا، في مكانٍ واحد.
 */
const API_BASE = `${API_URL.replace(/\/+$/, '')}/${API_VERSION_PREFIX}`;
```

وتُستعمل `API_BASE` في `apiClient` و`refreshClient` معاً.
**والبادئةُ تُستورد** من `@mad-app/shared`? ⛔ لا — `packages/shared` يحمل الصلاحيات
وحدَها؛ فتُكتب هنا ثابتاً واحداً `const API_VERSION_PREFIX = 'v1'` **مع تعليقٍ يشير
إلى مصدرها في الخادم** (`src/common/versioning.ts`) — ولا استيرادَ عبر التطبيقين.

## ③ الحارسُ الحيّ

`apps/api/test/api-versioning.e2e-spec.ts` — خمسُ مراحل (مكتوبٌ في
`review-252/api-versioning.e2e-spec.ts`).

## ④ ما يُقاس قبل البناء

- عددُ المتحكّمات وأيُّها يحمل مساراً ثابتاً يصطدم بـ`v1`.
- هل من مسارٍ في الواجهة يبني عنوانَ الخادم بنفسه خارج `client.ts` — **مقيس: لا**
  (`VITE_API_URL` في `client.ts` وحدَه).
- و`playwright` يطرق `/auth/login` مباشرةً — **يبقى عاملاً بالمحايد**.
