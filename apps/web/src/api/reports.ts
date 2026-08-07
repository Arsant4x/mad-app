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
