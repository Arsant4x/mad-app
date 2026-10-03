import { cashFlowStatement, type CashFlowAccount } from './cash-flow.util';

/** حسابٌ بتغيّره باتجاهه الطبيعيّ. */
const acc = (code: string, type: string, delta: number, id = code): CashFlowAccount => ({ id, code, type, delta });

describe('قائمةُ التدفّقات من كلِّ حساب (توجيه ٢٧٨ · القاعدة ٣٧)', () => {
  it('① الإقفالُ يُعاد إلى الربح: سنةٌ أُقفلت داخل الفترة لا تخرج تشغيليّاً صفراً', () => {
    // بيعٌ نقديّ 1,000 ثم إقفالُه: الإيرادُ صافيه صفر في الفترة، والمبقاةُ +1,000، والنقدُ +1,000.
    const f = cashFlowStatement([acc('4100', 'revenue', 0), acc('3300', 'equity', 1000), acc('1000', 'asset', 1000, 'cash')], new Set(['cash']));
    expect(f.netProfit).toBe(0);
    expect(f.retainedEarningsChange).toBe(1000);
    expect(f.operatingCashFlow).toBe(1000);
    expect(f.financingCashFlow).toBe(0);
    expect(f.reconciled).toBe(true);
  });

  it('② حسابٌ لا تعرفه القائمة يدخل التشغيلَ بإشارته، والتأميناتُ وحصّةُ المالك منه', () => {
    // تأمينٌ مقبوضٌ نقداً 500 (`2300`) وأصلٌ آخر يُنشئه التاجر (`1270`) بالآجل 200 مقابل `2500`.
    const f = cashFlowStatement(
      [acc('2300', 'liability', 500), acc('1270', 'asset', 200), acc('2500', 'liability', 200), acc('1000', 'asset', 500, 'cash')],
      new Set(['cash']),
    );
    expect(f.otherOperatingChange).toBe(500);
    expect(f.operatingCashFlow).toBe(500);
    expect(f.netCashChange).toBe(500);
    expect(f.reconciled).toBe(true);
  });

  it('③ التقبيلُ استثمار، وحقوقُ الملكية تمويل، والمطابقةُ تسقط إن لم تتّسق الأرقام', () => {
    const f = cashFlowStatement([acc('1600', 'asset', 3000), acc('3100', 'equity', 3000)], new Set());
    expect(f.investingCashFlow).toBe(-3000);
    expect(f.financingCashFlow).toBe(3000);
    expect(f.netCashChange).toBe(0);
    expect(f.reconciled).toBe(true);
    // مسبارُ المطابقة بحالةٍ يجب أن تسقط: نقدٌ تحرّك بلا مقابل.
    expect(cashFlowStatement([acc('1000', 'asset', 100, 'cash')], new Set(['cash'])).reconciled).toBe(false);
  });
});
