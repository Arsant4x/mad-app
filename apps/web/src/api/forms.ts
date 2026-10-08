import { apiClient, publicApiClient } from './client';
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
  FormDeviceLinkResponse,
  FormLinkOpenResponse,
  FormNafathPollResponse,
  FormNafathStartResponse,
  FormObjectedResponse,
  FormOtpIssuedResponse,
  FormPaperSignedResponse,
  FormPublicViewResponse,
  FormSentResponse,
  FormSessionResponse,
  FormSignedResponse,
  FormSigningEventResponse,
  FormSubstituteDecidedResponse,
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
export const verifyContractForm = (contractId: string, formId: string) =>
  apiClient.get<FormVerification>(`/contracts/${contractId}/forms/${formId}/verify`).then((r) => r.data);
export const deleteContractForm = (contractId: string, formId: string) => apiClient.delete(`/contracts/${contractId}/forms/${formId}`);

// ── إعدادُ التوقيع (توجيه ٢٨٧): مدّةُ كلِّ نوعٍ وحدُّ نفاذ — الكتابةُ لمالك المنشأة ──────────────────────────────────────────────
export type FormSigningSettings = FormSigningSettingsResponse;
export const getFormSigningSettings = () => apiClient.get<FormSigningSettings>('/form-signing-settings').then((r) => r.data);
export const updateFormSigningSettings = (dto: UpdateFormSigningSettingsDto) =>
  apiClient.put<FormSigningSettings>('/form-signing-settings', dto).then((r) => r.data);

// ── مسارُ التوقيع من جهة الموظّف (توجيه ٢٨٧): يوقّع ويرسل، ويعيد الرابط، ويردّ على الاعتراض بنسخةٍ معدّلة، ويوقّع ورقياً أو على جهازه ──
export type FormSent = FormSentResponse;
export type FormSigningEvent = FormSigningEventResponse;
export type FormPaperSigned = FormPaperSignedResponse;
export type FormDeviceLink = FormDeviceLinkResponse;

/** ممثّلُ الشخص الاعتباريّ (توجيه ٢٨٧ ⑥): مديرٌ في السجلّ التجاريّ أو وكيلٌ بوكالةٍ من ناجز. */
export interface RepresentativeFields {
  name: string;
  mobile: string;
  authorityType: 'CR_MANAGER' | 'NAJIZ_POA';
  authorityRef: string;
  nationalId?: string;
}

const base = (contractId: string, formId: string) => `/contracts/${contractId}/forms/${formId}`;

export function sendContractForm(contractId: string, formId: string, drawing: Blob, representative?: RepresentativeFields | null, authorityDocument?: File | null) {
  const form = new FormData();
  form.append('drawing', drawing, 'signature.png');
  if (representative) {
    form.append('representativeName', representative.name);
    form.append('representativeMobile', representative.mobile);
    form.append('authorityType', representative.authorityType);
    form.append('authorityRef', representative.authorityRef);
    if (representative.nationalId) form.append('representativeNationalId', representative.nationalId);
    if (authorityDocument) form.append('authorityDocument', authorityDocument);
  }
  return apiClient.post<FormSent>(`${base(contractId, formId)}/send`, form).then((r) => r.data);
}
export const resendContractFormLink = (contractId: string, formId: string) => apiClient.post<FormSent>(`${base(contractId, formId)}/resend`).then((r) => r.data);
/** طلبُ مستلمٍ بديل (توجيه ٢٨٧ ⑦): يصل جوالَ المستأجر رابطُ الموافقة، ولا يعود للموظّف رمزٌ ولا رابط. */
export const requestContractFormSubstitute = (contractId: string, formId: string, body: { name: string; mobile: string }) =>
  apiClient.post<FormSent>(`${base(contractId, formId)}/substitute`, body).then((r) => r.data);
export const reviseContractForm = (contractId: string, formId: string) => apiClient.post<FormInstance>(`${base(contractId, formId)}/revisions`).then((r) => r.data);
export const contractFormEvents = (contractId: string, formId: string) => apiClient.get<FormSigningEvent[]>(`${base(contractId, formId)}/events`).then((r) => r.data);
export const contractFormDeviceLink = (contractId: string, formId: string) =>
  apiClient.post<FormDeviceLink>(`${base(contractId, formId)}/device-link`).then((r) => r.data);
