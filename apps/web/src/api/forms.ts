import { apiClient } from './client';
import type {
  CopyFormTemplateDto,
  CreateFormInstanceDto,
  CreateFormTemplateDto,
  CreateFormTypeDto,
  FormTemplateItemDto,
  FormValueDto,
  UpdateFormSigningSettingsDto,
  UpdateFormTemplateDto,
} from '@mad-app/shared/api/requests';
import type {
  FormInstanceItemResponse,
  FormInstanceResponse,
  FormSigningSettingsResponse,
  FormTemplateItemResponse,
  FormTemplateResponse,
  FormTemplateRowResponse,
  FormTypeResponse,
  FormVerificationResponse,
} from '@mad-app/shared/api/responses';

/**
 * ⚖️ **محرّكُ النماذج في الواجهة** (توجيه ٢٧٨ · `ق-١٦٣٨`: شاشةٌ مستقلّةٌ باسم «النماذج»).
 *
 * ثلاثةُ أبواب كما في الخادم: **قوالبُ المنشأة** (نسخُ التاجر، الكتابةُ لمالك المنشأة) · **القوالبُ العامّة** (لوحةُ المطوّر،
 * لمالك المنصّة) · **سجلّاتُ العقد** (التعبئةُ «تسجيل» والختمُ «مراجعة» على شاشة العقود). والأنواعُ من الحزمة المشتركة
 * المولَّدة من الخادم، فلا تُكتب باليد.
 */

export type FormType = FormTypeResponse;
export type FormTemplate = FormTemplateResponse;
export type FormTemplateRow = FormTemplateRowResponse;
export type FormTemplateItem = FormTemplateItemResponse;
export type FormInstance = FormInstanceResponse;
export type FormInstanceItem = FormInstanceItemResponse;
export type FormVerification = FormVerificationResponse;
export type FormItemType = FormTemplateItemDto['itemType'];
export type FormItemInput = FormTemplateItemDto;
export type FormValueInput = FormValueDto;

// ── قوالبُ المنشأة ──────────────────────────────────────────────────────────
export const listCompanyFormTemplates = () => apiClient.get<FormTemplateRow[]>('/form-templates').then((r) => r.data);
export const formTemplateCatalog = () => apiClient.get<FormTemplateRow[]>('/form-templates/catalog').then((r) => r.data);
export const getCompanyFormTemplate = (id: string) => apiClient.get<FormTemplate>(`/form-templates/${id}`).then((r) => r.data);
export const copyFormTemplate = (dto: CopyFormTemplateDto) => apiClient.post<FormTemplate>('/form-templates/copy', dto).then((r) => r.data);
export const updateCompanyFormTemplate = (id: string, dto: UpdateFormTemplateDto) =>
  apiClient.patch<FormTemplate>(`/form-templates/${id}`, dto).then((r) => r.data);
export const publishCompanyFormTemplate = (id: string) => apiClient.post<FormTemplate>(`/form-templates/${id}/publish`).then((r) => r.data);
export const newCompanyFormTemplateVersion = (id: string) => apiClient.post<FormTemplate>(`/form-templates/${id}/versions`).then((r) => r.data);
export const deleteCompanyFormTemplate = (id: string) => apiClient.delete(`/form-templates/${id}`);

// ── القوالبُ العامّة (لوحةُ المطوّر) ─────────────────────────────────────────
export const listFormTypes = () => apiClient.get<FormType[]>('/admin/form-types').then((r) => r.data);
export const createFormType = (dto: CreateFormTypeDto) => apiClient.post<FormType>('/admin/form-types', dto).then((r) => r.data);
export const listPublicFormTemplates = () => apiClient.get<FormTemplateRow[]>('/admin/form-templates').then((r) => r.data);
export const getPublicFormTemplate = (id: string) => apiClient.get<FormTemplate>(`/admin/form-templates/${id}`).then((r) => r.data);
export const createPublicFormTemplate = (dto: CreateFormTemplateDto) => apiClient.post<FormTemplate>('/admin/form-templates', dto).then((r) => r.data);
export const updatePublicFormTemplate = (id: string, dto: UpdateFormTemplateDto) =>
  apiClient.patch<FormTemplate>(`/admin/form-templates/${id}`, dto).then((r) => r.data);
export const publishPublicFormTemplate = (id: string) => apiClient.post<FormTemplate>(`/admin/form-templates/${id}/publish`).then((r) => r.data);
export const newPublicFormTemplateVersion = (id: string) => apiClient.post<FormTemplate>(`/admin/form-templates/${id}/versions`).then((r) => r.data);
export const deletePublicFormTemplate = (id: string) => apiClient.delete(`/admin/form-templates/${id}`);

// ── سجلّاتُ العقد ───────────────────────────────────────────────────────────
export const listContractForms = (contractId: string) => apiClient.get<FormInstance[]>(`/contracts/${contractId}/forms`).then((r) => r.data);
export const createContractForm = (contractId: string, dto: CreateFormInstanceDto) =>
  apiClient.post<FormInstance>(`/contracts/${contractId}/forms`, dto).then((r) => r.data);
export const getContractForm = (contractId: string, formId: string) =>
  apiClient.get<FormInstance>(`/contracts/${contractId}/forms/${formId}`).then((r) => r.data);
export const setContractFormValues = (contractId: string, formId: string, values: FormValueInput[]) =>
  apiClient.put<FormInstance>(`/contracts/${contractId}/forms/${formId}/values`, { values }).then((r) => r.data);
export const sealContractForm = (contractId: string, formId: string) =>
  apiClient.post<FormInstance>(`/contracts/${contractId}/forms/${formId}/seal`).then((r) => r.data);
export const verifyContractForm = (contractId: string, formId: string) =>
  apiClient.get<FormVerification>(`/contracts/${contractId}/forms/${formId}/verify`).then((r) => r.data);
export const deleteContractForm = (contractId: string, formId: string) => apiClient.delete(`/contracts/${contractId}/forms/${formId}`);

// ── إعدادُ التوقيع (توجيه ٢٨٧): مدّةُ كلِّ نوعٍ وحدُّ نفاذ — الكتابةُ لمالك المنشأة ──────────────────────────────────────────────
export type FormSigningSettings = FormSigningSettingsResponse;
export const getFormSigningSettings = () => apiClient.get<FormSigningSettings>('/form-signing-settings').then((r) => r.data);
export const updateFormSigningSettings = (dto: UpdateFormSigningSettingsDto) =>
  apiClient.put<FormSigningSettings>('/form-signing-settings', dto).then((r) => r.data);
