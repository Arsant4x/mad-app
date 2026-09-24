import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readsDeclaredStrings } from '../common/source-scan.util';

// 🔴 **يقرأ نصوصاً معلَنة عمداً** (`ق-٣٧٥`): المرآةُ تُقارن **قيماً نصّية**
// بين مصدرين — **فتجريدُ النصوص يُفرغ الطرفين ويُنتج تطابقاً كاذباً**.
readsDeclaredStrings();
import { SECTORS, SECTOR_LABELS, Sector } from './sectors';

/**
 * القطاعات في الواجهة **مرآةٌ للخادم** — ومحروسةٌ لأنها كذلك (القائمةُ مولَّدةٌ منذ `ق-١٣٨٤`، والتسمياتُ بيد).
 *
 * الواجهة تحتاج القائمة لتعرض قائمةَ اختيار، والخادم يحتاجها ليحرس. ونسختان
 * تفترقان عند أول قطاع جديد: تُضاف في الخادم فلا يستطيع المالك اختيارها،
 * أو تُضاف في الواجهة فيرفضها الخادم بـ400 **بلا سببٍ مفهوم**.
 *
 * ⚠️ ولا يمكن استيراد أحدهما من الآخر: حزمتان منفصلتان ببناءَين مختلفين.
 * فالتكرار قائمٌ لا مفرّ منه — **والحارس هو ما يجعله آمناً**.
 *
 * ⚖️ **ومنذ `ق-١٣٨٤` صارت القائمةُ مولَّدةً** في الحزمة المشتركة (`packages/shared/src/api/enums.ts#SECTOR_VALUES`) والواجهةُ تُسندها
 * (`export const SECTORS = SECTOR_VALUES;`) — فيتبع الحارسُ **ما تعرضه الواجهةُ فعلاً**: مصفوفةً حرفيةً في ملفّها إن كانت، أو الثابتَ الذي
 * تُسند إليه من المولَّد. **والتسمياتُ العربية** ما زالت بيدٍ في الطرفين — وهي ما يحرسه هنا بلا تغيير.
 */

const WEB = join(__dirname, '..', '..', '..', 'web', 'src', 'api', 'activities.ts');
const SHARED_ENUMS = join(__dirname, '..', '..', '..', '..', 'packages', 'shared', 'src', 'api', 'enums.ts');

function parseWeb(): { sectors: string[]; labels: Record<string, string> } {
  const src = readFileSync(WEB, 'utf8').replace(/\r\n/g, '\n');

  // المصفوفةُ حرفاً في ملفّ الواجهة — أو الثابتُ المولَّد الذي تُسند إليه (`SECTORS = X`) مقروءاً من الحزمة المشتركة.
  const alias = src.match(/export const SECTORS = (\w+);/)?.[1];
  const arr = alias
    ? readFileSync(SHARED_ENUMS, 'utf8').replace(/\r\n/g, '\n').match(new RegExp(`export const ${alias} = \\[([^\\]]+)\\]`))?.[1]
    : src.match(/export const SECTORS = \[([^\]]+)\]/)?.[1];
  expect(arr).toBeDefined();
  const sectors = [...arr!.matchAll(/'([^']+)'/g)].map((m) => m[1]);

  const at = src.indexOf('export const SECTOR_LABELS');
  expect(at).toBeGreaterThan(-1);
  const body = src.slice(at, src.indexOf('\n};', at));
  const labels: Record<string, string> = {};
  for (const m of body.matchAll(/^\s*(\w+):\s*'([^']+)'/gm)) labels[m[1]] = m[2];

  return { sectors, labels };
}

describe('قطاعات الواجهة مرآةٌ للخادم', () => {
  const web = parseWeb();

  it('يقرأ الملف فعلاً — حارسٌ على قائمةٍ فارغة ليس حارساً', () => {
    expect(web.sectors.length).toBeGreaterThan(5);
    expect(Object.keys(web.labels).length).toBeGreaterThan(5);
  });

  it('⭐ القائمة مطابقة — بالترتيب والمحتوى', () => {
    // الترتيب يظهر في قائمة الاختيار أمام المالك، فاختلافه اختلافُ منتج
    // لا تفصيلة داخلية.
    expect(web.sectors).toEqual([...SECTORS]);
  });

  it('⭐ والتسميات العربية مطابقة حرفاً بحرف', () => {
    // وإلا قالت شاشة الإعدادات «مطعم أو كافيه» وقال سجل التدقيق غيره عن
    // القطاع نفسه.
    const mismatched = SECTORS.filter((s) => web.labels[s] !== SECTOR_LABELS[s as Sector]);
    expect(mismatched).toEqual([]);
  });
});