/** سندُ من وقّع ورقاً عن شخصٍ اعتباريّ (`ق-١٦٧٥`): اسمُه في `signerName`، ونوعُ السند ورقمُه هنا. */
export interface PaperAuthorityFields {
  authorityType: 'CR_MANAGER' | 'NAJIZ_POA';
  authorityRef: string;
}

export function paperSignContractForm(
  contractId: string,
  formId: string,
  paper: File,
  drawing?: Blob | null,
  signerName?: string,
  authority?: PaperAuthorityFields | null,
  authorityDocument?: File | null,
) {
  const form = new FormData();
  form.append('paper', paper);
  if (drawing) form.append('drawing', drawing, 'signature.png');
  if (signerName?.trim()) form.append('signerName', signerName.trim());
  if (authority) {
    form.append('authorityType', authority.authorityType);
    form.append('authorityRef', authority.authorityRef.trim());
    if (authorityDocument) form.append('authorityDocument', authorityDocument);
  }
  return apiClient.post<FormPaperSigned>(`${base(contractId, formId)}/paper`, form).then((r) => r.data);
}
/** صورةُ توقيعٍ أو ورقةٍ أو اعتراض: تُجلب بالدخول ثم تُفتح رابطاً محلّياً (لا رابطَ موقَّعاً للمخزن الحسّاس). */
export const contractFormSignatureImage = (contractId: string, formId: string, signatureId: string) =>
  apiClient.get<Blob>(`${base(contractId, formId)}/signatures/${signatureId}/image`, { responseType: 'blob' }).then((r) => r.data);
export const contractFormObjectionPhoto = (contractId: string, formId: string) =>
  apiClient.get<Blob>(`${base(contractId, formId)}/objection/photo`, { responseType: 'blob' }).then((r) => r.data);

// ── صفحةُ الرابط العامّة (`/f/:token`): الفاعلُ المستأجرُ بلا حساب، والجلسةُ في رأسٍ بعد الرمز أو نفاذ ──
export type FormLinkOpen = FormLinkOpenResponse;
export type FormOtpIssued = FormOtpIssuedResponse;
export type FormSession = FormSessionResponse;
export type FormNafathStart = FormNafathStartResponse;
export type FormNafathPoll = FormNafathPollResponse;
export type FormPublicView = FormPublicViewResponse;
export type FormSigned = FormSignedResponse;
export type FormObjected = FormObjectedResponse;

const pub = (token: string) => `/public/forms/${encodeURIComponent(token)}`;
const session = (s: string) => ({ headers: { 'x-form-session': s } });

export const openFormLink = (token: string) => publicApiClient.get<FormLinkOpen>(pub(token)).then((r) => r.data);
export const requestFormOtp = (token: string) => publicApiClient.post<FormOtpIssued>(`${pub(token)}/otp`).then((r) => r.data);
export const verifyFormOtp = (token: string, challengeId: string, code: string) =>
  publicApiClient.post<FormSession>(`${pub(token)}/otp/verify`, { challengeId, code }).then((r) => r.data);
export const startFormNafath = (token: string) => publicApiClient.post<FormNafathStart>(`${pub(token)}/nafath`).then((r) => r.data);
export const pollFormNafath = (token: string) => publicApiClient.get<FormNafathPoll>(`${pub(token)}/nafath`).then((r) => r.data);
export const viewPublicForm = (token: string, s: string) => publicApiClient.get<FormPublicView>(`${pub(token)}/form`, session(s)).then((r) => r.data);
export function signPublicForm(token: string, s: string, drawing: Blob) {
  const form = new FormData();
  form.append('acknowledged', 'true');
  form.append('drawing', drawing, 'signature.png');
  return publicApiClient.post<FormSigned>(`${pub(token)}/sign`, form, session(s)).then((r) => r.data);
}
export type FormSubstituteDecided = FormSubstituteDecidedResponse;
/** حكمُ المستأجر على البديل برابط الموافقة بعد الدخول (`ق-١٦٧٢`). */
export const decidePublicSubstitute = (token: string, s: string, approve: boolean) =>
  publicApiClient.post<FormSubstituteDecided>(`${pub(token)}/substitute/decision`, { approve }, session(s)).then((r) => r.data);
export function objectPublicForm(token: string, s: string, note: string, photo?: File | null) {
  const form = new FormData();
  form.append('note', note);
  if (photo) form.append('photo', photo);
  return publicApiClient.post<FormObjected>(`${pub(token)}/objection`, form, session(s)).then((r) => r.data);
}
