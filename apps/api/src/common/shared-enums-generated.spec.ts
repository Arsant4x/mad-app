import { readFileSync } from 'node:fs';
import { readsDeclaredStrings } from './source-scan.util';
import { REGENERATE_ENUMS_COMMAND, renderSharedEnums, SHARED_ENUMS_PATH, SHARED_UNIT_ENUMS_PATH, valuesConstName } from './shared-enums.util';
import { readRegistry } from './web-enum-mirrors.util';

// المولَّدُ بياناتٌ معلَنة داخل سلاسل (قيمُ التعدادات) — فالنصُّ هو بياناتُه (`ق-٣٧٥`).
readsDeclaredStrings();

/**
 * ⚖️ `ق-١٣٨٤` — **`packages/shared/src/api/{enums,zatca-enums}.ts` مولَّدان من سجلّ التعدادات — لا يُحرَّران بيد ولا يتخلّفان عنه.**
 *
 * يُرسَم النصّان من جديد بالدالّة نفسِها التي يستعملها سكربتُ التوليد ويُقارَنان بما على القرص **حرفاً** (بعد توحيد نهاية السطر —
 * `§8.7` الوجه الخامس عشر): قيمةٌ تُضاف إلى تعدادٍ في الخادم، أو مقابلٌ يُضاف إلى السجلّ، بلا إعادة توليدٍ — **تُسقط الحزمةَ باسم
 * الأمر الذي يُصلحها**؛ وتحريرٌ يدويّ للمولَّد يُسقطها كذلك.
 *
 * وقبل المطابقة يُثبت أن الحارسَ **قرأ شيئاً** (`§8.7`): في الملفّين معاً نوعٌ لكلِّ مقابلٍ في السجلّ — فحارسٌ على ملفٍّ فارغ يمرّ عمىً.
 */
describe('تعداداتُ الواجهة المشتركة مولَّدةٌ من سجلّها', () => {
  const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
  const onDisk = { general: read(SHARED_ENUMS_PATH), unit: read(SHARED_UNIT_ENUMS_PATH) };
  const rendered = renderSharedEnums();
  const registry = readRegistry();

  it('يقرأ الملفّين فعلاً — وفيهما نوعٌ لكلِّ مقابلٍ في السجلّ، لا أقلّ ولا أكثر', () => {
    const types = (text: string) => text.match(/^export type \w+ = \(typeof \w+\)\[number\];$/gm) ?? [];
    expect(registry.mirrors.length).toBeGreaterThanOrEqual(78);
    expect(types(onDisk.general).length + types(onDisk.unit).length).toBe(registry.mirrors.length);
    for (const m of registry.mirrors) {
      const name = m.web.split('#')[1];
      expect(`${onDisk.general}\n${onDisk.unit}`).toContain(`export type ${name} = (typeof ${valuesConstName(name)})[number];`);
    }
  });

  it('⭐ ما على القرص = ما يُرسَم من السجلّ الآن — حرفاً، في الملفّين', () => {
    if (onDisk.general !== rendered.general || onDisk.unit !== rendered.unit) {
      throw new Error(`packages/shared/src/api/ متخلّفٌ عن docs/web-enum-mirrors.json أو عن مصدرٍ في الخادم، أو حُرِّر بيد — أعد التوليد: ${REGENERATE_ENUMS_COMMAND}`);
    }
  });

  it('وملفُّ الوحدة يحمل ما يحمل علامةً سعودية وحدَه — والعامُّ لا يحمل شيئاً منها (حدُّ الوحدة `ق-١٣٥٠`)', () => {
    const saudi = rendered.enums.filter((e) => e.saudi).map((e) => e.name);
    expect(saudi.length).toBeGreaterThan(0);
    for (const name of saudi) expect(onDisk.unit).toContain(`export type ${name} =`);
    for (const e of rendered.enums.filter((x) => !x.saudi)) expect(onDisk.unit).not.toContain(`export type ${e.name} =`);
  });

  it('والمولَّدُ يعلن نفسَه مولَّداً ويسمّي أمرَ توليده', () => {
    for (const text of [onDisk.general, onDisk.unit]) {
      expect(text.startsWith('// ⛔ مولَّدٌ — لا يُحرَّر بيد.')).toBe(true);
      expect(text).toContain(REGENERATE_ENUMS_COMMAND);
    }
  });

  it('اسمُ الثابت مشتقٌّ من اسم النوع — والأحرفُ الكبيرةُ المتتالية كلمةٌ واحدة', () => {
    expect(valuesConstName('AccountType')).toBe('ACCOUNT_TYPE_VALUES');
    expect(valuesConstName('ZatcaInvoiceStatus')).toBe('ZATCA_INVOICE_STATUS_VALUES');
    expect(valuesConstName('VATCategory')).toBe('VAT_CATEGORY_VALUES');
  });
});
