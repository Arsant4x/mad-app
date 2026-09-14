import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MSG } from '../common/i18n/messages';
import { UpdateCompanyProfileDto } from '../company-profile/dto/update-company-profile.dto';
import { buildZatcaQr, decodeZatcaQr, ZATCA_QR_MAX_VALUE_BYTES, ZatcaQrValueTooLongError } from './qr.util';

/**
 * `ق-٧٣٥` — **`TLV` لا ينهار صامتاً فوق `255` بايتاً: رفضٌ مسمّى عند البناء، ورفضٌ باسمه حيث يُكتب الاسم.**
 *
 * الواقعة (مقيسة 2026-09-14): الطولُ في `TLV` الهيئة بايتٌ واحد، و`Buffer.from([tag, 256])` يلفّه إلى `0`
 * فتُقرأ بايتاتُ الاسم وسوماً (`[1,216,185]`) — رمزٌ يُمسح ويُسلَّم ويُقرأ سليماً حتى يفحصه أحد. والوسمُ الوحيدُ
 * الذي يبلغ الحدَّ اسمُ البائع (`legalName` بلا حدٍّ في الشكل): `128` حرفاً عربياً = `256` بايتاً.
 *
 * شرطُ المالك: «يُثبَت بقيمةٍ فوق الحدّ تُنتج رمزاً صحيحاً أو رفضاً مسمّى، لا صمتاً» — والمواصفةُ بلا صيغةٍ
 * ممتدّة، فالاختيارُ الرفضُ المسمّى.
 */
const issued = { date: '2026-09-14', time: '15:04:05' };
const base = { vatNumber: '300000000000003', issued, total: 115, vatAmount: 15 };

/** قراءةٌ خامٌ مستقلّةٌ عن `decodeZatcaQr` — وسمٌ وطولٌ وقيمةٌ بايتاً بايت. */
function rawFields(b64: string): { tag: number; len: number; bytes: number }[] {
  const buf = Buffer.from(b64, 'base64');
  const out: { tag: number; len: number; bytes: number }[] = [];
  let off = 0;
  while (off + 2 <= buf.length) {
    const len = buf[off + 1];
    out.push({ tag: buf[off], len, bytes: Math.min(len, buf.length - off - 2) });
    off += 2 + len;
  }
  if (off !== buf.length) throw new Error(`TLV لا يُقرأ نظيفاً: انتهى عند ${off} من ${buf.length}`);
  return out;
}

describe('TLV — الحدُّ 255 بايتاً يُرفض باسمه لا صمتاً (ق-٧٣٥)', () => {
  it('⓪ حارسٌ على المجسّ: اسمٌ عربيٌّ عاديّ يُرمَّز بأطوالٍ بالبايتات لا بالحروف', () => {
    const sellerName = 'شركة رِكز للاستثمار العقاري (عرض)';
    const qr = buildZatcaQr({ ...base, sellerName })!;
    const fields = rawFields(qr);
    expect(fields.map((f) => f.tag)).toEqual([1, 2, 3, 4, 5]);
    expect(fields[0].len).toBe(Buffer.byteLength(sellerName, 'utf8'));
    expect(fields[0].len).not.toBe(sellerName.length);
    expect(decodeZatcaQr(qr)[1]).toBe(sellerName);
  });

  it('⭐ عند الحدّ بالضبط (255 بايتاً) يمرّ ويُقرأ نظيفاً', () => {
    const sellerName = 'ع'.repeat(127) + 'a'; // 254 + 1 = 255 بايتاً
    expect(Buffer.byteLength(sellerName, 'utf8')).toBe(ZATCA_QR_MAX_VALUE_BYTES);
    const qr = buildZatcaQr({ ...base, sellerName })!;
    const fields = rawFields(qr);
    expect(fields[0]).toEqual({ tag: 1, len: 255, bytes: 255 });
    expect(decodeZatcaQr(qr)[1]).toBe(sellerName);
  });

  it('🔴 فوق الحدّ (256 بايتاً) يُرفض باسمه — الوسمُ وعددُ البايتات — لا رمزٌ ولا null', () => {
    const sellerName = 'ع'.repeat(128); // 256 بايتاً
    let thrown: unknown;
    try {
      buildZatcaQr({ ...base, sellerName });
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(ZatcaQrValueTooLongError);
    expect((thrown as ZatcaQrValueTooLongError).tag).toBe(1);
    expect((thrown as ZatcaQrValueTooLongError).bytes).toBe(256);
    expect((thrown as Error).name).toBe('ZatcaQrValueTooLongError');
  });

  it('والحدُّ يُطبَّق على كلّ وسمٍ لا على الاسم وحده', () => {
    expect(() => buildZatcaQr({ ...base, sellerName: 'Rikz', vatNumber: '3'.repeat(256) })).toThrow(ZatcaQrValueTooLongError);
    try {
      buildZatcaQr({ ...base, sellerName: 'Rikz', vatNumber: '3'.repeat(256) });
    } catch (e) {
      expect((e as ZatcaQrValueTooLongError).tag).toBe(2);
    }
  });

  it('⭐ وحيث يُكتب الاسم: 127 حرفاً عربياً يمرّ في بيانات المنشأة، و128 يُرفض بالرسالة المسمّاة', async () => {
    const ok = await validate(plainToInstance(UpdateCompanyProfileDto, { legalName: 'ع'.repeat(127) }));
    expect(ok.filter((e) => e.property === 'legalName')).toEqual([]);

    const bad = await validate(plainToInstance(UpdateCompanyProfileDto, { legalName: 'ع'.repeat(128) }));
    const legal = bad.find((e) => e.property === 'legalName');
    expect(legal).toBeDefined();
    expect(Object.values(legal!.constraints ?? {})).toContain(MSG.legal_name_too_long_for_qr);

    // والحدُّ بالبايتات لا بالحروف: 200 حرفاً لاتينياً = 200 بايتاً يمرّ
    const latin = await validate(plainToInstance(UpdateCompanyProfileDto, { legalName: 'a'.repeat(200) }));
    expect(latin.filter((e) => e.property === 'legalName')).toEqual([]);
  });
});
