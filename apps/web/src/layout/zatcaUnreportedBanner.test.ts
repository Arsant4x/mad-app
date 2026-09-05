import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `ق-١٨٢`/١ — تحذيرُ «فواتيرك لا تصل الهيئة» **ظاهرٌ ومستمرٌ لا إشعارٌ يُغلق**،
 * وشرطُ قبول الختم المتزامن (`ق-١٩٦`): «وإلا شحنّا عمًى».
 *
 * الحارس يقرأ مصدر الهيكل: الشريط موجود، مشروطٌ بمنشأةٍ مربوطة وعددٍ موجب،
 * **وبلا زرّ إغلاق** — فتحذيرٌ يُغلق بنقرةٍ يعود إشعاراً، وهو ما نهى عنه الحكم.
 */
describe('شريط «فواتيرك لا تصل الهيئة» في الهيكل', () => {
  const source = readFileSync(resolve(__dirname, 'AppShell.tsx'), 'utf8');
  const start = source.indexOf('data-testid="zatca-unreported-banner"');

  it('الشريط قائمٌ، مشروطٌ بالربط وبعددٍ موجب', () => {
    expect(source.length).toBeGreaterThan(1000);
    expect(start).toBeGreaterThan(-1);
    expect(source).toMatch(/unreported\.onboarded && unreported\.count > 0 && \(/);
    expect(source).toContain('فواتيرك لا تصل الهيئة');
  });

  it('🔴 وبلا زرّ إغلاق — ظاهرٌ ومستمر', () => {
    // نطاق الشريط: من معرّفه إلى أول `)}` يغلق الشرط.
    const end = source.indexOf('\n        )}', start);
    const block = source.slice(start, end);
    expect(block.length).toBeGreaterThan(200);
    expect(block).not.toMatch(/onClick=\{\(\) => set/);
    expect(block).not.toMatch(/✕|إغلاق|dismiss|close/i);
  });

  it('ويستطلع دورياً لا مرةً واحدة — فمنشأةٌ تفشل فواتيرها بعد الفتح تراه', () => {
    expect(source).toMatch(/getZatcaUnreported\(\)[\s\S]{0,200}setInterval\(poll, UNREAD_POLL_MS\)/);
  });
});
