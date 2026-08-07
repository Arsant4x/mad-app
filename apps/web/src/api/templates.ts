import { apiClient } from './client';

/** Mirrors apps/api/src/templates/screens.ts — keep in sync. */
export const ALLOWED_SCREENS = [
  'dashboard',
  'accounts',
  'journal',
  'fiscal',
  'branches',
  'settings',
  'invoice',
  'customers',
  'suppliers',
  'products',
  'inventory',
  'properties',
  'contracts',
  'maintenance',
  'employees',
  'banks',
  'transactions',
  'obligations',
  'reports',
  'scripts',
] as const;

export const SCREEN_LABELS: Record<(typeof ALLOWED_SCREENS)[number], string> = {
  dashboard: 'لوحة التحكم',
  accounts: 'دليل الحسابات',
  journal: 'دفتر اليومية',
  fiscal: 'السنة المالية والفترات',
  branches: 'الفروع',
  settings: 'الأنشطة والعملات',
  invoice: 'الفواتير',
  customers: 'العملاء',
  suppliers: 'الموردون',
  products: 'المنتجات والخدمات',
  inventory: 'إدارة المخزون',
  properties: 'العقارات والوحدات',
  contracts: 'عقود الإيجار',
  maintenance: 'الصيانة',
  employees: 'الموظفون والموارد البشرية',
  banks: 'البنوك',
  transactions: 'الحركات البنكية',
  obligations: 'الالتزامات الحكومية',
  reports: 'التقارير المالية',
  scripts: 'قوالب الرسائل',
};

/** Actions a permission can grant on a screen — mirrors SCREEN_ACTIONS in
 * apps/api/src/templates/screens.ts. Keep both in sync. */
export const SCREEN_ACTIONS = ['view', 'add', 'edit', 'delete', 'record', 'review', 'audit'] as const;
export type ScreenAction = (typeof SCREEN_ACTIONS)[number];

export const ACTION_LABELS: Record<ScreenAction, string> = {
  view: 'اطلاع',
  add: 'إضافة',
  edit: 'تعديل',
  delete: 'حذف',
  record: 'تسجيل',
  review: 'مراجعة',
  audit: 'تدقيق',
};

/** { screen: [actions] }. A screen present in allowedScreens with no entry
 * here means every action on it. */
export type ScreenActionMap = Record<string, ScreenAction[]>;

export interface PermissionTemplate {
  id: string;
  name: string;
  isSystem: boolean;
  isAllScreens: boolean;
  allowedScreens: string[];
  screenActions: ScreenActionMap | null;
  createdAt: string;
}

export interface TemplateInput {
  name: string;
  isAllScreens?: boolean;
  allowedScreens?: string[];
  screenActions?: ScreenActionMap;
}

export const listTemplates = () => apiClient.get<PermissionTemplate[]>('/templates').then((r) => r.data);
export const createTemplate = (dto: TemplateInput) => apiClient.post<PermissionTemplate>('/templates', dto).then((r) => r.data);
export const updateTemplate = (id: string, dto: Partial<TemplateInput>) => apiClient.patch<PermissionTemplate>(`/templates/${id}`, dto).then((r) => r.data);
export const deleteTemplate = (id: string) => apiClient.delete(`/templates/${id}`);
