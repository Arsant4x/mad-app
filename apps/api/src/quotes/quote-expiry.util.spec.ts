import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KSA_UTC_OFFSET_MIN } from '../common/wall-clock.util';
import { isQuoteExpired } from './quote-expiry.util';

/**
 * ⚖️ انقضاءُ العرض بيومٍ معلَن (`ق-١١٨٣`) — يُثبَت بالحالة التي أسقطت `unit-of-measure ③` على قاعدةٍ
 * نظيفة في `21:02 UTC` (والحارسُ نفسُه مرّ تحت `TZ=UTC` في `21:03 UTC`): عرضٌ صالحٌ حتى `2026-09-19`
 * كان يُقرأ منقضياً على خادمٍ بتوقيت الرياض بعد `21:00 UTC` من يومه.
 *
 * والدالّةُ نقيّة: لا تقرأ منطقةَ العملية أصلاً — فيُثبَت ذلك **من نصّها** (لا `setHours`/`getDate`/
 * `getHours`) لا بتشغيلها تحت مناطقَ وحسب؛ ويُشغَّل الملفُّ في المحطة تحت مناطقَ مختلفة كما تُشغَّل
 * `period-lock-tz`.
 */
describe('انقضاءُ عرض السعر بيومٍ معلَن لا بتوقيت العملية (ق-١١٨٣)', () => {
  const validUntil = new Date('2026-09-19'); // @db.Date — يُحلَّل UTC حصراً
  const open = { validUntil, status: 'SENT' };

  it('الحالةُ التي سقطت: 21:02 UTC من يوم الصلاحية — ما زال يومَه، فالعرضُ حيّ', () => {
    expect(isQuoteExpired(open, new Date('2026-09-19T21:02:00Z'))).toBe(false);
    expect(isQuoteExpired(open, new Date('2026-09-19T23:59:59.999Z'))).toBe(false);
  });

  it('آخرُ يومٍ مشمول، وأوّلُ لحظةٍ بعده منقضية', () => {
    expect(isQuoteExpired(open, new Date('2026-09-19T00:00:00Z'))).toBe(false);
    expect(isQuoteExpired(open, new Date('2026-09-20T00:00:00Z'))).toBe(true);
    expect(isQuoteExpired(open, new Date('2026-09-18T12:00:00Z'))).toBe(false);
  });

  it('المحوَّلُ لا ينقضي — الحالةُ تسبق اليوم', () => {
    expect(isQuoteExpired({ validUntil, status: 'CONVERTED' }, new Date('2027-01-01T00:00:00Z'))).toBe(false);
  });

  it('وبإزاحةٍ معلَنة (الرياض +180) ينقضي عند منتصف ليل الرياض = 21:00 UTC — لا قبله ولا بعده', () => {
    expect(isQuoteExpired(open, new Date('2026-09-19T20:59:59Z'), KSA_UTC_OFFSET_MIN)).toBe(false);
    expect(isQuoteExpired(open, new Date('2026-09-19T21:00:00Z'), KSA_UTC_OFFSET_MIN)).toBe(true);
  });

  it('🔴 لا قراءةَ بمنطقة العملية في الدالّة — من نصّها لا من تشغيلها', () => {
    const src = readFileSync(join(__dirname, 'quote-expiry.util.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/\b(setHours|getHours|getDate|getMonth|getFullYear|toLocaleDateString|toLocaleString)\s*\(/);
    // المسبارُ يرى: الصياغةُ القديمة كانت تُمسَك.
    expect('endOfDay.setHours(23, 59, 59, 999)').toMatch(/\b(setHours|getHours|getDate|getMonth|getFullYear|toLocaleDateString|toLocaleString)\s*\(/);
  });
});
