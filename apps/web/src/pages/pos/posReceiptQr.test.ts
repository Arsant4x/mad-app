import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `ق-١٨٦` — **رمز الهيئة على إيصال العميل، داخل منطقة الطباعة لا خارجها.**
 *
 * الملحق (١) من قرار التنفيذ: `QR` إلزاميٌّ **توليداً وطباعةً** على الفاتورة
 * المبسّطة. والعطل الذي كان: الرمز يُبنى ويُعرض في قائمة الفواتير وحدها، وإيصال
 * الكاشير — الورقةُ التي يخرج بها العميل — **بلا رمزٍ إطلاقاً**. فالحارس يقرأ
 * مصدر الصفحة ويسقط إن غاب `ZatcaQr` عن `#pos-receipt` أو انتقل خارج منطقة
 * الطباعة (فيُعرض على الشاشة ولا يُطبع — والطباعة هي الالتزام).
 */
describe('إيصال الكاشير يحمل رمز الهيئة داخل منطقة الطباعة', () => {
  const source = readFileSync(resolve(__dirname, 'PosPage.tsx'), 'utf8');

  it('ZatcaQr يقع بين بداية #pos-receipt ونهاية منطقة الطباعة', () => {
    expect(source.length).toBeGreaterThan(1000); // قراءةٌ فاشلة تُسقط ولا تمرّ
    const start = source.indexOf('id="pos-receipt"');
    const qr = source.indexOf('<ZatcaQr', start);
    const end = source.indexOf('خارج .print-receipt عمداً', start);
    expect(start).toBeGreaterThan(-1);
    expect(qr).toBeGreaterThan(start);
    expect(end).toBeGreaterThan(qr);
  });

  it('ولا يُستبدَل الرمزُ الغائب برمزٍ وهميّ — بل تنبيهٌ للكاشير خارج الإيصال', () => {
    // رمزٌ يُقرأ ولا يصحّ أسوأ من غيابه (قاعدة QR المرحلة الأولى)؛ فحين يكون
    // `zatcaQr` فارغاً لا يُرسم شيء، ويُنبَّه الكاشير إلى إكمال ملف المنشأة.
    expect(source).toMatch(/receipt\.zatcaQr && \(/);
    expect(source).toMatch(/!receipt\.zatcaQr && \(/);
    expect(source).toContain('أكمل الاسم القانوني والرقم الضريبي');
  });
});
