import { round2 } from '../common/money/rounding';
import { CUSTOMER_PREPAYMENTS_CODE } from '../journal/prepayment-account.util';
import { DEFERRED_REVENUE_ACCOUNT_CODE } from '../journal/deferred-revenue-account.util';
import { INVENTORY_ACCOUNT_CODE } from '../journal/inventory-accounts.util';
import { KEY_MONEY_ASSET_ACCOUNT } from '../journal/auto-posting.util';
import { RETAINED_EARNINGS_CODE } from '../fiscal/year-closing.util';

/**
 * ⚖️ **قائمةُ التدفّقات النقدية بالطريقة غير المباشرة — من كلِّ حسابٍ لا من قائمةٍ مسرودة** (توجيه ٢٧٨ · القاعدة ٣٧).
 *
 * ## ما كان
 *
 * التشغيليُّ = الربحُ − Δ`1200` + Δ`2100` + Δ`2400` + Δ`2200` + Δ`2450`، والصافي = التشغيليُّ − Δ`1400`. **ستّةُ حساباتٍ مسرودة**،
 * فكلُّ حركةٍ على غيرها تُخرج رقماً خاطئاً: شراءُ مخزونٍ بالآجل (`1300`) يظهر نقداً داخلاً بقيمته، وضريبةُ المدخلات (`1250`)
 * كذلك، وحصّةُ المالك (`2500`) وتأميناتُ المستأجرين (`2300`) ووسيطُ الاستلام تغيب، ورأسُ المال لا قسمَ له فيغيب نقدُه.
 *
 * ## ما صار
 *
 * **كلُّ حسابٍ في الميزانية يدخل قسمَه**، والنقدُ يُقاس مباشرةً من حساباته ويُطابَق بالمجموع (كتوازن المركز المالي: خاصيةٌ لا أمل):
 *   · **النقد**: `1000` وحساباتُ البنوك والصناديق والأدراج — يُقاس تغيّرُها ولا يدخل الأقسام.
 *   · **الاستثمار**: الأصولُ الثابتة `1400` والتقبيلُ وحقوقُ الانتفاع `1600` — شراؤها نقدٌ خارج.
 *   · **التمويل**: حقوقُ الملكية إلا المبقاة (`3300`).
 *   · **التشغيل**: الربحُ، ومعه ما أُقفل منه إلى المبقاة في الفترة (فقيدُ الإقفال يصفّر الإيرادَ والمصروفَ مقابلها)، وتغيّرُ كلِّ
 *     أصلٍ والتزامٍ آخر.
 * **والأرصدةُ الافتتاحية ليست تدفّقاً**: القيودُ على `3900` تُستثنى من الحركات قبل هذه الدالّة (`reports.service`).
 *
 * ⚠️ **حدُّه معلَن**: حسابٌ يُنشئه التاجرُ بيده (أصلٌ ثابتٌ برمزٍ آخر · قرضٌ طويل) يدخل التشغيلَ لأنه لا يُعرف قسمُه من رمزه؛
 * والمطابقةُ تبقى صادقة لأن الصافيَ مقيسٌ من النقد لا من الأقسام.
 */

export const CASH_CODE = '1000';
export const FIXED_ASSETS_CODE = '1400';
const RECEIVABLES = '1200';
const INPUT_VAT = '1250';
const PAYABLES = '2100';
const OUTPUT_VAT = '2200';

/** حسابٌ بتغيّره في الفترة **باتجاهه الطبيعيّ** (المدينُ مديناً − دائناً، والدائنُ عكسه). */
export interface CashFlowAccount {
  id: string;
  code: string;
  type: string;
  delta: number;
}

export interface CashFlowFigures {
  netProfit: number;
  /** ما أُقفل من الربح إلى المبقاة في الفترة — يُعاد إلى الربح. */
  retainedEarningsChange: number;
  receivablesChange: number;
  inventoryChange: number;
  inputVatChange: number;
  payablesChange: number;
  outputVatChange: number;
  deferredRevenueChange: number;
  customerPrepaymentsChange: number;
  /** أثرُ بقيّة الأصول والالتزامات على النقد، بإشارته (الأصلُ يُطرح والالتزامُ يُضاف). */
  otherOperatingChange: number;
  operatingCashFlow: number;
  fixedAssetChange: number;
  keyMoneyChange: number;
  investingCashFlow: number;
  financingCashFlow: number;
  netCashChange: number;
  /** تغيّرُ حسابات النقد مقيساً — ويساوي الصافيَ بالقيد المزدوج. */
  cashAccountsChange: number;
  reconciled: boolean;
}

