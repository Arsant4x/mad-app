import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

// ⏱️ ميزانيةُ الملفّ (ق-١٣٣٢): ثلاثةُ أضعاف أعلى زمنٍ مقيسٍ له تحت حِمل الحزمة كاملةً (0.0 ث — ثلاثةُ أضعافه دون الافتراضيّ، فالميزانيةُ الافتراضيُّ نفسُه).
//    معلنةٌ هنا لا في الإعداد العامّ — فرفعُ السقف العامّ يُخفي البطيءَ ولا يسمّيه.
vi.setConfig({ testTimeout: 5_000 });

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

  it('🔴 والإيصالُ الأوفلاين كذلك: ZatcaQr داخل منطقة طباعته، مع نصّ «الممتثلة تصدر عند العودة» (ق-١٨٨ · ق-١٩٢/أ)', () => {
    const start = source.indexOf('مرجع مؤقت:');
    const notice = source.indexOf('تُصدَر الفاتورة الممتثلة تلقائياً بتاريخ هذا البيع فور عودة الاتصال', start);
    const qr = source.indexOf('<ZatcaQr payload={offlineReceipt.zatcaQr}', start);
    const end = source.indexOf('modal-foot', start);
    expect(start).toBeGreaterThan(-1);
    expect(notice).toBeGreaterThan(start);
    expect(qr).toBeGreaterThan(notice);
    expect(end).toBeGreaterThan(qr);
    // ويُبنى على الجهاز لا يُنتظر من الخادم — والطابع من ساعة الجهاز نفسها.
    expect(source).toContain('buildPhase1Qr({');
    expect(source).toContain('wallClockOf(new Date(sale.ringAt), sale.ringOffsetMin)');
  });

  it('ولا يُستبدَل الرمزُ الغائب برمزٍ وهميّ — بل تنبيهٌ للكاشير خارج الإيصال', () => {
    // رمزٌ يُقرأ ولا يصحّ أسوأ من غيابه (قاعدة QR المرحلة الأولى)؛ فحين يكون
    // `zatcaQr` فارغاً لا يُرسم شيء، ويُنبَّه الكاشير إلى إكمال ملف المنشأة.
    expect(source).toMatch(/receipt\.zatcaQr && \(/);
    // ⑤A4: الكاملةُ المحجوبة حتى الإجازة تخرج بلا رمزٍ **عمداً** — فتنبيهُ «أكمل الملفّ» لا يُعرض لها، ويُعرض حجبُها.
    expect(source).toMatch(/!receipt\.zatcaQr && !receipt\.clearance\?\.required && \(/);
    expect(source).toMatch(/receipt\.clearance\?\.required && \(/);
    expect(source).toContain('أكمل الاسم القانوني والرقم الضريبي');
  });
});
