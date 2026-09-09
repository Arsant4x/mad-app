import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { stripCommentsAndStrings } from './source-scan.util';

/**
 * `ق-٢٨٢` — **`Bank.balance` مرآةٌ تُكتب من مسار الترحيل وحده.**
 *
 * كان للعمود **ستةُ كتّاب** بيدٍ (`transactions` ٤ · `payments` · `contracts`)،
 * **وقارئٌ واحد**. ورقمٌ يتحرك بلا قيدٍ يسنده هو **تعريفُ العطل** الذي أُغلق:
 * الأستاذُ يحمل نقدَ البنك في `1000`، ورصيدُ البنك في عمودٍ خارجه.
 *
 * **والقاعدةُ مشتقّة لا قائمة**: كلُّ ملفٍّ يكتب `balance` (أو `baseBalance`) على
 * البنك **يجب أن يُرحّل قيداً في الملفّ نفسه** — أي أن يستدعي إحدى دوالّ الترحيل.
 * فملفٌّ يحرّك المرآة بلا قيد **يُسقط الحزمة مسمّياً الملفَّ والسطر**؛ وملفٌّ جديد
 * يُرحّل ويكتب المرآة يمرّ **بلا لمس هذا الحارس** (لا قائمةَ أسماءٍ تُحدَّث).
 *
 * حدُّه المعلَن: يقرأ النصّ. فكتابةٌ عبر `$executeRaw` أو اسمٍ مبنيٍّ ديناميكياً
 * لا يراها — وتُوسَّع الإشارات لا القائمة.
 */
const SRC = join(__dirname, '..');
/** كتابةٌ على البنك تمسّ الرصيد: `bank.update(… balance …)` في السطور نفسها. */
const BANK_BALANCE_WRITE = /\.bank\.update\(\s*\{[\s\S]{0,400}?(?:baseBalance|balance)\s*:/g;
/** دوالُّ الترحيل — وجودُ إحداها في الملفّ يجعل الكتابةَ «من مسار الترحيل». */
const POSTING_CALLS = /post[A-Z]\w*Entry\s*\(/;

export interface MirrorOffence {
  file: string;
  line: number;
}

/**
 * يُفرَّغ التعليقُ والسلاسل — فحرّاسُنا وتعليقاتُنا تقتبس ما تمنعه (`ق-٢٧٤`).
 *
 * ⚠️ **كانت السابعةَ من سبعِ كتاباتٍ مستقلّة** (`ق-٣٨١`) — **وهي أصلُ الصياغة
 * السليمة** (المِلءُ بفراغٍ يحفظ السطرَ والعمود). **وُحِّدت لئلّا تُنسخ ثامنةً**
 * — فثلاثٌ من السبع حملت العطل، **وكلُّها كُتبت بعد هذه**.
 */
export const blankNonCode = stripCommentsAndStrings;

export function mirrorOffences(source: string, file = '<inline>'): MirrorOffence[] {
  const code = blankNonCode(source);
  if (POSTING_CALLS.test(code)) return []; // الملفُّ يُرحّل، فكتابتُه من المسار
  const out: MirrorOffence[] = [];
  for (const m of code.matchAll(BANK_BALANCE_WRITE)) {
    out.push({ file, line: code.slice(0, m.index ?? 0).split('\n').length });
  }
  return out;
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (name === 'node_modules' || name === 'dist') continue;
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.ts$/.test(name) && !/\.spec\.ts$|\.d\.ts$/.test(name)) out.push(full);
  }
  return out;
}

describe('مرآةُ رصيد البنك تُكتب من مسار الترحيل وحده (ق-٢٨٢)', () => {
  it('القارئ مُثبَت بثلاث حالاتٍ معروفة النتيجة', () => {
    const write = 'await tx.bank.update({ where: { id }, data: { balance: { increment: n } } });';
    // ① كتابةٌ في ملفٍّ لا يُرحّل — تُدان.
    expect(mirrorOffences(write)).toHaveLength(1);
    // ② والكتابةُ نفسها في ملفٍّ يُرحّل — تمرّ.
    expect(mirrorOffences(`const e = await postCustomerPaymentEntry(tx, c, p);\n${write}`)).toEqual([]);
    // ③ وكتابةٌ لا تمسّ الرصيد — تمرّ.
    expect(mirrorOffences('await tx.bank.update({ where: { id }, data: { archived: true } });')).toEqual([]);
  });

  it('السطح غير فارغ — الشجرةُ تُقرأ ومنها خدمةُ الحركات', () => {
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.endsWith(join('transactions', 'transactions.service.ts')))).toBe(true);
  });

  it('🔴 لا ملفَّ يحرّك رصيدَ البنك بلا أن يُرحّل قيداً فيه', () => {
    const offences = sourceFiles(SRC).flatMap((f) =>
      mirrorOffences(readFileSync(f, 'utf8'), relative(join(__dirname, '..', '..'), f).split('\\').join('/')),
    );
    expect(offences.map((o) => `${o.file}:${o.line}`)).toEqual([]);
  });
});
