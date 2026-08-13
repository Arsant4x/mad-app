import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const MIGRATIONS = join(__dirname, '..', '..', 'prisma', 'migrations');

/**
 * حارس: **جدولٌ محميّ بـRLS لا يُقرأ خارج سياق المستأجر**.
 *
 * ## الحادثة التي ولّدته (2026-08-13)
 *
 * قرأتُ `business_activities` بـ`this.prisma` — خارج السياق — في **ثلاثة
 * مواضع**: `TenantGuard` و`PermissionsService` و`PrimaryActivityService`.
 * والجدول عليه `RLS ENABLE + FORCE`، فعادت القراءة **فارغةً بنجاح**: لا
 * خطأ ولا تحذير ولا صفٌّ واحد.
 *
 * والأثر أن `sectors` صارت خاوية، و`screensFor([])` تُرجع **الكل** —
 * **فتعطّل الترشيح كلّه بصمت**. أي أن الميزة كانت مبنيّةً ومحروسةً
 * بـ220 اختباراً، **ولا تعمل**.
 *
 * ⚠️ ولم يمسكها شيءٌ من الـ220: كلها نصّية أو نقيّة، ولا واحدة تلمس
 * قاعدة. **الاختبار الحيّ وحده كشفها** — وهو الدليل العملي على أن الحارس
 * النصّي يقول «مكتوبةٌ كذلك» لا «تعمل كذلك».
 *
 * ## ما يفعله
 *
 * يقرأ **الترحيلات** ليعرف أي الجداول محميّة (لا قائمةً مكتوبة يدوياً)،
 * ثم يفحص كل موضعٍ يقرأ أياً منها عبر `this.prisma` مباشرةً.
 */

/** أسماء الجداول التي عليها RLS — **مقروءةً من الترحيلات لا مكتوبة**. */
function rlsTables(): Set<string> {
  const out = new Set<string>();
  for (const dir of readdirSync(MIGRATIONS)) {
    const file = join(MIGRATIONS, dir, 'migration.sql');
    let sql: string;
    try {
      sql = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const m of sql.matchAll(/ALTER TABLE "(\w+)" ENABLE ROW LEVEL SECURITY/g)) out.add(m[1]);
  }
  return out;
}

/**
 * `business_activities` ⇒ `businessActivity` — اسم النموذج في Prisma.
 *
 * ⚠️ **و`ies` ⇒ `y` قبل حذف الجمع.** صياغةٌ أولى حذفت `s` وحدها فأعطت
 * `businessActivitie` — اسمٌ لا يطابق شيئاً أبداً، **فكان الحارس سيفوّت
 * المخالفة التي بُني لها بعينها**. أمسكه فحص الاشتقاق أسفله وحده.
 */
const toModel = (table: string) =>
  table
    .replace(/ies$/, 'y')
    .replace(/s$/, '')
    .replace(/_(\w)/g, (_, c: string) => c.toUpperCase());

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.ts$/.test(name) && !/\.spec\.ts$/.test(name)) out.push(full);
  }
  return out;
}

describe('جدولٌ محميّ بـRLS لا يُقرأ خارج سياق المستأجر', () => {
  const tables = rlsTables();
  const files = walk(SRC);

  it('يقرأ الترحيلات والملفات فعلاً — حارسٌ على قائمةٍ فارغة ليس حارساً', () => {
    // الفخّ الذي أوقعنا مرّتين: مسارٌ خاطئ يعطي صفر مدخلات فيمرّ الفحص
    // بنجاحٍ تامّ وهو لم يفحص شيئاً.
    expect(tables.size).toBeGreaterThan(5);
    expect(tables.has('business_activities')).toBe(true);
    expect(files.length).toBeGreaterThan(50);
  });

  /**
   * ⚠️ **دَينٌ قائم سابقٌ لهذا العمل — مُعلَنٌ لا مُستثنى.**
   *
   * أربعة مواضع تقرأ جداول محميّة خارج السياق، وُجدت حين بُني هذا الحارس
   * (2026-08-13). **ولم تُفحص**: قد تكون مقصودة (وضع الدعم عابرٌ للمستأجرين
   * بطبعه) وقد تكون العطب نفسه الذي أصابني.
   *
   * ولم أُصلحها: هي خارج بندي، وإصلاحُ خدمةٍ لا أفهم قيودها أخطر من
   * تركها مرئية. **بندُ متابعة للمالك.**
   *
   * والقائمة **سقّاطة**: الحارس يمنع أن تزيد، ولا يُسكت ما فيها. فما يُضاف
   * غداً يسقط، وما هنا يبقى مرئياً حتى يُحسم.
   */
  const KNOWN_DEBT = [
    'audit/audit.service.ts ⟵ this.prisma.auditLog',
    'deletion-requests/deletion-requests.service.ts ⟵ this.prisma.accountDeletionRequest',
    'support-access/support-access.service.ts ⟵ this.prisma.supportAccessGrant',
    'support-access/support-access.service.ts ⟵ this.prisma.supportAccessLog',
  ];

  it('⭐ لا `this.prisma.<نموذج محميّ>` جديد — والدَّين القائم لا يزيد', () => {
    // `runInTenantContext` يضع `app.company_id` قبل الاستعلام؛ وبدونه
    // تعود السياسة بمجموعةٍ فارغة **بنجاح** — و«لا صفوف» و«لم أرَ شيئاً»
    // يبدوان سواء.
    const models = [...tables].map(toModel);
    const found: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((l) => !/^\s*\/\//.test(l))
        .join('\n');
      for (const model of models) {
        if (new RegExp(`this\\.prisma\\.${model}\\b`).test(src)) {
          found.push(`${file.slice(SRC.length + 1).split('\\').join('/')} ⟵ this.prisma.${model}`);
        }
      }
    }
    // الجديد وحده يُسقط — والدَّين المُعلَن يبقى مرئياً في هذا الملف.
    expect(found.filter((f) => !KNOWN_DEBT.includes(f))).toEqual([]);
  });

  it('⭐ والدَّين المُعلَن ما زال قائماً — فلا يُنسى بعد إصلاحه', () => {
    // سقّاطةٌ من الجهة الأخرى: إن أُصلح أحدها، يسقط هذا الفحص فتُحذف
    // سطره من القائمة عن علم — لا تبقى القائمة تصف ماضياً انتهى.
    const models = [...tables].map(toModel);
    const found = new Set<string>();
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      for (const model of models) {
        if (new RegExp(`this\\.prisma\\.${model}\\b`).test(src)) {
          found.add(`${file.slice(SRC.length + 1).split('\\').join('/')} ⟵ this.prisma.${model}`);
        }
      }
    }
    expect(KNOWN_DEBT.filter((d) => !found.has(d))).toEqual([]);
  });

  it('⭐ والاشتقاق يعمل: `business_activities` ⇒ `businessActivity`', () => {
    // حارسٌ للحارس: اشتقاقٌ خاطئ للاسم يجعل النمط لا يطابق شيئاً أبداً،
    // فيمرّ الفحص على كل مخالفة.
    expect(toModel('business_activities')).toBe('businessActivity');
    expect(toModel('delegation_logs')).toBe('delegationLog');
    expect(toModel('invoices')).toBe('invoice');
  });
});
