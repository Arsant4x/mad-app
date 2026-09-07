import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * `ق-٢٦٢` — **ترحيلٌ يمسّ جدولاً تحته `FORCE` يرفع الحماية صراحةً ويعيدها.**
 *
 * الترحيلات تتّصل بـ`app_user`: **غيرِ خارقٍ وبلا `BYPASSRLS`**، وجداولُ المستأجر
 * تحتها `FORCE ROW LEVEL SECURITY`. وبلا `app.company_id` **تكون كلُّ الصفوف غيرَ
 * مرئية** — فالتحديثُ يمسّ صفراً، والقراءةُ في `JOIN` تعود فارغةً، **بلا خطأ ولا
 * تحذير**.
 *
 * والواقعة التي أنتجت القاعدة (2026-09-07): تعبئةُ الأدراج قرأت `branches` في
 * `LEFT JOIN` بلا رفعها، فسُمّي درجُ الفرع «درج المنشأة» **كأنه بلا فرع** — صفٌّ
 * غيرُ مرئيّ **يُقرأ صفّاً غيرَ موجود** (`§8.7` على الترحيل لا على الحارس).
 *
 * **مشتقٌّ لا قائمة**: الجداولُ المحميّة تُستخرج **من الترحيلات نفسها** (كلُّ
 * `ALTER TABLE … FORCE ROW LEVEL SECURITY`)، ومواضعُ `DML` تُقرأ من نصّ كل ملفّ.
 * فجدولٌ جديد يُحمى غداً يدخل الحراسةَ بلا لمس هذا الملفّ.
 *
 * **حدُّه المعلَن**: يقرأ النصّ لا يُحلّل `SQL`. فاسمُ جدولٍ بلا اقتباسٍ مزدوج، أو
 * استعلامٌ يبني اسمَه ديناميكياً، لا يراه — والاقتباسُ هو ما يكتبه `prisma migrate`
 * دائماً. ويُوسَّع بالإشارات لا بقائمة الجداول.
 */
const MIGRATIONS = join(__dirname, '..', '..', 'prisma', 'migrations');

export interface MigrationFile {
  name: string;
  sql: string;
}

/** ملفّاتُ الترحيل بترتيبها الزمنيّ — والاسمُ يبدأ بطابعٍ زمنيّ فالفرزُ نصّيّ. */
export function migrationFiles(dir = MIGRATIONS): MigrationFile[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name, 'migration.sql'), 'utf8') }));
}

/** يُجرَّد التعليقُ قبل كل قراءة: شرحٌ يذكر `UPDATE` ليس تنفيذاً (وقد أسقط أولَ صياغةٍ لهذا الحارس). */
export const stripSqlComments = (sql: string) =>
  sql
    .split(/\r?\n/)
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n');

/** الجداولُ التي يمسّها `DML` في هذا الملفّ — هدفاً أو مقروءةً في `FROM`/`JOIN`. */
export function dmlTables(sql: string): string[] {
  const code = stripSqlComments(sql);
  const dmlRegions = [...code.matchAll(/(?:^|\n)\s*(?:UPDATE|DELETE\s+FROM|INSERT\s+INTO)\b[\s\S]*?;/gi)].map((m) => m[0]);
  const tables = new Set<string>();
  for (const region of dmlRegions) {
    for (const m of region.matchAll(/\b(?:UPDATE|INSERT\s+INTO|DELETE\s+FROM|FROM|JOIN)\s+"([^"]+)"/gi)) tables.add(m[1]);
  }
  return [...tables];
}

/** الجداولُ التي رُفعت حمايتُها في هذا الملفّ. */
export const liftedTables = (sql: string) =>
  new Set([...stripSqlComments(sql).matchAll(/ALTER\s+TABLE\s+"([^"]+)"\s+NO\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/gi)].map((m) => m[1]));

/** والجداولُ التي فُرضت فيه (لإعادتها، أو لأنها فُرضت لأولِ مرة بعد التعبئة). */
export const forcedTables = (sql: string) =>
  new Set([...stripSqlComments(sql).matchAll(/ALTER\s+TABLE\s+"([^"]+)"\s+(?<!NO\s)FORCE\s+ROW\s+LEVEL\s+SECURITY/gi)].map((m) => m[1]));

describe('ترحيلٌ يمسّ جدولاً محمياً يرفع الحماية صراحةً ويعيدها (ق-٢٦٢)', () => {
  const files = migrationFiles();

  it('القارئ مُثبَت بحالتَين: يرى المسّ الحقيقي ولا يرى التعليق', () => {
    const real = 'UPDATE "a" SET x = 1 FROM "b" JOIN "c" ON c.id = b.id;';
    const commented = '-- UPDATE "a" SET x = 1 FROM "b";\nALTER TABLE "z" ADD COLUMN q TEXT;';
    expect(dmlTables(real).sort()).toEqual(['a', 'b', 'c']);
    expect(dmlTables(commented)).toEqual([]);
    expect([...liftedTables('ALTER TABLE "a" NO FORCE ROW LEVEL SECURITY;')]).toEqual(['a']);
    expect([...liftedTables('ALTER TABLE "a" FORCE ROW LEVEL SECURITY;')]).toEqual([]);
    expect([...forcedTables('ALTER TABLE "a" FORCE ROW LEVEL SECURITY;')]).toEqual(['a']);
  });

  it('السطح غير فارغ — ترحيلاتٌ كثيرة، وبعضُها يحمل DML', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.filter((f) => dmlTables(f.sql).length > 0).length).toBeGreaterThan(0);
  });

  it('🔴 كلُّ جدولٍ محميّ يمسّه DML — مرفوعُ الحماية في ملفّه، ومُعادةٌ بعده', () => {
    /** الجدولُ يصير محميّاً من أول ترحيلٍ يفرضه — وما قبله لا حماية عليه. */
    const protectedSince = new Map<string, number>();
    files.forEach((f, i) => {
      for (const t of forcedTables(f.sql)) if (!protectedSince.has(t)) protectedSince.set(t, i);
    });

    const offences: string[] = [];
    files.forEach((f, i) => {
      const touched = dmlTables(f.sql);
      if (touched.length === 0) return;
      const lifted = liftedTables(f.sql);
      const restored = forcedTables(f.sql);
      for (const t of touched) {
        const since = protectedSince.get(t);
        // غيرُ محميّ بعدُ (يُفرَض في هذا الملفّ أو لاحقاً) ⇒ لا يلزم رفع.
        if (since === undefined || since > i) continue;
        if (since === i && !lifted.has(t)) continue; // فُرض في هذا الملفّ بعد تعبئته
        if (!lifted.has(t)) offences.push(`${f.name}: يمسّ "${t}" المحميّ بلا NO FORCE`);
        else if (!restored.has(t)) offences.push(`${f.name}: رفع الحماية عن "${t}" ولم يُعدها`);
      }
    });
    expect(offences).toEqual([]);
  });
});
