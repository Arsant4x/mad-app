import { BadRequestException } from '@nestjs/common';
import { MSG } from '../i18n/messages';

/**
 * ⚖️ **مُعرِّفاتُ الأشخاص — تطبيعٌ بلا افتراض دولة** (`ق-١٣٤٥` · `ق-١٣٥٠`).
 *
 * القاعدةُ الملزمة (`CLAUDE.md §3.8`): «**النواةُ لا تعرف الدولة** … ولا رقمَ ولا رمزَ ولا نصَّ سعوديٌّ حرفيٌّ خارج وحدته».
 * فلا يُفحص هنا «عشرةُ أرقامٍ تبدأ بواحدٍ أو اثنين» ولا «رقمُ اشتراكٍ في التأمينات» — تلك صيغٌ سعوديةٌ مكانُها وحدةُ الدولة
 * حين تُبنى. **والمفحوصُ ما يصدق في كلِّ دولة**: المعرّفُ حروفٌ وأرقامٌ بلا فواصل، والآيبانُ معيارٌ دوليّ (`ISO 13616`:
 * رمزُ دولةٍ ورقما تحقّقٍ وحسابٌ، والباقي على ٩٧ واحد) — بلا طولٍ خاصٍّ بدولة.
 */

/** يُطبِّع معرّفاً شخصياً (هويّة · تأمين): يحذف المسافاتِ والشرطات ويكبّر الحروف — `null` للفارغ. */
export function normalizeIdentifier(raw: string | null | undefined): string | null {
  const v = (raw ?? '').replace(/[\s-]+/g, '').toUpperCase();
  if (v === '') return null;
  if (!/^[A-Z0-9]{1,32}$/.test(v)) throw new BadRequestException(MSG.identity_identifier_invalid);
  return v;
}

/** يُطبِّع آيباناً ويتحقّق منه بالمعيار الدوليّ وحدَه — `null` للفارغ. */
export function normalizeIban(raw: string | null | undefined): string | null {
  const v = (raw ?? '').replace(/\s+/g, '').toUpperCase();
  if (v === '') return null;
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(v)) throw new BadRequestException(MSG.identity_iban_invalid);
  // الحروفُ أرقامٌ (A=10 … Z=35) بعد نقل الأربعة الأولى إلى الآخر، والباقي على ٩٧ يجب أن يكون واحداً.
  const rearranged = v.slice(4) + v.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const digits = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  }
  if (remainder !== 1) throw new BadRequestException(MSG.identity_iban_invalid);
  return v;
}
