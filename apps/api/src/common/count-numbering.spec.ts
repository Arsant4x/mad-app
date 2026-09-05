import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

/**
 * `ق-١٩٨` · `ق-٢٠٤` — **حارسٌ مشتقّ**: أي مولّد ترقيمٍ يشتقّ رقماً أو مرجعاً من `count()`
 * يُسقط الحزمة — **لا قائمةً بأسماء**.
 *
 * ثلاثةُ مواضعٍ أُصلحت ثم عاد رابعٌ (مرجعُ بوّابة الكاشير): «فالمشكلة ليست في المواضع بل
 * في أن النمط **يُكتب من جديد كلما احتاجه أحد**». والقائمةُ تحرس الماضي لا القادم، فالحارس
 * يمسح شجرةَ الخادم كلَّها ويلتقط **الشكل**:
 *   ① نتيجةُ `count()` تُزاد واحداً في العبارة نفسها؛
 *   ② استدعاءُ `count()` داخل قالبٍ يُسند إلى حقلِ رقمٍ/مرجع (`no` · `reference` · `serial` · `icv` …);
 *   ③ متغيّرٌ أُخذ من `count()` ثم زِيد واحداً، أو حُشي (`padStart`)، أو رُكّب في قالبِ مرجع.
 * وما لا يُلتقَط: فحصُ الوجود (`> 0`) · ترقيمُ الصفحات (`total`) · إحصاءُ العرض · حرّاسُ الحذف.
 *
 * لماذا `count()` عطلٌ في الترقيم: أول فجوةٍ (حذفٌ أو فشلٌ بعد الحجز) تُنتج رقماً محجوزاً،
 * وتعيد المحاولةُ الرقمَ نفسه حتى تسقط؛ وبيعان متزامنان يقرآن العددَ نفسه. القاعدة: `MAX+1`
 * تحت قيدٍ فريد، أو عدّادٌ ذرّي، أو `UUID` حيث لا تسلسلَ مطلوباً.
 */
const ROOTS = [join(__dirname, '..'), join(__dirname, '..', '..', 'prisma')];
/** حقلٌ اسمُه رقمٌ أو مرجع — إسنادُ قالبٍ فيه `count` إليه ترقيمٌ لا رسالة. */
const ID_FIELD = /\b(?:reference|ref|no|number|serial|icv|seq|sequence|counter|code)\w*\s*[:=]/i;

export interface CountOffence {
  file: string;
  line: number;
  reason: string;
}

/** الكود بلا تعليقاته — كي لا يُحسب مثالٌ مكتوب في تعليقٍ عودةً للعطل؛ والأسطرُ محفوظةٌ كي يصدق رقمُ السطر. */
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, '')).replace(/^\s*\/\/.*$/gm, '');

export function countNumberingOffences(source: string, file = '<inline>'): CountOffence[] {
  const code = stripComments(source);
  const lines = code.split(/\r?\n/);
  const lineOf = (index: number) => code.slice(0, index).split('\n').length;
  const out: CountOffence[] = [];

  // ① `count(...) + 1` في العبارة نفسها — بأقواسٍ متداخلة درجةً واحدة.
  for (const m of code.matchAll(/\.count\((?:[^()]|\([^()]*\))*\)\s*\)?\s*\+\s*1\b/g)) {
    out.push({ file, line: lineOf(m.index ?? 0), reason: 'count() + 1' });
  }

  // ② `${ … .count( … ) }` في سطرٍ يُسند إلى حقلِ رقمٍ/مرجع.
  for (const m of code.matchAll(/\$\{[^}]*\.count\(/g)) {
    const line = lineOf(m.index ?? 0);
    if (ID_FIELD.test(lines[line - 1] ?? '')) out.push({ file, line, reason: 'count() داخل قالبِ مرجعٍ أو رقم' });
  }

  // ③ متغيّرٌ من `count()` يدخل في ترقيم.
  for (const m of code.matchAll(/(?:const|let)\s+(\w+)\s*=\s*\(?\s*await\s+[\w.]+\.count\(/g)) {
    const name = m[1];
    const uses = new RegExp(`\\b${name}\\s*\\+\\s*1\\b|String\\(\\s*${name}\\s*\\)|\\b${name}\\b[^;\\n]*padStart\\(|\\$\\{[^}]*\\b${name}\\b[^}]*\\}`, 'g');
    for (const u of code.matchAll(uses)) {
      const line = lineOf(u.index ?? 0);
      // القالبُ يُدان إن أُسند إلى حقلِ مرجع؛ والزيادةُ والحشوُ يُدانان دائماً.
      if (u[0].startsWith('${') && !ID_FIELD.test(lines[line - 1] ?? '')) continue;
      out.push({ file, line, reason: `«${name}» من count() يدخل في ترقيم` });
    }
  }
  return out;
}

/** كل ملفات `.ts` تحت الجذور — بلا اختبارات وبلا تعريفات. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === 'node_modules' || name === 'dist') continue;
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.ts$/.test(name) && !/\.spec\.ts$|\.d\.ts$/.test(name)) out.push(full);
  }
  return out;
}

describe('لا مولّدَ ترقيمٍ من `count()` — حارسٌ مشتقٌّ يمسح الشجرة', () => {
  it('المُكتشِف مُثبَت بحالتَين: يمسك الشكل ويترك الإحصاء', () => {
    // الأشكال الثلاثة تُمسَك.
    expect(countNumberingOffences('const n = await tx.invoice.count({ where }); const no = `INV-${String(n + 1).padStart(6, "0")}`;').length).toBeGreaterThan(0);
    expect(countNumberingOffences('return (await tx.invoice.count({ where: { companyId } })) + 1;')).toHaveLength(1);
    expect(countNumberingOffences('reference: opts.ref ?? `POS-${shift.id.slice(0, 8)}-${await tx.invoice.count({ where: { posShiftId: shift.id } })}`,')).toHaveLength(1);
    expect(countNumberingOffences('const seq = await tx.x.count(); const code = `C-${seq}`;')).toHaveLength(1);
    // والإحصاءُ والوجودُ والصفحاتُ والرسائلُ لا تُمسَك.
    expect(countNumberingOffences('const total = await tx.contract.count({ where }); return { items, total };')).toEqual([]);
    expect(countNumberingOffences('if ((await tx.journalLine.count({ where: { accountId: id } })) > 0) throw new ConflictException(MSG.x);')).toEqual([]);
    expect(countNumberingOffences('const n = await tx.invoice.count({ where }); this.logger.log(`${n} فاتورة`);')).toEqual([]);
    expect(countNumberingOffences('hasAny: (await tx.journalEntry.count()) > 0,')).toEqual([]);
    // والتعليقُ لا يُدان.
    expect(countNumberingOffences('// كان: `${await tx.invoice.count()}` — reference: x\nconst reference = randomUUID();')).toEqual([]);
  });

  it('السطح غير فارغ — الشجرةُ تُقرأ فعلاً ومنها خدمةُ الكاشير', () => {
    const files = ROOTS.flatMap((r) => sourceFiles(r));
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith(join('pos', 'pos.service.ts')))).toBe(true);
  });

  it('🔴 لا نتيجةَ `count()` تُزاد أو تُركَّب في رقمٍ أو مرجع — في أي ملفٍ من الشجرة', () => {
    const offences = ROOTS.flatMap((root) =>
      sourceFiles(root).flatMap((f) => countNumberingOffences(readFileSync(f, 'utf8'), relative(join(__dirname, '..', '..'), f).split('\\').join('/'))),
    );
    expect(offences.map((o) => `${o.file}:${o.line} — ${o.reason}`)).toEqual([]);
  });
});
