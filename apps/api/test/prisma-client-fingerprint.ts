import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Prisma } from '@mad-app/db';

/**
 * ⭐ **عميلُ Prisma يُنسب إلى فرعه — أو تسقط الحزمةُ باسم الحقل** (`ق-٤١٧` · `ق-٤٢١`).
 *
 * ── العطل القائم الذي بُني له ────────────────────────────────────────────
 *
 * `node_modules` **واحدٌ لأربعٍ وخمسين شجرة**، **والعميلُ المُولَّد لا يحمل ما
 * يُنسبه إلى فرعه**. ⇒ **فتوليدٌ على فرعٍ يكسر فرعاً آخر بلا أثرٍ في `git`**:
 * الشجرةُ نظيفة والعطلُ قائم. **وقع ثلاث مرّاتٍ في يومٍ واحد**، آخرُها بذرةُ
 * القاعدة النظيفة تسقط بـ`column: 'creditLimitHardBlock'` **على فرعٍ لا يعرفه**.
 *
 * ── ولماذا يُقرأ الأثرُ المُولَّد لا نصُّه ───────────────────────────────
 *
 * ⛔ **الفحصُ النصّيُّ سقط بالقياس قبل أن يُقترَح**: `node_modules/.prisma/client/schema.prisma`
 * **نسخةٌ مُنسَّقة لا حرفية** — **٤٧٩ سطراً تختلف بالمحاذاة وحدها** على فرعٍ
 * **لا يمسّ المخطّط**. **فمقارنةُ النصّ حمراءُ دائماً، وتسويةُ الفراغات تجعلها
 * عمياء عن تغييرٍ حقيقيّ.**
 *
 * ⇒ **فيُقرأ `Prisma.dmmf`** — **الأثرُ المُولَّد نفسُه**: لا تنسيقَ يخدعه،
 * **ويرى الصنفَ الذي وقع ثلاثاً** (حقلٌ في المخطّط لا يعرفه العميل).
 *
 * ── وحدُّه معلَنٌ ولا يُدّعى أكثر منه ────────────────────────────────────
 *
 * ⚠️ **يرى ما يصل `dmmf`**: **النماذجَ والحقولَ**. **ولا يرى** تعليقاً، ولا
 * ترتيباً، ولا فهارس، ولا تغييرَ نوعٍ لا يظهر في اسم الحقل. **وذلك كافٍ لهذا
 * العطل، ولا يُدّعى أكثر.**
 *
 * ── واتّجاهٌ واحد عمداً ──────────────────────────────────────────────────
 *
 * ⚠️ **يُدان ما في المخطّط ولا يعرفه العميل** — **لا العكس**: عميلٌ يحمل حقلاً
 * زائداً (فرعٌ أحدث) **لا يكسر شيئاً**، **وحقلٌ ناقص يكسر كلَّ ما يمسّه**.
 * **وإدانةُ الاتجاهين تُسقط الحزمةَ على فرعٍ سليمٍ متأخّر** — وهو ضجيجٌ يُعطَّل.
 */
const SCHEMA = join(__dirname, '..', 'prisma', 'schema.prisma');

/** حقولُ كل نموذجٍ **كما يعلنها المخطّط** — تُقرأ من الملفّ لحظتَها. */
export function schemaModels(text: string): Map<string, Set<string>> {
  const models = new Map<string, Set<string>>();
  // ⚠️ **التعليقاتُ تُجرَّد أولاً**: مثالٌ في تعليقٍ ليس حقلاً — وقد أدان
  //    نظيرُ هذا السليمَ ثلاث مرات (`ق-٣٧٥`).
  const clean = text.replace(/\/\/\/?[^\n]*/g, '');
  for (const block of clean.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const fields = new Set<string>();
    for (const line of block[2].split('\n')) {
      // اسمُ الحقل أوّلُ كلمةٍ يتبعها نوع؛ و`@@` توجيهُ نموذجٍ لا حقل.
      const m = /^\s*(\w+)\s+\w/.exec(line);
      if (m && !line.trimStart().startsWith('@@')) fields.add(m[1]);
    }
    models.set(block[1], fields);
  }
  return models;
}

