import { BadRequestException } from '@nestjs/common';
import { regionForNewCompany, SUPPORTED_REGIONS, type RegionProfile } from './regions';

/**
 * 🔴 `ق-١٣٦٨` — **إقليمُ المنشأة عند ميلادها**: المُعلَنُ إن كان مدعوماً، وبلا إعلانٍ الوحيدُ ما دام وحيداً — **ويصير الإعلانُ إلزامياً
 * حين يُضاف ثانٍ**. والفرعان يُصادَقان بسجلٍّ من إقليمين يُبنى هنا (لا يُضاف إقليمٌ إلى المنصّة لأجل اختبار).
 */
const profile = (country: string, timeZone: string, locale: string, baseCurrency: string): RegionProfile => ({ country, timeZone, locale, baseCurrency });

describe('regionForNewCompany — الإعلانُ والإقليمُ الوحيد والإلزامُ حين يصير اثنين', () => {
  const one = SUPPORTED_REGIONS;
  const code = Object.keys(one)[0];

  it('المنصّةُ تخدم إقليماً واحداً اليوم — وحقولُه الأربعةُ كلُّها مكتوبةٌ بشكلها المعياريّ', () => {
    expect(Object.keys(one)).toHaveLength(1);
    const r = one[code];
    expect(r.country).toMatch(/^[A-Z]{2}$/);
    expect(r.baseCurrency).toMatch(/^[A-Z]{3}$/);
    // المنطقةُ الزمنيةُ معروفةٌ لمحرّك الوقت نفسِه — لا نصٌّ يُكتب ولا يُقرأ.
    expect(() => new Intl.DateTimeFormat('en', { timeZone: r.timeZone })).not.toThrow();
    expect(Intl.DateTimeFormat.supportedLocalesOf([r.locale])).toEqual([r.locale]);
  });

  it('بلا إعلانٍ ⟵ الإقليمُ الوحيد · والإعلانُ يُقبل بحالةٍ أيّاً كانت', () => {
    expect(regionForNewCompany(undefined)).toBe(one[code]);
    expect(regionForNewCompany('  ')).toBe(one[code]);
    expect(regionForNewCompany(code.toLowerCase())).toBe(one[code]);
  });

  it('إقليمٌ لا تخدمه المنصّة ⟵ 400 يسمّيه', () => {
    expect(() => regionForNewCompany('ZZ')).toThrow(BadRequestException);
  });

  it('⭐ وحين يصير اثنين: الغيابُ يُرفض (لا افتراضَ) — والمُعلَنُ يُقبل', () => {
    const two = { ...one, XX: profile('XX', 'UTC', 'en', 'USD') };
    expect(() => regionForNewCompany(undefined, two)).toThrow(BadRequestException);
    expect(regionForNewCompany('XX', two).baseCurrency).toBe('USD');
    expect(regionForNewCompany(code, two)).toBe(one[code]);
  });
});
