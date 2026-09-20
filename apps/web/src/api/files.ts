import { apiClient } from './client';

export interface UploadedFile {
  key: string;
  filename: string;
  size: number;
  mimeType: string;
}

interface DownloadUrlResult {
  url: string;
  expiresInSeconds: number;
}

/** Mirrors the server's allow-list (files.service.ts) so an unsupported file
 * is rejected before it's uploaded — the server still enforces it either way. */
export const ACCEPTED_FILE_TYPES = 'application/pdf,image/jpeg,image/png,image/webp';
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function uploadFile(file: File): Promise<UploadedFile> {
  const form = new FormData();
  form.append('file', file);
  // Content-Type is deliberately left unset: the browser has to add the
  // multipart boundary itself, and setting it manually strips that.
  const res = await apiClient.post<UploadedFile>('/files', form);
  return res.data;
}

/** Storage objects are private; this exchanges a key for a short-lived signed
 * URL. The link expires quickly, so fetch it when it's about to be used rather
 * than caching it. */
export async function getFileDownloadUrl(key: string): Promise<DownloadUrlResult> {
  const res = await apiClient.get<DownloadUrlResult>('/files/download-url', { params: { key } });
  return res.data;
}

// لا `deleteFile` هنا (ق-١٢٣٤): حذفُ المرفق يمرّ بمسار الميزة التي تملكه (عقدٌ · مطالبة · شراء …)
// فيُحذف الصفُّ والكائنُ معاً تحت حارس شاشتها — والمسارُ العامّ `DELETE /files` أُزيل من الخادم.
