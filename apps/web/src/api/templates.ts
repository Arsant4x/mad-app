import { ALL_ACTIONS, ALLOWED_SCREENS, SCREEN_ACTIONS, SCREEN_ONLY_ACTIONS, type ScreenAction, type ScreenKey } from '@mad-app/shared/permissions';
import { apiClient } from './client';
import type { CreateTemplateDto } from '@mad-app/shared/api/requests';
import { labelTable, translateTable } from '../lib/labelTable';

/**
 * The permission vocabulary is generated from the server (`@mad-app/shared/permissions`), not copied.
 * Only the screen and action names live here; their keys come from the generated types, so `tsc`
 * fails on a screen without a name.
 */
export { ALL_ACTIONS, ALLOWED_SCREENS, SCREEN_ACTIONS };
export type { ScreenAction, ScreenKey };

/** The actions that exist on a screen: the general ones, plus that screen's own (salaries on employees). */
export function actionsFor(screen: string): readonly ScreenAction[] {
  const only = (SCREEN_ONLY_ACTIONS as Partial<Record<string, readonly ScreenAction[]>>)[screen] ?? [];
  return [...SCREEN_ACTIONS, ...only];
}

/**
 * Is this a screen from the shared list? A stored template may still name a screen that was dropped
 * later; it is filtered out before sending, otherwise the server rejects it and the template can never
 * be edited again.
 */
export function isScreenKey(value: string): value is ScreenKey {
  return (ALLOWED_SCREENS as readonly string[]).includes(value);
}

/**
 * Screen names. The Arabic below is compared word for word with the server's list
 * (`apps/api/src/activities/screen-labels.spec.ts`); the text shown comes from `labels.screens`.
 */
export const SCREEN_LABELS: Record<ScreenKey, string> = {
  dashboard: 'لوحة التحكم', // i18n-exempt: Arabic mirror compared with the server list
  accounts: 'دليل الحسابات', // i18n-exempt: Arabic mirror compared with the server list
  journal: 'دفتر اليومية', // i18n-exempt: Arabic mirror compared with the server list
  fiscal: 'السنة المالية والفترات', // i18n-exempt: Arabic mirror compared with the server list
  branches: 'الفروع', // i18n-exempt: Arabic mirror compared with the server list
  settings: 'الأنشطة والعملات', // i18n-exempt: Arabic mirror compared with the server list
  invoice: 'الفواتير', // i18n-exempt: Arabic mirror compared with the server list
  payments: 'سندات القبض', // i18n-exempt: Arabic mirror compared with the server list
  customers: 'العملاء', // i18n-exempt: Arabic mirror compared with the server list
  suppliers: 'الموردون', // i18n-exempt: Arabic mirror compared with the server list
  products: 'المنتجات والخدمات', // i18n-exempt: Arabic mirror compared with the server list
  inventory: 'إدارة المخزون', // i18n-exempt: Arabic mirror compared with the server list
  properties: 'العقارات والوحدات', // i18n-exempt: Arabic mirror compared with the server list
  contracts: 'عقود الإيجار', // i18n-exempt: Arabic mirror compared with the server list
  maintenance: 'الصيانة', // i18n-exempt: Arabic mirror compared with the server list
  employees: 'الموظفون والموارد البشرية', // i18n-exempt: Arabic mirror compared with the server list
  banks: 'البنوك', // i18n-exempt: Arabic mirror compared with the server list
  transactions: 'الحركات البنكية', // i18n-exempt: Arabic mirror compared with the server list
  obligations: 'الالتزامات الحكومية', // i18n-exempt: Arabic mirror compared with the server list
  reports: 'التقارير المالية', // i18n-exempt: Arabic mirror compared with the server list
  scripts: 'قوالب الرسائل', // i18n-exempt: Arabic mirror compared with the server list
  audit: 'سجل التدقيق', // i18n-exempt: Arabic mirror compared with the server list
  pos: 'الكاشير', // i18n-exempt: Arabic mirror compared with the server list
  quotes: 'عروض الأسعار', // i18n-exempt: Arabic mirror compared with the server list
  forms: 'النماذج', // i18n-exempt: Arabic mirror compared with the server list
};
translateTable(SCREEN_LABELS, 'labels.screens');

export const ACTION_LABELS: Record<ScreenAction, string> = labelTable('labels.actions', ALL_ACTIONS);

/** { screen: [actions] }. A screen present in allowedScreens with no entry
 * here means every action on it. */
export type ScreenActionMap = Record<string, ScreenAction[]>;

export interface PermissionTemplate {
  id: string;
  /** null = a platform template; a value = a template owned by this company. */
  companyId: string | null;
  name: string;
  isSystem: boolean;
  isAllScreens: boolean;
  allowedScreens: string[];
  screenActions: ScreenActionMap | null;
  /** The platform "no screens" template: preselected for a new employee. */
  isNewUserDefault: boolean;
  createdAt: string;
}

/** The template a new employee account starts with ("no screens"); empty when absent so it is picked by hand. */
export function newEmployeeTemplateId(templates: PermissionTemplate[]): string {
  return templates.find((t) => t.isNewUserDefault)?.id ?? '';
}

/** Templates a company can be created on from the admin panel: platform, all screens, not a system template. */
export function companyTemplateChoices(templates: PermissionTemplate[]): PermissionTemplate[] {
  return templates.filter((t) => t.companyId === null && !t.isSystem && t.isAllScreens);
}

export type TemplateInput = CreateTemplateDto;

export const listTemplates = () => apiClient.get<PermissionTemplate[]>('/templates').then((r) => r.data);
export const createTemplate = (dto: TemplateInput) => apiClient.post<PermissionTemplate>('/templates', dto).then((r) => r.data);
export const updateTemplate = (id: string, dto: Partial<TemplateInput>) => apiClient.patch<PermissionTemplate>(`/templates/${id}`, dto).then((r) => r.data);
export const deleteTemplate = (id: string) => apiClient.delete(`/templates/${id}`);
