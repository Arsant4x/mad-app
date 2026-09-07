import { apiClient } from './client';

export interface ReportLine {
  code: string;
  name: string;
  amount: number;
}

export interface IncomeStatement {
  from: string | null;
  to: string | null;
  revenue: ReportLine[];
  totalRevenue: number;
  expenses: ReportLine[];
  totalExpenses: number;
  netProfit: number;
  hasAnyPostedEntries: boolean;
}

export interface BalanceSheet {
  assets: ReportLine[];
  totalAssets: number;
  liabilities: ReportLine[];
  equity: ReportLine[];
  totalLiabilitiesAndEquity: number;
  balanced: boolean;
}

export interface CashFlow {
  netProfit: number;
  receivablesChange: number;
  payablesChange: number;
  operatingCashFlow: number;
  fixedAssetChange: number;
  netCashChange: number;
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
   * half empty, so maintenance stays in the denominator. */
  occupancyRate: number;
}

export interface PropertyKpis {
  occupancy: PropertyOccupancy[];
  portfolio: { totalProperties: number; totalUnits: number; rented: number; occupancyRate: number };
  collection: {
    /** Only instalments that have actually fallen due — next year's schedule
     * doesn't drag the rate down. */
    dueAmount: number;
    paidAmount: number;
    onTimeAmount: number;
    collectedRate: number;
    onTimeRate: number;
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
    ledgerBalance: number;
    shownBalance: number;
    difference: number;
    unpostedCount: number;
    unpostedSum: number;
  }[];
  totals: { ledgerBalance: number; shownBalance: number; difference: number; unpostedCount: number };
  /** إعلانُ ق-٢٨٣ — `null` حين لا قيدَ على بنكٍ بعد. */
  bankCashSeparatedOn: string | null;
}

export const getBankDifference = () => apiClient.get<BankDifference>('/reports/bank-difference').then((r) => r.data);

export interface TrialBalanceRow {
  code: string;
  name: string;
  debitTotal: number;
  creditTotal: number;
  balanceDebit: number;
  balanceCredit: number;
}

export interface TrialBalance {
  from: string | null;
  to: string | null;
  branchId: string | null;
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  totalBalanceDebit: number;
  totalBalanceCredit: number;
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
  current: number;
  d1: number;
  d31: number;
  d61: number;
  d90: number;
  /** دفعات على الحساب وإشعارات بلا فاتورة — تخفّض الذمّة بلا عمرٍ تنتمي إليه. */
  unapplied: number;
  total: number;
}

export interface AgingReport {
  asOf: string;
  branchId: string | null;
  customerId: string | null;
  rows: AgingRow[];
  totals: Omit<AgingRow, 'customerId' | 'customerName'>;
  /** يُحسب عند الطلب فقط — مسح الدفتر أثقل من التقرير نفسه. */
  reconciliation: { ledgerBalance: number; reportTotal: number; difference: number; accountMissing: boolean } | null;
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
