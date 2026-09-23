import { fromBase32, generateRecoveryCodes, generateTotpSecret, hotp, normalizeRecoveryCode, otpauthUrl, toBase32, totp, verifyTotp } from './totp.util';

/**
 * **الخوارزميةُ تُثبَت بمتجهات RFC لا بالثقة** (`ق-١٣١٨` · ⑨A1).
 *
 * `HOTP` (RFC 4226 · Appendix D) و`TOTP` (RFC 6238 · Appendix B) **منشورتان بمتجهاتِ
 * اختبارٍ رسمية** — فمن كتبها بيده يُقابلها بها، **وخطأٌ في القصّ الديناميّ أو في ترتيب
 * البايتات يظهر فوراً** بدل أن يُكتشف يومَ يعجز تاجرٌ عن الدخول.
 */
describe('TOTP — بمتجهات RFC (ق-١٣١٨ · ⑨A1)', () => {
  /** سرُّ RFC 4226: السلسلة `12345678901234567890` بالـ`ASCII`. */
  const RFC_SECRET_ASCII = Buffer.from('12345678901234567890', 'ascii');
  const RFC_SECRET_B32 = toBase32(RFC_SECRET_ASCII);

  it('⭐ ① متجهاتُ HOTP الرسمية (RFC 4226 · Appendix D) — العشرةُ كلُّها', () => {
    const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
    for (let counter = 0; counter < expected.length; counter++) {
      expect(hotp(RFC_SECRET_ASCII, counter)).toBe(expected[counter]);
    }
  });

  it('⭐ ② ومتجهاتُ TOTP الرسمية (RFC 6238 · Appendix B) بـSHA-1 و٨ خانات', () => {
    // الجدولُ الرسميّ بثماني خاناتٍ — فيُطلب `digits = 8` كما فيه.
    const cases: [number, string][] = [
      [59, '94287082'],
      [1111111109, '07081804'],
      [1111111111, '14050471'],
      [1234567890, '89005924'],
      [2000000000, '69279037'],
      [20000000000, '65353130'],
    ];
    for (const [seconds, code] of cases) {
      expect(totp(RFC_SECRET_B32, seconds * 1000, 8)).toBe(code);
    }
  });

  it('③ و`base32` ذهاباً وإياباً — فالسرُّ الذي يُعرض هو السرُّ الذي يُحسب به', () => {
    expect(fromBase32(RFC_SECRET_B32).toString('ascii')).toBe('12345678901234567890');
    // والتطبيعُ يتحمّل المسافاتِ والأحرفَ الصغيرة كما تُلصق من الشاشة.
    expect(fromBase32(RFC_SECRET_B32.toLowerCase().replace(/(.{4})/g, '$1 '))).toEqual(RFC_SECRET_ASCII);
  });

  it('⭐ ④ والتحقّق يقبل الخطوةَ الحالية وجارتيها — ولا يقبل الثالثة', () => {
    const now = 1_700_000_000_000;
    expect(verifyTotp(RFC_SECRET_B32, totp(RFC_SECRET_B32, now), now).ok).toBe(true);
    expect(verifyTotp(RFC_SECRET_B32, totp(RFC_SECRET_B32, now - 30_000), now).ok).toBe(true);
    expect(verifyTotp(RFC_SECRET_B32, totp(RFC_SECRET_B32, now + 30_000), now).ok).toBe(true);
    // 🔴 **والحدُّ يُقاس لا يُفترض**: خطوتان بعيداً تُردّ.
    expect(verifyTotp(RFC_SECRET_B32, totp(RFC_SECRET_B32, now + 60_000), now).ok).toBe(false);
    expect(verifyTotp(RFC_SECRET_B32, totp(RFC_SECRET_B32, now - 60_000), now).ok).toBe(false);
  });

  it('⑤ ورمزٌ بطولٍ خاطئ أو بحروفٍ يُردّ بلا حساب', () => {
    expect(verifyTotp(RFC_SECRET_B32, '12345').ok).toBe(false);
    expect(verifyTotp(RFC_SECRET_B32, 'abcdef').ok).toBe(false);
    expect(verifyTotp(RFC_SECRET_B32, '').ok).toBe(false);
  });

  it('⑥ والخطوةُ تُعاد مع القبول — بها يُمنع استعمالُ الرمز مرّتين', () => {
    const now = 1_700_000_000_000;
    const verdict = verifyTotp(RFC_SECRET_B32, totp(RFC_SECRET_B32, now), now);
    expect(verdict.ok).toBe(true);
    expect(verdict.step).toBe(Math.floor(now / 1000 / 30));
  });

  it('⑦ والسرُّ الجديد `160` بتاً، ورموزُ الاسترداد ثمانيةٌ بلا أحرفٍ متشابهة', () => {
    const secret = generateTotpSecret();
    expect(fromBase32(secret)).toHaveLength(20);
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const c of codes) expect(normalizeRecoveryCode(c)).not.toMatch(/[O01I]/);
  });

  it('⑧ ورابطُ التسجيل يحمل ما يقرؤه التطبيق', () => {
    const url = otpauthUrl('ABCDEFGH', 'admin@example.test');
    expect(url).toContain('otpauth://totp/');
    expect(url).toContain('secret=ABCDEFGH');
    expect(url).toContain('period=30');
    expect(url).toContain('digits=6');
  });
});
