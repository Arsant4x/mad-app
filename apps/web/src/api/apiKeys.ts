import { apiClient } from './client';

/** ما يُعرَض من المفتاح — **بلا سرٍّ**: السرُّ يُعطى مرّةً واحدةً عند الإنشاء فقط. */
export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  permissionTemplateId: string;
  permissionTemplateName: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** ردُّ الإنشاء وحدَه يحمل `token` — ولا مسارَ يُعيده بعدها. */
export interface CreatedApiKey extends ApiKeyRow {
  token: string;
}

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  const { data } = await apiClient.get<ApiKeyRow[]>('/api-keys');
  return data;
}

export async function createApiKey(body: { name: string; permissionTemplateId: string }): Promise<CreatedApiKey> {
  const { data } = await apiClient.post<CreatedApiKey>('/api-keys', body);
  return data;
}

export async function revokeApiKey(id: string): Promise<ApiKeyRow> {
  const { data } = await apiClient.post<ApiKeyRow>(`/api-keys/${id}/revoke`);
  return data;
}