/** حقولُ كل نموذجٍ **كما يعرفها العميلُ المُولَّد**. */
export function clientModels(dmmf: typeof Prisma.dmmf): Map<string, Set<string>> {
  return new Map(dmmf.datamodel.models.map((m) => [m.name, new Set(m.fields.map((f) => f.name))]));
}

/** ما يعلنه المخطّط ولا يعرفه العميل — **وهو وحده ما يُدان**. */
export function clientDrift(schema: Map<string, Set<string>>, client: Map<string, Set<string>>): string[] {
  const missing: string[] = [];
  for (const [model, fields] of schema) {
    const known = client.get(model);
    if (!known) {
      missing.push(model);
      continue;
    }
    for (const field of fields) if (!known.has(field)) missing.push(`${model}.${field}`);
  }
  return missing.sort();
}

/**
 * يُسقط الحزمةَ **بسطرٍ يسمّي العلاج** حين يكون العميلُ من فرعٍ آخر.
 *
 * ⚠️ **والرسالةُ تسمّي الحقلَ لا «تفاوتاً»**: بذرةٌ تنهار بعد دقيقتين برسالةِ
 * `Prisma` الخام **تُقرأ عطلاً في الشيفرة**، **وسطرٌ يقول `npx prisma generate`
 * يُنهي البحثَ قبل أن يبدأ**.
 */
export function assertClientMatchesSchema(): void {
  const drift = clientDrift(schemaModels(readFileSync(SCHEMA, 'utf8')), clientModels(loadClientDmmf()));
  if (drift.length === 0) return;
  const shown = drift.slice(0, 8).join(' · ');
  throw new Error(
    [
      '',
      '⛔ عميلُ Prisma المُولَّد لا يعرف ما يعلنه مخطّطُ هذا الفرع (ق-٤١٧):',
      `   ${shown}${drift.length > 8 ? ` … و${drift.length - 8} غيرها` : ''}`,
      '',
      '   والسبب (بعد ب٢ — ق-١٥٠٤): العميلُ لكلّ نسخةٍ داخلها، فتغيّرُ المخطّط في هذه النسخة',
      '   لم يتبعه توليدٌ فيها — لا نسخةٌ أخرى.',
      '',
      '   العلاج (من apps/api):  npx prisma generate',
      '',
    ].join('\n'),
  );
}

/**
 * ⚖️ (`ق-١٥٠٤` — ب٢) **العميلُ يُحمَّل عند الحاجة لا في رأس الملف**: فإن غاب (`npm ci` يمحو `apps/api/node_modules` —
 * مقيسٌ على npm 11.16.0 — أو نسخةٌ لم يُولَّد فيها بعد) سقطت الحزمةُ **برسالةٍ تسمّي العلاج** لا بـ`MODULE_NOT_FOUND` خام
 * يُقرأ عطلاً في الشيفرة. وغيرُ الغياب يُرمى كما هو.
 */
function loadClientDmmf(): typeof Prisma.dmmf {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('@mad-app/db') as { Prisma: typeof Prisma }).Prisma.dmmf;
  } catch (e) {
    if ((e as { code?: string }).code !== 'MODULE_NOT_FOUND') throw e;
    throw new Error(
      [
        '',
        '⛔ عميلُ Prisma غيرُ مولَّدٍ في هذه النسخة (`@mad-app/db` — ق-١٥٠٤):',
        '   العميلُ لكلّ نسخةٍ داخلها (apps/api/node_modules/@mad-app/db)، و`npm ci` يمحوه.',
        '',
        '   العلاج (من apps/api):  npx prisma generate',
        '',
      ].join('\n'),
    );
  }
}
