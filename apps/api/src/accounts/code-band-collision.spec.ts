import { readFileSync } from 'fs';
import { join } from 'path';
import { sourceFiles, stripComments } from '../common/source-scan.util';
import { CODE_BAND_GROUPS, CodeBand } from './code-bands';
import { DEFAULT_CHART } from './default-chart';

/**
 * **لا رمزَ ثابتٌ يقع داخل نطاقٍ مولِّد** (`ق-٤٨٣`).
 *
 * ## العلّة
 *
 * الرموزُ في النظام صنفان: **ثابتٌ يعرفه الكودُ باسمه** (`1200` الذمم ·
 * `2400` الإيراد المؤجَّل) — **ومولَّدٌ بـ`MAX+1` داخل نطاق** (بنكٌ لكلّ بنك ·
 * درجٌ لكلّ درج). **وثابتٌ يقع داخل نطاقٍ مولِّد يصطدم يوماً**: المولّدُ يبلغه
 * فيُصدره لبنكٍ أو درج، **والقيدُ الذي يقرأ الرمزَ باسمه يجد حسابَ درج**.
 *
 * ⭐ **والاصطدامُ صامتٌ حتى يقع** — **فيُبنى الحارسُ قبل أن يقع لا بعده**
 * (حكمُ المالك). **والمقيسُ اليوم صفرُ تصادم، وهذا ما يجعله رخيصاً.**
 *
 * ## ومشتقٌّ من المصدرَين لا من قائمة
 *
 *   ① **الدليلُ الافتراضي** (`DEFAULT_CHART`) — كلُّ رمزٍ يُنشأ لكلّ منشأة.
 *   ② **وثوابتُ الرموز في الشجرة** — كلُّ `…_ACCOUNT` أو `…_ACCOUNT_CODE`،
 *      وفيها ما ليس في الدليل (`5800` مثلاً يُنشأ عند أوّل شطب).
 *
 * فرمزٌ جديدٌ يُضاف غداً يدخل الحراسةَ بلا لمس هذا الملفّ.
 *
 * ## حدُّه المعلَن
 *
 * ⚠️ **يُدين الدليلَ الافتراضيَّ وثوابتَ الشيفرة — لا حساباً يُنشئه تاجر**
 * (`ق-٤٤٩`). **فالتاجر يملك دفترَه**، ورمزٌ يكتبه بيده داخل نطاقٍ مولِّد
 * شأنُه، ويمنعه القيدُ الفريد على `(companyId, code)` لا هذا الحارس.
 *
 * ⚠️ **ولا يرى رمزاً مكتوباً في مكانه بلا اسم**: `'1550'` سطراً داخل دالّةٍ
 * بلا ثابتٍ مسمّى **لا يدخل المصدر الثاني** — ويُوسَّع بالإشارات لا بقائمة.
 */
const SRC = join(__dirname, '..');

/** رمزٌ ثابتٌ بمصدره — الاسمُ يُقرأ في رسالة الإدانة فيُعرف أين يُصلَح. */
export interface FixedCode {
  code: string;
  where: string;
}

/** ① رموزُ الدليل الافتراضي. */
export function chartCodes(): FixedCode[] {
  return DEFAULT_CHART.map((a) => ({ code: a.code, where: `default-chart: ${a.name}` }));
}

/** ② وثوابتُ الرموز المسمّاة في الشجرة — من الشيفرة لا من التعليقات. */
export function constantCodes(root = SRC): FixedCode[] {
  const out: FixedCode[] = [];
  for (const file of sourceFiles(root)) {
    const code = stripComments(readFileSync(file, 'utf8'));
    for (const m of code.matchAll(/\b([A-Z][A-Z0-9_]*_ACCOUNT(?:_CODE)?)\s*=\s*'(\d{4})'/g)) {
      out.push({ code: m[2], where: `${m[1]}` });
    }
  }
  return out;
}

const inBand = (code: string, b: CodeBand) => Number(code) >= b.min && Number(code) <= b.max;

/** كلُّ تصادمٍ بين رمزٍ ثابتٍ ونطاقٍ مولِّد — بنصٍّ يُقرأ. */
export function collisions(fixed: FixedCode[], groups = CODE_BAND_GROUPS): string[] {
  const out: string[] = [];
  for (const f of fixed) {
    for (const g of groups) {
      for (const b of g.bands) {
        if (inBand(f.code, b)) out.push(`${f.code} (${f.where}) داخل نطاق ${g.key} ${b.min}-${b.max}`);
      }
    }
  }
  return out;
}

describe('لا رمزَ ثابتٌ داخل نطاقٍ مولِّد (ق-٤٨٣)', () => {
  it('🔴 الدليلُ الافتراضي بكامله خارج كلِّ نطاقٍ مولِّد', () => {
    expect(collisions(chartCodes())).toEqual([]);
  });

  it('🔴 وثوابتُ الرموز في الشجرة كذلك', () => {
    expect(collisions(constantCodes())).toEqual([]);
  });

  it('السطحُ غيرُ فارغ — المصدران يعطيان رموزاً فعلاً', () => {
    // مجسٌّ للمجسّ: صفرُ رموزٍ يعني أن القراءةَ أخفقت لا أن النظام بلا رموز.
    expect(chartCodes().length).toBeGreaterThanOrEqual(15);
    expect(constantCodes().length).toBeGreaterThanOrEqual(8);
    // و`5800` مثالُ ما ليس في الدليل ويلزم أن يُحرَس.
    expect(constantCodes().map((c) => c.code)).toContain('5800');
  });

  it('والفحصُ مُثبَتٌ بحالتَين: يُدين رمزاً داخل نطاقٍ ويقبل الذي خارجه', () => {
    const drawer = CODE_BAND_GROUPS.find((g) => g.key === 'drawer');
    if (!drawer) throw new Error('مجموعةُ الأدراج غائبةٌ عن النطاقات');
    const inside = String(drawer.bands[0].min);

    expect(collisions([{ code: inside, where: 'مجسّ' }])).toHaveLength(1);
    expect(collisions([{ code: '9999', where: 'مجسّ' }])).toEqual([]);
  });

  it('ولا يُخدع بذكرٍ في تعليق', () => {
    const commented = '// export const OLD_ACCOUNT_CODE = \'1050\';';
    expect(/_ACCOUNT(?:_CODE)?\s*=\s*'\d{4}'/.test(stripComments(commented))).toBe(false);
  });
});
