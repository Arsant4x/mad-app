import { ALLOWED_SCREENS, SCREEN_ACTIONS, type ScreenAction, type ScreenKey } from '@mad-app/shared/permissions';
import { apiClient } from './client';

/**
 * ⑧ مفرداتُ الصلاحيات **مولَّدةٌ لا منسوخة** (`ق-١٢٣٤`): `ALLOWED_SCREENS` و`SCREEN_ACTIONS` تُقرآن من
 * `@mad-app/shared/permissions` المولَّد من `apps/api/src/templates/screens.ts` — وكانت هنا نسخةٌ يدوية
 * بتعليق «keep in sync». **التسمياتُ العربية وحدَها تعيش هنا** (شأنُ واجهة)، ومفاتيحُها من النوع
 * المولَّد فتُسقط `tsc` شاشةً بلا تسمية.
 */
export { ALLOWED_SCREENS, SCREEN_ACTIONS };
export type { ScreenAction, ScreenKey };

export const SCREEN_LABELS: Record<ScreenKey, string> = {
  dashboard: 'لوحة التحكم',
  accounts: 'دليل الحسابات',
  journal: 'دفتر اليومية',
  fiscal: 'السنة المالية والفترات',
  branches: 'الفروع',
  settings: 'الأنشطة والعملات',
  invoice: 'الفواتير',
  payments: 'سندات القبض',
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
  audit: 'سجل التدقيق',
  pos: 'الكاشير',
  quotes: 'عروض الأسعار',
};

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
  /** null = قالب عام من المنصة؛ قيمة = نموذج تملكه هذه المنشأة. */
  companyId: string | null;
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
