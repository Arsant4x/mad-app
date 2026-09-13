import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * `ق-٦٩٥` — **هجرةٌ تكتب بياناتٍ تُعلن ما فعلته بـ`RAISE WARNING` — و`RAISE NOTICE` ممنوعٌ في الهجرات.**
 *
 * الواقعة (بروفةُ الترقية 2026-09-13 · `ق-٦٨٩` · `ق-٦٩١`): الهجرتان العادّتان (`ق-٦٥١` · `ق-٦٦٦`)
 * صرختا بالعدّ عند النجاح بـ`RAISE NOTICE` — **ولم يصل حرفٌ منه إلى سجلّ الحاوية ولا إلى سجلّ
 * القاعدة**: `Prisma` لا يطبع `NOTICE`، وسجلُّ القاعدة يقف عند `warning`. فما «صرختا به»
 * استُدلّ عليه **بالأثر** (`6 → 0` · `7` معبَّأة) — **وذاك يعمل حين نعرف ما نتوقّع**؛ وهجرةٌ قادمة
 * قد تصرخ بما لا نتوقّعه فلا يُرى. **فهجرةٌ «تصرخ» ولا يسمعها أحدٌ لا تصرخ.**
 *
 * **القاعدة (قرار المالك — التوجيه ١٥٢)**: `RAISE WARNING` بدل `NOTICE`، **ويُعمَّم على كلِّ هجرةٍ
 * تكتب بيانات لا القادمة وحدها**:
 *   ① لا `RAISE NOTICE` في هجرةٍ قطّ — ما يُقال بـ`NOTICE` يُقال لا أحد.
 *   ② كلُّ هجرةٍ تكتب بيانات (`UPDATE … SET` · `INSERT INTO` · `DELETE FROM` خارج أجسام الدوالّ)
 *      تحمل `RAISE WARNING` واحداً على الأقلّ — تُعلن به ما فعلته.
 *   ③ والمطبَّقةُ الصامتةُ قبل القاعدة **تُسمّى بالاسم** في `SILENT_APPLIED` — قائمةٌ **تنقص ولا
 *      تزيد**: من يُضيف إليها هجرةً جديدة يُسقط الحارس، ومن يُبقي فيها هجرةً صارت تُعلن يُسقطه أيضاً.
 *
 * **مشتقٌّ لا قائمة**: الهجراتُ التي تكتب بيانات تُستخرج **من نصّها** لا من جدول — فهجرةٌ جديدة تكتب
 * بياناتٍ غداً تدخل الحراسةَ بلا لمس هذا الملفّ.
 *
 * **حدُّه المعلَن**: يقرأ النصَّ لا يُحلّل `SQL`. يُجرَّد التعليقُ، وتُحذف أجسامُ `CREATE FUNCTION`
 * (`DML` المشغِّلات يقع وقتَ التطبيق لا وقتَ الهجرة) — و`ON UPDATE`/`ON DELETE` في القيود ليست كتابة.
 * `DML` يُبنى نصُّه ديناميكياً (`EXECUTE format(…)`) لا يراه — ويُوسَّع بالإشارات عند التغيير.
 * **والكاشفُ مُثبَتٌ بحالتين معلومتين أدناه** — كاشفٌ لا يمسك الحالةَ المعروفة أعمى.
 */
const MIGRATIONS = join(__dirname, '..', '..', 'prisma', 'migrations');

/**
 * ⚠️ **تنقص ولا تزيد**: هجراتٌ مطبَّقةٌ على المنشور (`2026-09-13`) تكتب بياناتٍ **بلا إعلان** — قُرئت من
 * نصّها بالكاشف نفسِه يومَ كُتب الحارس. لا تُضاف إليها هجرةٌ بعد اليوم؛ وتُحذف منها كلُّ هجرةٍ تُعدَّل لتُعلن.
 */
