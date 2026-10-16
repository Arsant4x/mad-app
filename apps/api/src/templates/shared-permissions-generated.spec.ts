import { readFileSync } from 'node:fs';
import { readsDeclaredStrings } from '../common/source-scan.util';
import { ALL_ACTIONS, ALLOWED_SCREENS, actionsFor } from './screens';
import { REGENERATE_COMMAND, renderSharedPermissions, SHARED_PERMISSIONS_PATH } from './shared-permissions.util';

// المولَّدُ بياناتٌ معلَنة داخل سلاسل (أسماءُ الشاشات والأفعال والمفاتيح) — فالنصُّ هو بياناتُه (`ق-٣٧٥`).
readsDeclaredStrings();

/**
 * **`packages/shared/src/permissions.ts` مولَّدٌ من مصدره — لا يُحرَّر بيد ولا يتخلّف عنه** (`ق-١٢٣٤`).
 *
 * يُرسَم النصُّ من جديد بالدالّة نفسِها التي يستعملها سكربتُ التوليد ويُقارَن بما على القرص
 * **حرفاً** (بعد توحيد نهاية السطر — `§8.7` الوجه الخامس عشر): شاشةٌ تُضاف إلى `screens.ts`
 * بلا إعادة توليدٍ تُسقط الحزمةَ باسم الأمر الذي يُصلحها؛ وتحريرٌ يدويّ للمولَّد يُسقطها كذلك.
 *
 * وقبل المطابقة يُثبت أن الحارسَ **قرأ شيئاً** (`§8.7`): الملفُّ غيرُ فارغ، وفيه `25 × 7 = 175`
 * مفتاحاً كما يُحسبان من المصدر — فحارسٌ على ملفٍّ فارغ يمرّ عمىً.
 */
describe('مفرداتُ الصلاحيات المشتركة مولَّدةٌ من مصدرها', () => {
  const onDisk = readFileSync(SHARED_PERMISSIONS_PATH, 'utf8').replace(/\r\n/g, '\n');
  const rendered = renderSharedPermissions();

  it('reads the file, and every screen:action pair is in it (general actions on every screen, screen-only actions on theirs)', () => {
    expect(onDisk.length).toBeGreaterThan(1000);
    const expectedKeys = ALLOWED_SCREENS.reduce((n, s) => n + actionsFor(s).length, 0);
    // 25 screens by 7 general actions, plus the salaries action on the employees screen.
    expect(expectedKeys).toBe(176);
    const keysOnDisk = onDisk.match(/^  '[a-z]+:[a-z]+',$/gm) ?? [];
    expect(keysOnDisk).toHaveLength(expectedKeys);
    expect(keysOnDisk).toContain("  'employees:salaries',");
    expect(keysOnDisk).not.toContain("  'contracts:salaries',");
    for (const screen of ALLOWED_SCREENS) expect(onDisk).toContain(`  '${screen}',`);
    for (const action of ALL_ACTIONS) expect(onDisk).toContain(`'${action}'`);
  });

  it('⭐ ما على القرص = ما يُرسَم من المصدر الآن — حرفاً', () => {
    if (onDisk !== rendered) {
      throw new Error(`packages/shared/src/permissions.ts متخلّفٌ عن apps/api/src/templates/screens.ts أو حُرِّر بيد — أعد التوليد: ${REGENERATE_COMMAND}`);
    }
  });

  it('والمولَّدُ يعلن نفسَه مولَّداً ويسمّي أمرَ توليده', () => {
    expect(onDisk.startsWith('// ⛔ مولَّدٌ — لا يُحرَّر بيد.')).toBe(true);
    expect(onDisk).toContain(REGENERATE_COMMAND);
  });
});
