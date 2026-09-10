import { round2 } from '../common/money/rounding';
import {
  earnedFraction,
  monthEnd,
  periodDays,
  recognitionDates,
  recognitionSchedule,
  recognitionShareLabel,
  splitAtCollection,
} from './rent-recognition.util';

const d = (iso: string) => new Date(iso + 'T00:00:00');
const isoOf = (x: Date) =>
  `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;

describe('قاعدةُ الاعتراف بإيراد الإيجار (ق-٤٦٨ · ق-٤٧٤)', () => {
  describe('الكسرُ بالأيام', () => {
    it('صفرٌ قبل الفترة، وواحدٌ من آخر يومٍ فيها', () => {
      const p = { start: d('2026-03-01'), end: d('2026-03-31') };
      expect(earnedFraction(p, d('2026-02-28'))).toBe(0);
      expect(earnedFraction(p, d('2026-03-31'))).toBe(1);
      expect(earnedFraction(p, d('2026-04-10'))).toBe(1);
    });

    it('واليومُ الجاري مكتسَب — من سكن يوماً استحقّ يومَه', () => {
      const p = { start: d('2026-03-01'), end: d('2026-03-31') };
      expect(periodDays(p)).toBe(31);
      expect(earnedFraction(p, d('2026-03-01'))).toBeCloseTo(1 / 31, 10);
      expect(earnedFraction(p, d('2026-03-17'))).toBeCloseTo(17 / 31, 10);
    });
  });

  describe('القسمةُ لحظةَ القبض', () => {
    it('🔴 الدفعُ المقدَّم: كلُّه التزامٌ ولا إيراد — وهي ٢١٪ من الدفعات المقيسة', () => {
      const p = { start: d('2026-03-01'), end: d('2026-03-31') };
      expect(splitAtCollection(p, 3100, d('2026-02-20'))).toEqual({ earned: 0, deferred: 3100 });
    });

    it('⭐ ودفعةٌ عن فترةٍ انقضت: كلُّها إيرادٌ ولا التزام — فقيدُها قيدُ اليوم حرفياً', () => {
      const p = { start: d('2026-03-01'), end: d('2026-03-31') };
      expect(splitAtCollection(p, 3100, d('2026-04-05'))).toEqual({ earned: 3100, deferred: 0 });
    });

    it('والقبضُ في يوم الاستحقاق يؤجّل ثلاثين يوماً من واحدٍ وثلاثين', () => {
      const p = { start: d('2026-03-01'), end: d('2026-03-31') };
      const split = splitAtCollection(p, 3100, d('2026-03-01'));
      expect(split.earned).toBe(100);
      expect(split.deferred).toBe(3000);
      expect(round2(split.earned + split.deferred)).toBe(3100);
    });
  });

  describe('مواعيدُ الاعتراف — استحقاقاً لا نبضة', () => {
    it('🔴 فترةٌ داخل شهرٍ واحد: موعدٌ واحدٌ وكلُّ المبلغ فيه — فالقائمةُ الشهرية لا تتغيّر', () => {
      const p = { start: d('2026-03-01'), end: d('2026-03-31') };
      const steps = recognitionSchedule(p, 3100, d('2026-03-31'));
      expect(steps.map((s) => isoOf(s.date))).toEqual(['2026-03-31']);
      expect(steps[0].cumulative).toBe(3100);
    });

    it('🔴 وفترةٌ تعبر حدَّ الشهر تُقسَم بيومها — وهو العطلُ الذي بُني له هذا', () => {
      const p = { start: d('2026-03-15'), end: d('2026-04-14') };
      const steps = recognitionSchedule(p, 3100, d('2026-04-14'));
      expect(steps.map((s) => isoOf(s.date))).toEqual(['2026-03-31', '2026-04-14']);
      // ١٧ يوماً من ٣١ في مارس، والباقي في أبريل.
      expect(steps[0].cumulative).toBe(round2(3100 * (17 / 31)));
      expect(steps[1].cumulative).toBe(3100);
    });

    it('🔴 وشهرٌ فات لتعطّل المهمّة يعود بتاريخه هو — لا بتاريخ التعافي', () => {
      const p = { start: d('2026-01-01'), end: d('2026-12-31') };
      // لم تُشغَّل المهمّة في يناير ولا فبراير — والتشغيلُ في ١٥ مارس.
      const steps = recognitionSchedule(p, 12000, d('2026-03-15'));

      // الشهران الفائتان يعودان **بتاريخيهما**، فيُقرَآن في شهريهما لا في مارس.
      expect(steps.map((s) => isoOf(s.date))).toEqual(['2026-01-31', '2026-02-28']);
      expect(steps[0].cumulative).toBe(round2(12000 * (31 / 365)));
    });

    it('ولا يُعترَف بشهرٍ لم يكتمل — فقيدان في شهرٍ واحد يُقرآن تكراراً', () => {
      const p = { start: d('2026-01-01'), end: d('2026-12-31') };
      // مارس لم ينتهِ بعد: حصّتُه تنتظر ٣١ مارس، ولا تُرحَّل نصفَين.
      expect(recognitionDates(p, d('2026-03-15')).map(isoOf)).toEqual(['2026-01-31', '2026-02-28']);
      expect(recognitionDates(p, d('2026-03-31')).map(isoOf)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
    });

    it('ولا شهرَ يُقفَز عند فبراير — والجمعُ على اليوم كان يُسقطه', () => {
      const p = { start: d('2026-01-31'), end: d('2026-12-31') };
      const dates = recognitionDates(p, d('2026-04-30')).map(isoOf);
      expect(dates).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    });

    it('ولا موعدَ قبل بداية الفترة إطلاقاً', () => {
      const p = { start: d('2026-03-01'), end: d('2026-03-31') };
      expect(recognitionDates(p, d('2026-02-25'))).toEqual([]);
    });

    it('ونهايةُ الشهر تُقرأ من التقويم لا بعددٍ مكتوب', () => {
      expect(isoOf(monthEnd(d('2024-02-10')))).toBe('2024-02-29');
      expect(isoOf(monthEnd(d('2026-02-10')))).toBe('2026-02-28');
      expect(isoOf(monthEnd(d('2026-12-05')))).toBe('2026-12-31');
    });
  });

  describe('وصفُ القيد يحمل الحدَّ (ق-٤٨٠)', () => {
    it('🔴 «شهراً كاملاً» — فيعرف قارئُ الدفتر أن غيابَ قيدٍ للشهر الجاري انتظارُ اكتماله لا نقص', () => {
      const period = { start: d('2026-01-01'), end: d('2026-12-31') };
      expect(recognitionShareLabel(d('2026-03-31'), period.end)).toBe('حصّة شهر 2026-03 كاملاً');
    });

    it('وختامُ الفترة يُسمّى باسمه — فترةٌ تنتهي في منتصف شهرٍ تُقفَل في يومها', () => {
      const period = { start: d('2026-03-15'), end: d('2026-04-14') };
      expect(recognitionShareLabel(d('2026-04-14'), period.end)).toBe('حصّة 2026-04 حتى 2026-04-14 — ختام فترة الخدمة');
    });

    it('وفترةٌ تنتهي بآخر الشهر تجمع الوصفَين بلا تناقض', () => {
      const period = { start: d('2026-01-01'), end: d('2026-12-31') };
      expect(recognitionShareLabel(d('2026-12-31'), period.end)).toBe('حصّة شهر 2026-12 كاملاً — ختام فترة الخدمة');
    });

    it('ولا وصفَ واحدٌ لحالتَين مختلفتَين — مجسٌّ للمجسّ', () => {
      const wholeMonth = recognitionShareLabel(d('2026-03-31'), d('2026-12-31'));
      const periodClose = recognitionShareLabel(d('2026-04-14'), d('2026-04-14'));
      expect(wholeMonth).not.toBe(periodClose);
    });
  });

  describe('انغلاقُ الالتزام — التراكمُ لا الفروق', () => {
    it('🔴 مبلغٌ لا يقبل القسمة على اثني عشر يُغلق عند الصفر بالضبط', () => {
      const p = { start: d('2026-01-01'), end: d('2026-12-31') };
      const collected = 10000; // /365 يوماً — كسورٌ لا تنتهي
      const steps = recognitionSchedule(p, collected, d('2026-12-31'));

      expect(steps).toHaveLength(12);
      // الفروقُ المرحَّلة فعلاً — وهي ما يراه الدفتر.
      let previous = 0;
      let posted = 0;
      for (const s of steps) {
        posted = round2(posted + round2(s.cumulative - previous));
        previous = s.cumulative;
      }
      expect(posted).toBe(collected);
      expect(steps[steps.length - 1].cumulative).toBe(collected);
    });

    it('ومجسٌّ للمجسّ: جمعُ الفروق غيرِ المتراكمة ينحرف — وهو ما تجنّبناه', () => {
      const p = { start: d('2026-01-01'), end: d('2026-12-31') };
      const collected = 10000;
      // الطريقةُ الساذجة: كلُّ شهرٍ يُدوَّر وحدَه ثم تُجمع الشهور.
      const naive = recognitionDates(p, d('2026-12-31')).reduce((sum, date, i, all) => {
        const from = i === 0 ? p.start : new Date(all[i - 1].getTime() + 86400000);
        const days = Math.round((date.getTime() - from.getTime()) / 86400000) + 1;
        return round2(sum + round2((collected * days) / 365));
      }, 0);
      expect(naive).not.toBe(collected);
    });
  });
});
