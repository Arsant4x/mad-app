import { apiClient } from './client';
import type { UpsertSubProcessorDto } from '@mad-app/shared/api/requests';

/** صفٌّ في قائمة المعالجين الفرعيين كما نُشر في النسخة — لقطةٌ لا مرجعٌ متحرّك. */
export type SubProcessorEntry = UpsertSubProcessorDto;

export interface ConsentVersion {
  version: number;
  publishedAt: string;
  effectiveFrom: string;
  summary: string;
  entries: SubProcessorEntry[];
}

/** ما يراه التاجر (ق-٥٨٩): أمامه بابان — يقبل، أو يُنزّل ويُغلق. */
export interface ConsentState {
  requiredVersion: number | null;
  acceptedVersion: number | null;
  blocked: boolean;
  effectiveFrom: string | null;
  noticeDays: number;
  current: ConsentVersion | null;
  upcoming: ConsentVersion | null;
}

export interface SubProcessor extends SubProcessorEntry {
  id: string;
  addedAt: string;
  removedAt: string | null;
}

export interface ConsentOverview {
  subProcessors: SubProcessor[];
  versions: ConsentVersion[];
  /** كم منشأةً تقف اليوم على كلِّ نسخة — حالٌ لا تاريخ. */
  acceptances: Record<string, number>;
  noticeDays: number;
}

// جانبُ التاجر — ويعمل وهو ممنوع.
export const getConsentState = () => apiClient.get<ConsentState>('/processing-agreement').then((r) => r.data);
export const acceptConsent = (version: number) => apiClient.post<ConsentState>('/processing-agreement/accept', { version }).then((r) => r.data);

// جانبُ المنصّة.
export const getConsentOverview = () => apiClient.get<ConsentOverview>('/admin/processing-agreement').then((r) => r.data);
export const upsertSubProcessor = (input: Omit<SubProcessor, 'id' | 'addedAt' | 'removedAt'> & { id?: string }) =>
  apiClient.post<SubProcessor>('/admin/processing-agreement/sub-processors', input).then((r) => r.data);
export const retireSubProcessor = (id: string) => apiClient.post<SubProcessor>(`/admin/processing-agreement/sub-processors/${id}/retire`).then((r) => r.data);
export const publishConsentVersion = (summary: string, effectiveFrom: string) =>
  apiClient.post<ConsentVersion>('/admin/processing-agreement/versions', { summary, effectiveFrom }).then((r) => r.data);
