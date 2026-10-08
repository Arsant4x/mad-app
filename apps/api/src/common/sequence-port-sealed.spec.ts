import { readFileSync } from 'fs';
import { join, relative } from 'path';
import { sourceFiles, stripComments } from './source-scan.util';

/**
 * **منفذُ العدّاد مختومٌ بنيةً — لا باتفاق** (`ق-٣٤٩`).
 *
 * ── شرطُ المالك بنصّه ────────────────────────────────────────────────────
 *
 * «**لا «نتّفق ألّا نستعمله» بل لا يستطيع** — وحارسٌ يُسقط الحزمة إن مرّ به
 * استعلامٌ غيرُ زيادة العدّاد. **فمنفذٌ يتجاوز طبقةً من العزل يُغري بالمرور
 * منه بعد شهور**.»
 *
 * ── ما يحرسه ─────────────────────────────────────────────────────────────
 *
 * **① لا عميلَ ثانٍ في الشجرة**: `new PrismaClient(` **في ملفٍ واحدٍ فقط** هو
 * المنفذ. فأيُّ اتصالٍ آخر يُفتح خارج `PrismaService` **يتجاوز العزل بلا
 * حسيب**، وهذا ما يجعل المنفذ استثناءً **معدوداً** لا باباً مفتوحاً.
 *
 * **② ولا جملةَ في المنفذ غيرُ المأذون**: `SELECT set_config` · `UPDATE` على
 * `document_sequences` · `INSERT` عليه. **فجدولٌ آخر يُذكر هنا يُسقط الحزمة**
 * — وهو الشكلُ الذي «يُغري بالمرور» بعد شهور.
 *
 * ⚖️ **وجدولٌ ثانٍ مأذونٌ بقرارٍ لا باتّفاق** (`ق-٣٤٥`، بُني في توجيه ٢٨٦): `document_number_allocations`، يُدرَج فيه
 * صفُّ الأخذ **في جملة الزيادة نفسِها** — فالقرارُ يوجب أن يُكتب التخصيصُ في المعاملة القصيرة. والإدراجُ وحدَه:
 * الختمُ «مستعمَلاً» في معاملة العمل لا في المنفذ.
 *
 * ⚠️ **وحدُّ الحارس معلَن**: يقرأ **المصدر** لا سلوكَ التشغيل. **والشكلُ
 * الأقوى — دورٌ في القاعدة لا يملك إلا هذا الجدول — يجعل العجزَ في القاعدة
 * نفسها**، ويحتاج صلاحيةَ إنشاء أدوار: **عملُ تشغيلٍ لا هجرة**، والمنشورةُ
 * للقراءة فقط. **فيُعلَن فراغاً ولا يُدَّعى** (`ق-٣٤٩`).
 */
const SRC = join(__dirname, '..');
const PORT = join('common', 'sequence-allocator.ts');
/** `PrismaService` هو العميلُ الأصلي — يرثه لا يُنشئه، فلا يُعدّ منفذاً ثانياً. */
const BASE_CLIENT = join('prisma', 'prisma.service.ts');

/** الجداولُ المأذونُ للمنفذ بمسّها — العدّادُ وسجلُّ ما أُخذ منه (`ق-٣٤٥`)، لا غير. */
const ALLOWED_TABLES = ['document_sequences', 'document_number_allocations'];

/** أسماءُ جداولٍ مقتبسةٌ في `SQL` خام: `"..."` بعد `FROM` · `INTO` · `UPDATE` · `JOIN`. */
export function tablesTouched(source: string): string[] {
  const code = stripComments(source);
  const out = new Set<string>();
  for (const m of code.matchAll(/\b(?:FROM|INTO|UPDATE|JOIN)\s+"([A-Za-z_][A-Za-z0-9_]*)"/gi)) out.add(m[1]);
  return [...out];
}

/** ملفاتٌ تُنشئ عميلَ Prisma بنفسها — كلُّ واحدٍ منفذٌ يتجاوز العزل. */
export function opensOwnClient(source: string): boolean {
  return /\bnew\s+PrismaClient\s*\(/.test(stripComments(source));
}

describe('منفذُ العدّاد مختومٌ — حارسٌ مشتقٌّ يمسح الشجرة', () => {
  it('المُكتشِفان مُثبَتان بحالتَين: يمسكان الشكل ويتركان ما ليس منه', () => {
    expect(opensOwnClient('const c = new PrismaClient({ datasources });')).toBe(true);
    expect(opensOwnClient('export class PrismaService extends PrismaClient {}')).toBe(false);
    // والتعليقُ لا يُدان — وإلا لأدان هذا الملفُّ نفسَه.
    expect(opensOwnClient('// كان: new PrismaClient()\nexport const x = 1;')).toBe(false);

    expect(tablesTouched('UPDATE "document_sequences" SET "last" = "last" + 1')).toEqual(['document_sequences']);
    expect(tablesTouched('INSERT INTO "invoices" ("id") VALUES (1)')).toEqual(['invoices']);
    // 🔴 **والوجهُ الذي يجب أن يُمسَك**: قراءةُ جدولٍ آخر من المنفذ.
    expect(tablesTouched('SELECT * FROM "customers" WHERE "companyId" = $1')).toEqual(['customers']);
    expect(tablesTouched('SELECT set_config($1, $2, true)')).toEqual([]);
  });

  it('🔴 لا عميلَ Prisma يُنشأ خارج المنفذ والعميلِ الأصلي', () => {
    const offenders = sourceFiles(SRC)
      .filter((f) => opensOwnClient(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f).split('\\').join('/'))
      .filter((f) => f !== PORT.split('\\').join('/') && f !== BASE_CLIENT.split('\\').join('/'));
    expect(offenders).toEqual([]);
  });

  it('🔴 ولا يمسّ المنفذُ جدولاً غير عدّاد التسلسل', () => {
    const source = readFileSync(join(SRC, PORT), 'utf8');
    // **والسطح غير فارغ**: لو لم يُقرأ الملفُّ لعاد فارغاً ومرّ التوكيدُ عمىً.
    const touched = tablesTouched(source);
    expect(touched.length).toBeGreaterThan(0);
    expect(touched.filter((t) => !ALLOWED_TABLES.includes(t))).toEqual([]);
  });
});
