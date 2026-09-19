import { MSG, translate } from './messages';

/**
 * ⭐ **كلُّ مفتاحِ رسالةٍ يُقابله نصٌّ في الكتالوج — بالعربية والإنجليزية** (`ق-١١٨٤`).
 *
 * ── العطل المقيس ─────────────────────────────────────────────────────────
 *
 * `٧` شحن **`17` مفتاحاً** (`landed_cost_*` وأخواتها) في `MSG` بلا نصٍّ في `CATALOG` —
 * و`translate()` تُعيد **المفتاحَ نفسَه** حين لا تجده، بلا خطأ ولا تحذير. فوصل التاجرَ
 * `landedCosts.void_after_consumption {...}` بدل جملةٍ عربية. **وهي رسائلُ رفضٍ**: تقع
 * حيث يُمنع التاجرُ من فعلٍ — أسوأ موضعٍ لنصٍّ لا يُفهم. ولم يمسكها اختبارٌ لأن اختباراتِ
 * الواجهة البرمجية تطابق المفتاحَ لا النصّ.
 *
 * ── مشتقٌّ من المصدر لا من قائمة ─────────────────────────────────────────
 *
 * يُقرأ `MSG` نفسُه (كلُّ مفتاحٍ فيه — لا «ما يُرمى به اليوم»: المفتاحُ الذي لا يُرمى
 * به اليوم يُرمى غداً) ويُسأل `translate` عن كلِّ لغة: نصٌّ غيرُ فارغ **ولا يساوي المفتاح**
 * — فالمساواةُ هي علامةُ الغياب التي تسكت بها `translate`. فمفتاحٌ يُضاف غداً يدخل
 * الحراسةَ بلا لمس هذا الملفّ.
 *
 * ── المسبارُ يُصادَق بحالتَين (`§8.7` الوجه الحادي عشر) ──────────────────
 *
 * مفتاحٌ لا وجودَ له يجب أن يُمسَك، ومفتاحٌ له نصٌّ يجب أن يمرّ — قبل أن يُصدَّق الصفر.
 */
describe('كلُّ مفتاحِ رسالةٍ يُقابله نصٌّ في الكتالوج (ق-١١٨٤)', () => {
  const keys = Object.entries(MSG) as [string, string][];

  it('السطحُ غيرُ فارغ — وإلا فالحارسُ يفحص العدم', () => {
    expect(keys.length).toBeGreaterThan(300);
  });

  it('المسبارُ يرى: مفتاحٌ بلا نصٍّ يُمسَك، ومفتاحٌ له نصٌّ يمرّ', () => {
    const missing = 'guard.probe.no_such_key';
    expect(translate(missing, 'ar')).toBe(missing);
    expect(translate(MSG.internal_error, 'ar')).not.toBe(MSG.internal_error);
    expect(translate(MSG.internal_error, 'ar').length).toBeGreaterThan(0);
  });

  it('⭐ كلُّ مفتاحٍ في MSG له نصٌّ عربيٌّ وإنجليزيٌّ غيرُ فارغ — ولا واحد يعود باسمه', () => {
    const offenders: string[] = [];
    for (const [name, key] of keys) {
      for (const lang of ['ar', 'en'] as const) {
        const text = translate(key, lang);
        if (!text.trim() || text === key) offenders.push(`${name} (${key}) — ${lang}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('لا مفتاحان يحملان القيمةَ نفسَها — فالكتالوجُ يُفهرَس بالقيمة، ومكرَّرٌ يُخفي نصَّ أحدهما', () => {
    const seen = new Map<string, string>();
    const dup: string[] = [];
    for (const [name, key] of keys) {
      const prev = seen.get(key);
      if (prev) dup.push(`${prev} = ${name} = ${key}`);
      seen.set(key, name);
    }
    expect(dup).toEqual([]);
  });
});
