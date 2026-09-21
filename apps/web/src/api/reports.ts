import type { MoneyText, PercentText } from '../lib/money';
import { apiClient } from './client';

/**
 * ② مرآةُ التقارير — **كلُّ مبلغٍ نصٌّ بخانتين وكلُّ نسبةٍ نصٌّ بخانتين** (`ق-١٢٣٥`): تُعرض بـ`fmt()` كما هي،
 * وتُقرأ بـ`num()`/`num0()` قبل أي مقارنةٍ أو حساب؛ والعدُّ (وحداتٌ · أقساطٌ · قيود) رقمٌ كما هو.
 */
export interface ReportLine {
  code: string;
  name: string;
  amount: MoneyText;
}

export interface IncomeStatement {
  from: string | null;
  to: string | null;
  revenue: ReportLine[];
  totalRevenue: MoneyText;
  expenses: ReportLine[];
  totalExpenses: MoneyText;
  netProfit: MoneyText;
  hasAnyPostedEntries: boolean;
}

export interface BalanceSheet {
  assets: ReportLine[];
  totalAssets: MoneyText;
  liabilities: ReportLine[];
  equity: ReportLine[];
  totalLiabilitiesAndEquity: MoneyText;
  balanced: boolean;
}

export interface CashFlow {
  netProfit: MoneyText;
  receivablesChange: MoneyText;
  payablesChange: MoneyText;
  /** Δ2400 — قبضٌ يُؤجَّل (كان ناقصاً منذ بُني الإيراد المؤجَّل — ق-٩٢٣). */
  deferredRevenueChange: MoneyText;
  /** Δ2200 — ضريبةٌ مستحقّة لم تُسدَّد. */
  outputVatChange: MoneyText;
  operatingCashFlow: MoneyText;
  fixedAssetChange: MoneyText;
  netCashChange: MoneyText;
  missingAccounts: string[];
}

export interface ReportRange {
  from?: string;
  to?: string;
}

export interface PropertyOccupancy {
  propertyId: string;
  propertyName: string;
  total: number;
  rented: number;
  reserved: number;
  vacant: number;
  maintenance: number;
  /** Rented ÷ **total** units — a building half under maintenance really is
   * half empty, so maintenance stays in the denominator. نسبةٌ نصّاً بخانتين. */
  occupancyRate: PercentText;
}

export interface PropertyKpis {
  occupancy: PropertyOccupancy[];
  portfolio: { totalProperties: number; totalUnits: number; rented: number; occupancyRate: PercentText };
  collection: {
    /** Only instalments that have actually fallen due — next year's schedule
     * doesn't drag the rate down. */
    dueAmount: MoneyText;
    paidAmount: MoneyText;
    onTimeAmount: MoneyText;
    collectedRate: PercentText;
    onTimeRate: PercentText;
    overdueCount: number;
  };
  expiring: {
    within30: number;
    within60: number;
    within90: number;
    alreadyRenewed: number;
    contracts: { id: string; no: string; tenant: string; end: string; value: string; daysLeft: number; unitNo: string; propertyName: string }[];
  };
}

export const getPropertyKpis = () => apiClient.get<PropertyKpis>('/reports/property-kpis').then((r) => r.data);

export const getIncomeStatement = (range: ReportRange) => apiClient.get<IncomeStatement>('/reports/income-statement', { params: range }).then((r) => r.data);
export const getBalanceSheet = () => apiClient.get<BalanceSheet>('/reports/balance-sheet').then((r) => r.data);
export const getCashFlow = (range: ReportRange) => apiClient.get<CashFlow>('/reports/cash-flow', { params: range }).then((r) => r.data);

/** تقريرُ الفرق (ق-٢٨٥/٣): الرصيدُ الدفتريّ مقابل ما كان يُعرض. */
export interface BankDifference {
  rows: {
    bankId: string;
    bankName: string;
    accountCode: string | null;
    ledgerBalance: MoneyText;
    shownBalance: MoneyText;
    difference: MoneyText;
    unpostedCount: number;
    unpostedSum: MoneyText;
  }[];
  totals: { ledgerBalance: MoneyText; shownBalance: MoneyText; difference: MoneyText; unpostedCount: number };
  /** إعلانُ ق-٢٨٣ — `null` حين لا قيدَ على بنكٍ بعد. */
  bankCashSeparatedOn: string | null;
}

