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

export const getIncomeStatement = (range: ReportRange) => apiClient.get<IncomeStatement>('/reports/income-statement', { params: range }).then((r) => r.data);
export const getBalanceSheet = () => apiClient.get<BalanceSheet>('/reports/balance-sheet').then((r) => r.data);
export const getCashFlow = (range: ReportRange) => apiClient.get<CashFlow>('/reports/cash-flow', { params: range }).then((r) => r.data);
