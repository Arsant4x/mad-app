import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * `ق-١٨٥` — **حارسٌ يقرأ المصدر**: لا يومَ ولا وقتَ في مستند الهيئة أو `QR` أو
 * الكاشير يُشتقّ من `toISOString()` مباشرةً.
 *
 * العطل الذي يحرسه: `toISOString().slice(0, 10)` يُعطي يومَ UTC، و`.slice(11, 19)`
 * وقتَ UTC **بصيغة المحلي** — وكلاهما كان قائماً وسبّب `IssueTime = 00:00:00`
 * وتأريخَ بيعِ الواحدة صباحاً بأمس. الصيغةُ الوحيدة المشروعة تمرّ من
 * `common/wall-clock.util.ts`، فهذا الحارس يسقط إن عاد الاشتقاقُ المباشر إلى أي
 * ملفٍ من الأربعة.
 */
describe('يومُ الإصدار ووقتُه من الجهاز لا من UTC متنكّر', () => {
  const files = [
    join(__dirname, 'ubl', 'invoice-xml.util.ts'),
    join(__dirname, 'ubl', 'xades.util.ts'),
    join(__dirname, 'qr.util.ts'),
    join(__dirname, '..', 'pos', 'pos.service.ts'),
  ];

  /** الكود بلا تعليقاته — كي لا يُحسب تاريخُ العطل المكتوب في تعليقٍ عودةً له. */
  const codeOnly = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it.each(files)('🔴 %s لا يشتقّ يوماً (slice 0,10) أو وقتاً (slice 11,19) من toISOString', (file) => {
    const source = readFileSync(file, 'utf8');
    expect(source.length).toBeGreaterThan(500); // قراءةٌ فاشلة تُسقط ولا تمرّ
    const code = codeOnly(source);
    // الشكلان بعينهما — لا `slice(0, 19)` الذي يُصدر طابعاً كاملاً UTC بـ`Z` (SigningTime) وهو مشروع.
    expect(code).not.toMatch(/toISOString\(\)\.slice\((0,\s*10|11,\s*19)\)/);
    expect(code).not.toMatch(/issuedAt\.toISOString\(\)/);
  });

  it('🔴 مستندُ الهيئة و`QR` يأخذان ساعةَ الحائط الجاهزة لا لحظةً يفسّرانها', () => {
    const xml = readFileSync(files[0], 'utf8');
    const xades = readFileSync(files[1], 'utf8');
    const qr = readFileSync(files[2], 'utf8');
    expect(xml).toContain('input.issued.date');
    expect(xml).toContain('input.issued.time');
    expect(xades).toContain('qrTimestamp(input.issued)');
    expect(qr).toContain('qrTimestamp(input.issued)');
  });
});
