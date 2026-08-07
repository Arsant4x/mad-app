import { apiClient } from './client';

export type ScriptAudience = 'TENANT' | 'CUSTOMER' | 'EMPLOYEE';

export interface MessageScript {
  archived: boolean;
  id: string;
  audience: ScriptAudience;
  title: string;
  text: string;
  createdAt: string;
}

export interface ScriptInput {
  audience: ScriptAudience;
  title: string;
  text: string;
}

export const listScripts = (includeArchived = false) => apiClient.get<MessageScript[]>('/scripts', { params: includeArchived ? { includeArchived: 'true' } : {} }).then((r) => r.data);
export const createScript = (dto: ScriptInput) => apiClient.post<MessageScript>('/scripts', dto).then((r) => r.data);
export const updateScript = (id: string, dto: Partial<ScriptInput>) => apiClient.patch<MessageScript>(`/scripts/${id}`, dto).then((r) => r.data);
export const deleteScript = (id: string) => apiClient.delete(`/scripts/${id}`);

/** أرشفة/إلغاء أرشفة — إخفاء من القوائم اليومية مع البقاء في الحسابات. */
export const setScriptArchived = (id: string, archived: boolean) => apiClient.patch<MessageScript>(`/scripts/${id}/archive`, { archived }).then((r) => r.data);
