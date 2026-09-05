import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * **كل قرارٍ يُوسّع قاعدةً قائمة يُلحَق بموضعها أو تسقط الحزمة** (توجيه المالك 2026-09-06).
 *
 * الواقعة: `ق-١٩٩` و`ق-٢٠٨` وجهان جديدان لعائلة `§8.7` سُجّلا في `decisions.md` ولم يُلحَقا
 * بالعائلة في `CLAUDE.md` — فمن قرأ العائلة ظنّها أحد عشر وجهاً وهي ثلاثة عشر. القاعدةُ
 * تُسجَّل في السجلّ **ولا تُلحَق بمكانها في المرجع** — نمطٌ لا حادثة.
 *
 * ما يحرسه (مشتقٌّ من العنوان لا من قائمة): كل صفٍّ في السجلّ يسمّي عائلةً في عنوانه
 * («عائلة §8.N» أو «§8.N بوجهٍ») يجب أن يُذكَر رقمُه داخل قسم `### 8.N` من `CLAUDE.md`.
 *
 * حدُّه المعلَن: يمسك ما سمّى عائلتَه في العنوان؛ وقرارٌ يوسّع قاعدةً **بلا أن يسمّيها**
 * لا يراه — فالتسمية في العنوان هي عقدُ الإلحاق.
 */
const REPO = join(__dirname, '..', '..', '..', '..');

/** توحيد الأرقام العربية والهندية-العربية كي لا يفترق `ق-١٩٩` عن `ق-199`. */
const latin = (s: string) => s.replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0x0660 + 48));

export interface FamilyExtension {
  id: string;
  section: string;
}

/** صفوفُ السجلّ التي يسمّي عنوانُها عائلةً. */
export function familyExtensions(decisionsMd: string): FamilyExtension[] {
  const out: FamilyExtension[] = [];
  for (const line of decisionsMd.split(/\r?\n/)) {
    if (!line.startsWith('| **')) continue;
    const title = line.split('|')[1] ?? '';
    const id = title.match(/ق-[٠-٩0-9]+/)?.[0];
    const fam = title.match(/عائلة\s+§8\.(\d+)|§8\.(\d+)\s+بوجه/);
    if (id && fam) out.push({ id, section: fam[1] ?? fam[2] });
  }
  return out;
}

/** نصُّ القسم `### 8.N` من `CLAUDE.md` — من عنوانه إلى عنوان `###` التالي؛ أو `null` إن لم يوجد. */
export function sectionText(claudeMd: string, section: string): string | null {
  const lines = claudeMd.split(/\r?\n/);
  const heading = new RegExp(`^###\\s+(?:\\S+\\s+)?8\\.${section}(?!\\d)`);
  const start = lines.findIndex((l) => heading.test(l));
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^###\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

/** ما لم يُلحَق: قرارٌ يسمّي عائلةً ولا يظهر رقمُه في قسمها. */
export function unattached(decisionsMd: string, claudeMd: string): string[] {
  return familyExtensions(decisionsMd)
    .filter(({ id, section }) => {
      const text = sectionText(claudeMd, section);
      return text === null || !latin(text).includes(latin(id));
    })
    .map(({ id, section }) => `${id} يسمّي §8.${section} ولا يُذكَر فيها`);
}

describe('كل قرارٍ يُوسّع قاعدةً قائمة يُلحَق بموضعها في CLAUDE.md', () => {
  const decisionsMd = readFileSync(join(REPO, 'docs', 'decisions.md'), 'utf8');
  const claudeMd = readFileSync(join(REPO, 'CLAUDE.md'), 'utf8');

  it('المُكتشِف مُثبَت بحالتَين: يمسك ما سمّى عائلتَه ويترك ما لم يسمّها', () => {
    const rows = ['| **ق-٩٠٠ — عائلة §8.7: مثالٌ** | حكم |', '| **ق-٩٠١ — §8.3 بوجهٍ ثانٍ: مثال** | حكم |', '| **ق-٩٠٢ — قرارٌ بلا عائلة** | حكم |'].join('\n');
    expect(familyExtensions(rows)).toEqual([
      { id: 'ق-٩٠٠', section: '7' },
      { id: 'ق-٩٠١', section: '3' },
    ]);
    const claude = ['### 8.7 عائلة', 'الوجه (ق-900)', '### 8.3 أخرى', 'لا شيء هنا', '### 8.4'].join('\n');
    expect(unattached(rows, claude)).toEqual(['ق-٩٠١ يسمّي §8.3 ولا يُذكَر فيها']);
    expect(unattached(rows, '### 8.7 فقط')).toEqual(['ق-٩٠٠ يسمّي §8.7 ولا يُذكَر فيها', 'ق-٩٠١ يسمّي §8.3 ولا يُذكَر فيها']);
    expect(sectionText(claude, '7')).toContain('الوجه (ق-900)');
    expect(sectionText(claude, '7')).not.toContain('أخرى');
    expect(sectionText(claude, '9')).toBeNull();
  });

  it('السطح غير فارغ — السجلُّ يسمّي عائلاتٍ فعلاً، والعناوينُ المرقّمة تُقرأ', () => {
    expect(familyExtensions(decisionsMd).length).toBeGreaterThanOrEqual(2);
    expect(sectionText(claudeMd, '7')).not.toBeNull();
    expect(sectionText(claudeMd, '11')).not.toBeNull(); // عنوانٌ يسبقه ⭐⭐
  });

  it('🔴 لا قرارَ يسمّي عائلةً في عنوانه ولا يُذكَر في قسمها', () => {
    expect(unattached(decisionsMd, claudeMd)).toEqual([]);
  });
});
