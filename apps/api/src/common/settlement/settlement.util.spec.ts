import { readFileSync } from 'fs';
import { join } from 'path';
import { readsDeclaredStrings } from '../source-scan.util';
import { baseSettledOf, deriveSettlementStatus, withRemaining } from './settlement.util';

/**
 * المشتركُ بين سند القبض وسند الصرف — الدوالُّ النقيّة بجوابٍ محسوبٍ يداً، **وحارسُ الاستخراج**:
 * «استخراجُ المشترك لا نسخُه» شرطُ قبولٍ لا عبارة (`ق-٨٧١`) — فقفلُ الصفّ (`FOR UPDATE`) على
 * مستندات التسوية يعيش في هذا الملفّ وحدَه، ولا تحمل خدمةُ سندٍ نسخةً منه.
 */
describe('settlement.util — المشتركُ بين سندَي القبض والصرف', () => {
  describe('deriveSettlementStatus', () => {
    it('لا شيءَ مخصَّص ⇒ DUE · بعضُه ⇒ PARTIAL · كلُّه ⇒ PAID', () => {
      expect(deriveSettlementStatus(0, 1000)).toBe('DUE');
      expect(deriveSettlementStatus(400, 1000)).toBe('PARTIAL');
      expect(deriveSettlementStatus(1000, 1000)).toBe('PAID');
    });

    it('هللةُ تقريبٍ لا تُبقي المستندَ مفتوحاً، ونصفُ هللةٍ لا يجعله جزئياً', () => {
      expect(deriveSettlementStatus(999.996, 1000)).toBe('PAID');
      expect(deriveSettlementStatus(0.004, 1000)).toBe('DUE');
      expect(deriveSettlementStatus(0.01, 1000)).toBe('PARTIAL');
    });

    it('تخصيصٌ سالب (بعد عكسٍ أعاد أكثر مما خُصِّص) يُقرأ DUE لا PARTIAL', () => {
      expect(deriveSettlementStatus(-50, 1000)).toBe('DUE');
    });
  });

  describe('baseSettledOf — الذمّةُ بسعر المستند وما لم يُخصَّص بسعر السند', () => {
    it('١٠٠ دولار على فاتورةٍ بسعر 3.70 وسندٍ بسعر 3.80 ⇒ ٣٧٠ (والفارقُ ١٠ صرفٌ لا ذمّة)', () => {
      const rates = new Map([['inv', { exchangeRate: 3.7 }]]);
      expect(baseSettledOf(100, 3.8, [{ documentId: 'inv', amount: 100 }], rates)).toBe(370);
    });

    it('سندٌ ٥٠٠ منه ٣٠٠ على فاتورةٍ بسعر 3.70 و٢٠٠ على الحساب بسعر 3.80 ⇒ 1110 + 760 = 1870', () => {
      const rates = new Map([['inv', { exchangeRate: 3.7 }]]);
      expect(baseSettledOf(500, 3.8, [{ documentId: 'inv', amount: 300 }], rates)).toBe(1870);
    });

    it('بلا تخصيصٍ إطلاقاً: المبلغُ كلُّه على الحساب بسعر السند', () => {
      expect(baseSettledOf(250, 1, [], new Map())).toBe(250);
    });

    it('العكسُ (مبلغٌ وتخصيصاتٌ سالبة) يعطي حسبةَ الأصل مقلوبةَ الإشارة — فيتطابق القيدان طرفاً بطرف', () => {
      const rates = new Map([['inv', { exchangeRate: 3.7 }]]);
      const original = baseSettledOf(500, 3.8, [{ documentId: 'inv', amount: 300 }], rates);
      expect(baseSettledOf(-500, 3.8, [{ documentId: 'inv', amount: -300 }], rates)).toBe(-original);
      expect(original).toBe(1870);
    });
  });

  describe('withRemaining — المفتوحُ وحدَه بمتبقّيه', () => {
    it('يُسقط المسدَّدَ كاملاً ويُبقي الجزئيَّ والمفتوح بمتبقٍّ محسوب', () => {
      const docs = [
        { id: 'a', total: '1000' },
        { id: 'b', total: '400' },
        { id: 'c', total: '250' },
      ];
      const allocated = new Map([
        ['a', 400],
        ['b', 400],
      ]);
      expect(withRemaining(docs, allocated)).toEqual([
        { id: 'a', total: '1000', allocated: 400, remaining: 600 },
        { id: 'c', total: '250', allocated: 0, remaining: 250 },
      ]);
    });
  });

  describe('حارسُ الاستخراج (ق-٨٧١)', () => {
    // يقرأ النصَّ **بسلاسله** عمداً: قفلُ الصفّ يعيش داخل قالب استعلامٍ خامّ، وتجريدُ السلاسل
    // كان سيُعمي الحارسَ عن نسخةٍ منه في خدمة سند.
    readsDeclaredStrings();

    /** خدمتا السندَين: لا `FOR UPDATE` ولا `groupBy` على التخصيصات فيهما — كلاهما هنا وحدَه. */
    const services = [
      join(__dirname, '..', '..', 'payments', 'payments.service.ts'),
      join(__dirname, '..', '..', 'purchases', 'supplier-payments.service.ts'),
    ];

    it('يقرأ الملفّين فعلاً (§8.7: الحارسُ يُثبت أنه قرأ شيئاً)', () => {
      for (const path of services) expect(readFileSync(path, 'utf8').length).toBeGreaterThan(1000);
    });

    it('قفلُ الصفّ ومجموعُ التخصيصات لا يُنسخان إلى خدمة سند', () => {
      const offenders = services
        .map((path) => ({ path, text: readFileSync(path, 'utf8') }))
        .filter(({ text }) => /FOR UPDATE/.test(text) || /Allocation\.groupBy\(/.test(text))
        .map(({ path }) => path);
      expect(offenders).toEqual([]);
    });

    it('كلتا الخدمتين تستدعيان الآليةَ المشتركة لا نسخةً منها', () => {
      for (const path of services) {
        const text = readFileSync(path, 'utf8');
        expect({ path, usesShared: /from '\.\.\/common\/settlement\/settlement\.util'/.test(text) }).toEqual({ path, usesShared: true });
        expect({ path, locks: /lockAndAssertAllocationsFit\(/.test(text) }).toEqual({ path, locks: true });
      }
    });
  });
});
