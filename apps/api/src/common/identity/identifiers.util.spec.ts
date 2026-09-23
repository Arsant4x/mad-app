import { BadRequestException } from '@nestjs/common';
import { normalizeIban, normalizeIdentifier } from './identifiers.util';

/**
 * ⚖️ `ق-١٣٤٥` · `ق-١٣٥٠` — **تطبيعٌ بلا افتراض دولة**: المعرّفُ حروفٌ وأرقام، والآيبانُ بالمعيار الدوليّ وحدَه.
 * والشاهدُ أن آيباناتٍ من دولٍ مختلفة الأطوال تمرّ كلُّها — فلا طولَ سعوديّاً مخبوءاً في الفحص.
 */
describe('المعرّفاتُ الشخصية — تطبيعٌ بلا افتراض دولة (ق-١٣٤٥ · ق-١٣٥٠)', () => {
  it('① المعرّفُ: تُحذف المسافاتُ والشرطاتُ وتُكبَّر الحروف، والفارغُ يمحو', () => {
    expect(normalizeIdentifier(' 1234-567 890 ')).toBe('1234567890');
    expect(normalizeIdentifier('ab12cd')).toBe('AB12CD');
    expect(normalizeIdentifier('')).toBeNull();
    expect(normalizeIdentifier(null)).toBeNull();
  });

  it('② معرّفٌ بحروفٍ غير لاتينية أو أطولُ من ٣٢ يُرفض باسمه', () => {
    expect(() => normalizeIdentifier('١٢٣٤')).toThrow(BadRequestException);
    expect(() => normalizeIdentifier('1'.repeat(33))).toThrow(BadRequestException);
  });

  it('③ الآيبانُ بالمعيار الدوليّ — أطوالُ دولٍ مختلفة تمرّ، والرقمُ الخاطئ يُرفض', () => {
    // أمثلةٌ منشورةٌ في سجلّ المعيار — لا حسابات.
    expect(normalizeIban('SA03 8000 0000 6080 1016 7519')).toBe('SA0380000000608010167519'); // ٢٤
    expect(normalizeIban('GB82 WEST 1234 5698 7654 32')).toBe('GB82WEST12345698765432'); // ٢٢
    expect(normalizeIban('de89 3704 0044 0532 0130 00')).toBe('DE89370400440532013000'); // ٢٢ بحروفٍ صغيرة
    expect(normalizeIban('NO9386011117947')).toBe('NO9386011117947'); // ١٥ — أقصرُها
    expect(() => normalizeIban('SA0380000000608010167518')).toThrow(BadRequestException);
    expect(() => normalizeIban('SA03')).toThrow(BadRequestException);
    expect(normalizeIban('')).toBeNull();
  });
});