export const SILENT_APPLIED: readonly string[] = [
  '20260719231124_journal',
  '20260803120000_structural_wave',
  '20260904010000_purchase_category_code',
  '20260905030000_egs_units',
  '20260907040000_cash_drawer',
  '20260907120000_bank_account_link',
  '20260910120000_installment_service_period',
  '20260910140000_installment_recognized_base',
  '20260911100000_support_log_actor',
  '20260911110000_support_survives_company_deletion',
  '20260911150000_deletion_request_survives_company_deletion',
  '20260912110000_task_assignee_kind',
];

export interface MigrationFile {
  name: string;
  sql: string;
}

/** ملفّاتُ الهجرات بترتيبها الزمنيّ — الاسمُ يبدأ بطابعٍ زمنيّ فالفرزُ نصّيّ. */
export function migrationFiles(dir = MIGRATIONS): MigrationFile[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name, 'migration.sql'), 'utf8') }));
}

/** التعليقُ يُجرَّد قبل كل قراءة — شرحٌ يذكر `NOTICE` أو `UPDATE` ليس تنفيذاً. */
export const stripSqlComments = (sql: string): string =>
  sql
    .split(/\r?\n/)
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');

/** أجسامُ الدوالّ تُحذف: `DML` فيها يقع وقتَ تشغيل المشغِّل لا وقتَ الهجرة. كتلُ `DO $$` تبقى — فالتعبئةُ فيها. */
export const stripFunctionBodies = (sql: string): string =>
  sql.replace(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION[\s\S]*?\$\$[\s\S]*?\$\$/gi, 'CREATE FUNCTION <body>');

/** هل يحمل النصُّ `RAISE NOTICE`؟ (بعد تجريد التعليق.) */
export const hasRaiseNotice = (sql: string): boolean => /\bRAISE\s+NOTICE\b/i.test(stripSqlComments(sql));

/** هل يحمل النصُّ `RAISE WARNING`؟ */
export const hasRaiseWarning = (sql: string): boolean => /\bRAISE\s+WARNING\b/i.test(stripSqlComments(sql));

/** عباراتُ الكتابة في الهجرة — خارج أجسام الدوالّ، ولا تُحسب `ON UPDATE`/`ON DELETE` في القيود. */
export function dataWrites(sql: string): string[] {
  const code = stripFunctionBodies(stripSqlComments(sql));
  const found: string[] = [];
  for (const m of code.matchAll(/(?<!\bON\s)\bUPDATE\s+"?([A-Za-z_][A-Za-z0-9_]*)"?(?:\s+[a-z][a-z0-9_]*)?\s+SET\b/g)) found.push(`UPDATE ${m[1]}`);
  for (const m of code.matchAll(/\bINSERT\s+INTO\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/g)) found.push(`INSERT ${m[1]}`);
  for (const m of code.matchAll(/(?<!\bON\s)\bDELETE\s+FROM\s+"?([A-Za-z_][A-Za-z0-9_]*)"?/g)) found.push(`DELETE ${m[1]}`);
  return found;
}

