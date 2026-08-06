import { apiClient } from './client';

export interface BranchActivity {
  id: string;
  name: string;
  activityType: string | null;
}

export interface Branch {
  id: string;
  name: string;
  type: string | null;
  hours: string | null;
  activityId: string | null;
  activity: BranchActivity | null;
  propertyId: string | null;
  warehouseId: string | null;
}

export interface BranchInput {
  name: string;
  type?: string;
  hours?: string;
  propertyId?: string;
  warehouseId?: string;
}

/** Returns only the branches the signed-in user may see — the owner gets all,
 * an employee gets the ones assigned to them. So this is safe to use directly
 * as the options of a branch picker. */
export const listBranches = () => apiClient.get<Branch[]>('/branches').then((r) => r.data);
export const createBranch = (dto: BranchInput) => apiClient.post<Branch>('/branches', dto).then((r) => r.data);
export const updateBranch = (id: string, dto: Partial<BranchInput>) => apiClient.patch<Branch>(`/branches/${id}`, dto).then((r) => r.data);
export const deleteBranch = (id: string) => apiClient.delete(`/branches/${id}`).then(() => undefined);

export interface BranchSummaryRow {
  branchId: string | null;
  branchName: string;
  revenue: number;
  expenses: number;
  netIncome: number;
}

export interface BranchSummary {
  branches: BranchSummaryRow[];
  unassigned: BranchSummaryRow;
  consolidated: BranchSummaryRow;
}

export const getBranchSummary = (params: { from?: string; to?: string }) =>
  apiClient.get<BranchSummary>('/reports/branch-summary', { params }).then((r) => r.data);
