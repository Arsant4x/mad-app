import { orderLayersForConsumption } from './costing.util';

/**
 * ٥+٦ ترتيبُ الصرف بالسياسة (`ق-١٠٧٦`/٢ · `ق-١٠٨٦`) — الدالةُ النقيّة وحدَها:
 *   `FIFO` بالعمر كما كان؛ و`FEFO` ما لا دفعةَ له أوّلاً بعمره (لا تُخمَّن دفعتُه — `ق-١٠٧٦`/٣) ثم الدفعاتُ بالأقرب
 *   انتهاءً فالعمر. والمنتهيةُ أقربُ الكلّ فتتصدّر — للشطب والإعادة؛ والبيعُ يستثنيها في `consumeFifo` لا هنا.
 */
const day = (n: number) => new Date(Date.UTC(2026, 8, 1 + n));
const layer = (id: string, acquired: number, created: number, expiry: number | null) => ({
  id,
  acquiredAt: day(acquired),
  createdAt: day(created),
  batch: expiry === null ? null : { expiryDate: day(expiry) },
});

describe('٥+٦ ترتيبُ الطبقات للاستهلاك — سياسةٌ تُقرأ لا ثابت', () => {
  const old = layer('old', 0, 0, 300); // الأقدمُ اقتناءً، انتهاؤه بعيد
  const fresh = layer('fresh', 10, 10, 30); // الأحدثُ اقتناءً، ينتهي قريباً
  const expired = layer('expired', 5, 5, -1); // منتهية
  const legacy = layer('legacy', 20, 20, null); // بلا دفعة — سبقت البناء

  it('FIFO: بالعمر وحدَه — الانتهاءُ لا يُقرأ', () => {
    expect(orderLayersForConsumption([fresh, expired, legacy, old], 'FIFO').map((l) => l.id)).toEqual(['old', 'expired', 'fresh', 'legacy']);
  });

  it('FEFO: بلا دفعةٍ أوّلاً بعمره، ثم بالأقرب انتهاءً — والمنتهيةُ تتصدّر الدفعات', () => {
    expect(orderLayersForConsumption([fresh, expired, legacy, old], 'FEFO').map((l) => l.id)).toEqual(['legacy', 'expired', 'fresh', 'old']);
  });

  it('FEFO: انتهاءان متساويان يُفصَل بينهما بالعمر ثم بلحظة الإنشاء', () => {
    const a = layer('a', 3, 3, 40);
    const b = layer('b', 1, 9, 40);
    const c = layer('c', 1, 2, 40);
    expect(orderLayersForConsumption([a, b, c], 'FEFO').map((l) => l.id)).toEqual(['c', 'b', 'a']);
  });

  it('لا تُعدِّل المصفوفةَ المُدخَلة', () => {
    const input = [fresh, old];
    orderLayersForConsumption(input, 'FEFO');
    expect(input.map((l) => l.id)).toEqual(['fresh', 'old']);
  });
});
