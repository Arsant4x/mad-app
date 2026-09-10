import { BANK_BANDS, DRAWER_BANDS, bandCapacity, bandRemaining, bandStatus, bandGroup, nextCodeInBands, warnThreshold } from './code-bands';

/**
 * حسابُ النطاقات (`ق-٢٩٥`) — **والدعوى المركزية**: `MAX+1` يستهلك بأعلى رمزٍ
 * صدر **لا بعدد الأحياء**، فالفجوةُ لا تُحسب ضمن الباقي.
 */
describe('نطاقاتُ الترقيم وسقفُها (ق-٢٩٥)', () => {
  const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => String(from + i));

  it('🔴 يبدأ من أول النطاق، ثم `MAX+1`، ثم ينتقل إلى النطاق الذي يليه', () => {
    expect(nextCodeInBands([], BANK_BANDS)).toBe(1100);
    expect(nextCodeInBands(['1100', '1101'], BANK_BANDS)).toBe(1102);
    // النطاق الأول ممتلئ ⟵ الثاني يبدأ من أوّله.
    expect(nextCodeInBands(range(1100, 1199), BANK_BANDS)).toBe(1601);
    expect(nextCodeInBands([...range(1100, 1199), '1601'], BANK_BANDS)).toBe(1602);
    // النطاقان ممتلئان ⟵ لا رمز، ويُترجَم رفضاً في الخدمة.
    expect(nextCodeInBands([...range(1100, 1199), ...range(1601, 1999)], BANK_BANDS)).toBeNull();
  });

  it('🔴 والفجوةُ لا تُعاد تعبئتُها — رمزٌ يدويٌّ داخل النطاق يدفع التاليَ فوقه', () => {
    expect(nextCodeInBands(['1100', '1150'], BANK_BANDS)).toBe(1151);
    // ورمزٌ خارج كل نطاقٍ لا يُزحزح شيئاً.
    expect(nextCodeInBands(['1100', '2500', 'غير-رقمي'], BANK_BANDS)).toBe(1101);
  });

  it('⭐ والباقي يُقاس بأعلى ما صدر لا بعدد الأحياء — وهي العلّة كلُّها', () => {
    // فجوةٌ من ٤٩ خانة بين 1100 و1150 **لا تُحسب**: المولّد لا يعود إليها.
    expect(bandRemaining(['1100', '1150'], BANK_BANDS)).toBe(1199 - 1150 + 399);
    // نطاقٌ نفد ⟵ ما بقي هو النطاق الثاني كاملاً.
    expect(bandRemaining(range(1100, 1199), BANK_BANDS)).toBe(399);
    // ولا شيء صدر ⟵ السعةُ كاملة.
    expect(bandRemaining([], BANK_BANDS)).toBe(bandCapacity(BANK_BANDS));
  });

  it('وعتبةُ الإنذار عشرُ خانات — ونصفُ السعة لنطاقٍ صغير، فإنذارٌ دائم يُهجَر', () => {
    expect(warnThreshold(bandCapacity(BANK_BANDS))).toBe(10);
    expect(warnThreshold(bandCapacity(DRAWER_BANDS))).toBe(10);
    expect(warnThreshold(10)).toBe(5);
    expect(warnThreshold(1)).toBe(0);
  });

  it('🔴 ويُنذر قبل الجدار لا عنده — وحالتان معلومتان', () => {
    const drawer = bandGroup('drawer');
    // ١٨٠ خانةً صدرت من ١٩٠ ⟵ عشرٌ باقية = العتبة بالضبط ⟵ إنذار.
    const atThreshold = bandStatus([...range(1010, 1099), ...range(1500, 1589)], drawer);
    expect(atThreshold.remaining).toBe(10);
    expect(atThreshold.warn).toBe(true);
    expect(atThreshold.next).toBe('1590');

    // وخانةٌ واحدة فوقها ⟵ لا إنذار.
    const belowThreshold = bandStatus([...range(1010, 1099), ...range(1500, 1588)], drawer);
    expect(belowThreshold.remaining).toBe(11);
    expect(belowThreshold.warn).toBe(false);
  });

  /**
   * ⭐ **الحالةُ التي بُني لها النطاقُ الثاني** (`ق-٤٨٢`): **منشأةٌ بلغت `1099`
   * كانت تُردّ بـ`409` لا مخرجَ منه** — **والآن تنتقل إلى `1500` وينطفئ
   * إنذارُها**، بالقاعدة نفسِها بلا استثناءٍ يُكتب.
   */
  it('🔴 ومن بلغ سقفَ الأول ينتقل إلى الثاني — وينطفئ إنذارُه', () => {
    const status = bandStatus(range(1010, 1099), bandGroup('drawer'));
    expect(status.next).toBe('1500');
    expect(status.remaining).toBe(100);
    expect(status.warn).toBe(false);
  });

  it('ونفادُ النطاقَين معاً يعطي `next` فارغاً لا رقماً مخترَعاً', () => {
    const status = bandStatus([...range(1010, 1099), ...range(1500, 1599)], bandGroup('drawer'));
    expect(status.remaining).toBe(0);
    expect(status.next).toBeNull();
    expect(status.warn).toBe(true);
  });

  it('ومفتاحٌ غير مسجَّل يسقط صراحةً — لا إنذارَ صامت', () => {
    expect(() => bandGroup('wallet')).toThrow(/غير مسجَّلة/);
  });
});