describe('الهجراتُ تُعلن بـRAISE WARNING لا NOTICE — وكلُّ هجرةٍ تكتب بياناتٍ تُعلن (ق-٦٩٥)', () => {
  const files = migrationFiles();

  it('⓪ حارسٌ على المجسّ: الهجراتُ قُرئت فعلاً وفيها الهجرتان العادّتان', () => {
    expect(files.length).toBeGreaterThan(100);
    const names = files.map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(['20260912130000_companies_off_system_template', '20260912150000_identity_company']));
  });

  // ⭐ الإثباتُ العكسيّ مبنيٌّ في الحارس: كاشفٌ لا يمسك الحالةَ المعروفة أعمى.
  it('الكاشفُ مُثبَتٌ بحالتين: يمسك NOTICE ويترك WARNING · يرى كتابةً في DO ولا يرى كتابةً داخل دالّة مشغِّل ولا ON UPDATE', () => {
    expect(hasRaiseNotice(`DO $$ BEGIN RAISE NOTICE 'x'; END $$;`)).toBe(true);
    expect(hasRaiseNotice(`-- RAISE NOTICE في تعليقٍ لا يُحسب\nDO $$ BEGIN RAISE WARNING 'x'; END $$;`)).toBe(false);
    expect(hasRaiseWarning(`DO $$ BEGIN RAISE WARNING 'ق: عُبّئ % صفّاً', n; END $$;`)).toBe(true);

    expect(dataWrites(`DO $$ BEGIN UPDATE "companies" c SET "x" = 1; END $$;`)).toEqual(['UPDATE companies']);
    expect(dataWrites(`UPDATE "accounts" SET "balance" = "openingBalance";`)).toEqual(['UPDATE accounts']);
    expect(dataWrites(`INSERT INTO "cash_drawers" ("id") SELECT 1;`)).toEqual(['INSERT cash_drawers']);
    expect(
      dataWrites(`CREATE OR REPLACE FUNCTION f() RETURNS trigger AS $$ BEGIN DELETE FROM login_identities WHERE id = OLD.id; RETURN OLD; END $$ LANGUAGE plpgsql;`),
    ).toEqual([]);
    expect(dataWrites(`ALTER TABLE "a" ADD CONSTRAINT "a_fk" FOREIGN KEY ("b") REFERENCES "b"("id") ON DELETE CASCADE ON UPDATE CASCADE;`)).toEqual([]);
    expect(dataWrites(`CREATE TRIGGER t AFTER INSERT OR UPDATE OF "companyId" ON "company_users" FOR EACH ROW EXECUTE FUNCTION f();`)).toEqual([]);
  });

  it('⭐ ① لا RAISE NOTICE في هجرةٍ قطّ — ما يُقال بـNOTICE يُقال لا أحد', () => {
    const offenders = files.filter((f) => hasRaiseNotice(f.sql)).map((f) => f.name);
    expect(offenders).toEqual([]);
  });

  it('⭐ ② كلُّ هجرةٍ تكتب بيانات تُعلن بـRAISE WARNING — إلا المطبَّقةَ الصامتةَ المسمّاةَ بالاسم', () => {
    const silent = files
      .filter((f) => dataWrites(f.sql).length > 0 && !hasRaiseWarning(f.sql))
      .map((f) => f.name)
      .filter((name) => !SILENT_APPLIED.includes(name));
    expect(silent).toEqual([]);
  });

  it('③ القائمةُ المسمّاة تنقص ولا تزيد: كلُّ اسمٍ فيها موجودٌ ويكتب بياناتٍ ولا يزال صامتاً', () => {
    const stale: string[] = [];
    for (const name of SILENT_APPLIED) {
      const f = files.find((x) => x.name === name);
      if (!f) stale.push(`${name}: لا هجرةَ بهذا الاسم`);
      else if (dataWrites(f.sql).length === 0) stale.push(`${name}: لا تكتب بيانات — تُحذف من القائمة`);
      else if (hasRaiseWarning(f.sql)) stale.push(`${name}: صارت تُعلن — تُحذف من القائمة`);
    }
    expect(stale).toEqual([]);
    // ولا اسمَ بعد يوم القاعدة: ما يُضاف بعد 2026-09-13 يُعلن ولا يُسمّى.
    expect(SILENT_APPLIED.filter((n) => n > '20260913')).toEqual([]);
  });

  it('الهجرتان العادّتان تُعلنان بـWARNING — السطران اللذان لم يسمعهما أحد', () => {
    for (const name of ['20260912130000_companies_off_system_template', '20260912150000_identity_company']) {
      const f = files.find((x) => x.name === name);
      expect(f && hasRaiseWarning(f.sql)).toBe(true);
      expect(f && hasRaiseNotice(f.sql)).toBe(false);
    }
  });
});
