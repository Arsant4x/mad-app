import { apiClient } from './client';

export type ScriptAudience = 'TENANT' | 'CUSTOMER' | 'EMPLOYEE';

export interface MessageScript {
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

export const listScripts = () => apiClient.get<MessageScript[]>('/scripts').then((r) => r.data);
export const createScript = (dto: ScriptInput) => apiClient.post<MessageScript>('/scripts', dto).then((r) => r.data);
export const updateScript = (id: string, dto: Partial<ScriptInput>) => apiClient.patch<MessageScript>(`/scripts/${id}`, dto).then((r) => r.data);
export const deleteScript = (id: string) => apiClient.delete(`/scripts/${id}`);
