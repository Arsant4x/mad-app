import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readsDeclaredStrings } from '../common/source-scan.util';
import { ALLOWED_SCREENS } from '../templates/screens';

// 🔴 **يقرأ نصوصاً معلَنة عمداً** (`ق-٣٧٥`): التسمياتُ تُستخرَج من **داخل
// السلاسل نفسها** (`key: 'label'`) — **فتجريدُ النصوص يعيده بخريطةٍ فارغة،
// فيقارن `{}` بالسجل ويمرّ عمىً**. والنصُّ هنا **بياناتُه لا شيفرتُه**.
readsDeclaredStrings();
import { SCREEN_LABELS } from './screen-labels';

/** يستخرج خريطة `مفتاح: 'قيمة'` من نصّ ملفٍّ مصدري. */
function parseLabels(src: string, marker: string): Record<string, string> {
  const at = src.indexOf(marker);
  expect(at).toBeGreaterThan(-1);
  const body = src.slice(at, src.indexOf('\n};', at));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/^\s*(\w+):\s*'([^']+)'/gm)) out[m[1]] = m[2];
  return out;
}

describe('أسماء الشاشات — نسخةٌ ثانية محروسة', () => {
  const web = parseLabels(
    readFileSync(join(__dirname, '..', '..', '..', 'web', 'src', 'api', 'templates.ts'), 'utf8').replace(/\r\n/g, '\n'),
    'export const SCREEN_LABELS',
  );

  it('يقرأ الملفين فعلاً — حارسٌ على خريطةٍ فارغة ليس حارساً', () => {
    expect(Object.keys(web).length).toBe(25);
    expect(Object.keys(SCREEN_LABELS).length).toBe(25);
  });

  it('⭐ المفاتيح = `ALLOWED_SCREENS` في **الاتجاهين**', () => {
    // ناقصٌ يجعل السجل يكتب `pos` بدل «الكاشير»؛ وزائدٌ يعني اسماً مخترَعاً
    // لشاشةٍ لا وجود لها.
    expect(Object.keys(SCREEN_LABELS).sort()).toEqual([...ALLOWED_SCREENS].sort());
  });

  it('⭐ ونسخة الواجهة مطابقةٌ حرفاً بحرف', () => {
    // وإلا قالت شاشة الإعدادات «الكاشير» وقال سجل التدقيق شيئاً آخر عن
    // الشاشة نفسها — فيقرأ المالك تغييرين حيث وقع واحد.
    const mismatched = Object.keys(SCREEN_LABELS).filter((k) => web[k] !== SCREEN_LABELS[k]);
    expect(mismatched).toEqual([]);
  });

  it('⭐ ولا اسم فارغ', () => {
    expect(Object.entries(SCREEN_LABELS).filter(([, v]) => !v.trim())).toEqual([]);
  });
});