export const getBankDifference = () => apiClient.get<BankDifference>('/reports/bank-difference').then((r) => r.data);

/**
 * الإيرادُ المؤجَّل (`ق-٤٦٨`) — **الالتزامُ القائم بتفصيله**، ومعه **ما لم يمرّ
 * به** (`ق-٤٧٣`): دفعاتٌ بلا قسطٍ مرتبط اعتُرف بها إيراداً فوراً.
 */
export interface DeferredRevenue {
  outstanding: {
    contractNo: string;
    tenant: string;
    unitNo: string | null;
    serviceStart: string;
    serviceEnd: string;
    collected: MoneyText;
    recognized: MoneyText;
    deferred: MoneyText;
  }[];
  totalDeferred: MoneyText;
  unlinked: { date: string; contractNo: string; tenant: string; baseNetAmount: MoneyText }[];
  totalUnlinked: MoneyText;
  unlinkedNote: string;
}

export const getDeferredRevenue = () => apiClient.get<DeferredRevenue>('/reports/deferred-revenue').then((r) => r.data);

export interface TrialBalanceRow {
  code: string;
  name: string;
  debitTotal: MoneyText;
  creditTotal: MoneyText;
  balanceDebit: MoneyText;
  balanceCredit: MoneyText;
}

export interface TrialBalance {
  from: string | null;
  to: string | null;
  branchId: string | null;
  rows: TrialBalanceRow[];
  totalDebit: MoneyText;
  totalCredit: MoneyText;
  totalBalanceDebit: MoneyText;
  totalBalanceCredit: MoneyText;
  balanced: boolean;
}

export const getTrialBalance = (params: { from?: string; to?: string; branchId?: string }) =>
  apiClient.get<TrialBalance>('/reports/trial-balance', { params }).then((r) => r.data);

/** تنزيل CSV عبر blob — الرأس Authorization يمرّ مع apiClient لا مع رابط عارٍ. */
export const downloadTrialBalanceCsv = async (params: { from?: string; to?: string; branchId?: string }) => {
  const res = await apiClient.get('/reports/trial-balance/export', { params, responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `trial-balance-${params.from ?? 'all'}-${params.to ?? 'all'}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

/** صفّ عميل في تقرير أعمار الذمم (4.6) — كل المبالغ بالعملة الأساسية. */
export interface AgingRow {
  customerId: string;
  customerName: string;
  current: MoneyText;
  d1: MoneyText;
  d31: MoneyText;
  d61: MoneyText;
  d90: MoneyText;
  /** دفعات على الحساب وإشعارات بلا فاتورة — تخفّض الذمّة بلا عمرٍ تنتمي إليه. */
  unapplied: MoneyText;
  total: MoneyText;
}

/** قسطُ إيجارٍ استُحقّ ولم يُقبض — الصفُّ الثاني في الأعمار (ق-٩٢٥/④). */
export interface RentAgingRow {
  customerId: string;
  customerName: string;
  contractNo: string;
  tenant: string;
  unitNo: string | null;
  installmentId: string;
  dueDate: string;
  accrued: MoneyText;
  paid: MoneyText;
  remaining: MoneyText;
  bucket: 'current' | 'd1' | 'd31' | 'd61' | 'd90';
}

export interface AgingReport {
  asOf: string;
  branchId: string | null;
  customerId: string | null;
  rows: AgingRow[];
  rentRows: RentAgingRow[];
  rentNote: string;
  totals: Omit<AgingRow, 'customerId' | 'customerName'> & { rent: MoneyText };
  /** يُحسب عند الطلب فقط — مسح الدفتر أثقل من التقرير نفسه. */
  reconciliation: { ledgerBalance: MoneyText; reportTotal: MoneyText; difference: MoneyText; accountMissing: boolean } | null;
}

export interface AgingParams {
  asOf?: string;
  branchId?: string;
  customerId?: string;
  reconcile?: string;
}

export const getReceivablesAging = (params: AgingParams) =>
  apiClient.get<AgingReport>('/reports/receivables-aging', { params }).then((r) => r.data);

export const downloadReceivablesAgingCsv = async (params: AgingParams) => {
  const res = await apiClient.get('/reports/receivables-aging/export', { params, responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `receivables-aging-${params.asOf ?? 'today'}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};
