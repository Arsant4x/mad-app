import { ALLOWED_SCREENS, SCREEN_ACTIONS, type ScreenAction, type ScreenKey } from '@mad-app/shared/permissions';
import { apiClient } from './client';
import type { CreateTemplateDto } from '@mad-app/shared/api/requests';

/**
 * ⑧ مفرداتُ الصلاحيات **مولَّدةٌ لا منسوخة** (`ق-١٢٣٤`): `ALLOWED_SCREENS` و`SCREEN_ACTIONS` تُقرآن من
 * `@mad-app/shared/permissions` المولَّد من `apps/api/src/templates/screens.ts` — وكانت هنا نسخةٌ يدوية
 * بتعليق «keep in sync». **التسمياتُ العربية وحدَها تعيش هنا** (شأنُ واجهة)، ومفاتيحُها من النوع
 * المولَّد فتُسقط `tsc` شاشةً بلا تسمية.
 */
export { ALLOWED_SCREENS, SCREEN_ACTIONS };
export type { ScreenAction, ScreenKey };

/**
 * شاشةٌ من القائمة المشتركة؟ — بوّابةُ ما يُرسَل (`ق-١٤٠٤` · ③): الحالةُ تُبذَر من قالبٍ مخزَّن فقد تحمل شاشةً
 * أُسقطت من القائمة بعد حفظه، والنافذةُ لا تعرضها أصلاً (مربّعاتُها من `ALLOWED_SCREENS`) — فتُرشَّح عند الإرسال
 * بدل أن يردّها الخادمُ فيتعذّر تعديلُ القالب أبداً.
 */
export function isScreenKey(value: string): value is ScreenKey {
  return (ALLOWED_SCREENS as readonly string[]).includes(value);
}

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
  forms: 'النماذج',
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
  /** القالبُ العامّ «بلا شاشات»: اختيارُ الموظّف الجديد المسبق (توجيه ٢٧٦ · ق-١٦٠١). */
  isNewUserDefault: boolean;
  createdAt: string;
}

/** القالبُ الذي يبدأ به حسابُ موظّفٍ جديد: «بلا شاشات» — والشاملُ وغيرُه اختيارٌ صريح (ق-١٦٠١). فارغٌ إن غاب فيُختار بيد. */
export function newEmployeeTemplateId(templates: PermissionTemplate[]): string {
  return templates.find((t) => t.isNewUserDefault)?.id ?? '';
}

/** ما تركب عليه منشأةٌ من لوحة المدير: عامٌّ شاملٌ غيرُ نظاميّ — «صاحبُ المنشأة شاملٌ في المسارين» (ق-١٦٠١). */
export function companyTemplateChoices(templates: PermissionTemplate[]): PermissionTemplate[] {
  return templates.filter((t) => t.companyId === null && !t.isSystem && t.isAllScreens);
}

export type TemplateInput = CreateTemplateDto;

export const listTemplates = () => apiClient.get<PermissionTemplate[]>('/templates').then((r) => r.data);
export const createTemplate = (dto: TemplateInput) => apiClient.post<PermissionTemplate>('/templates', dto).then((r) => r.data);
export const updateTemplate = (id: string, dto: Partial<TemplateInput>) => apiClient.patch<PermissionTemplate>(`/templates/${id}`, dto).then((r) => r.data);
export const deleteTemplate = (id: string) => apiClient.delete(`/templates/${id}`);