export function cashFlowStatement(accounts: readonly CashFlowAccount[], cashIds: ReadonlySet<string>): CashFlowFigures {
  const f = {
    netProfit: 0,
    retainedEarningsChange: 0,
    receivablesChange: 0,
    inventoryChange: 0,
    inputVatChange: 0,
    payablesChange: 0,
    outputVatChange: 0,
    deferredRevenueChange: 0,
    customerPrepaymentsChange: 0,
    otherOperatingChange: 0,
    fixedAssetChange: 0,
    keyMoneyChange: 0,
    financingCashFlow: 0,
    cashAccountsChange: 0,
  };
  for (const a of accounts) {
    const d = a.delta;
    if (a.type === 'revenue') f.netProfit += d;
    else if (a.type === 'expense') f.netProfit -= d;
    else if (cashIds.has(a.id)) f.cashAccountsChange += a.type === 'asset' ? d : -d;
    else if (a.code === FIXED_ASSETS_CODE) f.fixedAssetChange += d;
    else if (a.code === KEY_MONEY_ASSET_ACCOUNT) f.keyMoneyChange += d;
    else if (a.code === RETAINED_EARNINGS_CODE && a.type === 'equity') f.retainedEarningsChange += d;
    else if (a.type === 'equity') f.financingCashFlow += d;
    else if (a.code === RECEIVABLES) f.receivablesChange += d;
    else if (a.code === INVENTORY_ACCOUNT_CODE) f.inventoryChange += d;
    else if (a.code === INPUT_VAT) f.inputVatChange += d;
    else if (a.code === PAYABLES) f.payablesChange += d;
    else if (a.code === OUTPUT_VAT) f.outputVatChange += d;
    else if (a.code === DEFERRED_REVENUE_ACCOUNT_CODE) f.deferredRevenueChange += d;
    else if (a.code === CUSTOMER_PREPAYMENTS_CODE) f.customerPrepaymentsChange += d;
    else if (a.type === 'asset') f.otherOperatingChange -= d;
    else if (a.type === 'liability') f.otherOperatingChange += d;
  }
  const operatingCashFlow = round2(
    f.netProfit +
      f.retainedEarningsChange -
      f.receivablesChange -
      f.inventoryChange -
      f.inputVatChange +
      f.payablesChange +
      f.outputVatChange +
      f.deferredRevenueChange +
      f.customerPrepaymentsChange +
      f.otherOperatingChange,
  );
  const investingCashFlow = round2(-(f.fixedAssetChange + f.keyMoneyChange));
  const financingCashFlow = round2(f.financingCashFlow);
  const netCashChange = round2(operatingCashFlow + investingCashFlow + financingCashFlow);
  const cashAccountsChange = round2(f.cashAccountsChange);
  return {
    netProfit: round2(f.netProfit),
    retainedEarningsChange: round2(f.retainedEarningsChange),
    receivablesChange: round2(f.receivablesChange),
    inventoryChange: round2(f.inventoryChange),
    inputVatChange: round2(f.inputVatChange),
    payablesChange: round2(f.payablesChange),
    outputVatChange: round2(f.outputVatChange),
    deferredRevenueChange: round2(f.deferredRevenueChange),
    customerPrepaymentsChange: round2(f.customerPrepaymentsChange),
    otherOperatingChange: round2(f.otherOperatingChange),
    operatingCashFlow,
    fixedAssetChange: round2(f.fixedAssetChange),
    keyMoneyChange: round2(f.keyMoneyChange),
    investingCashFlow,
    financingCashFlow,
    netCashChange,
    cashAccountsChange,
    reconciled: Math.abs(netCashChange - cashAccountsChange) < 0.01,
  };
}
