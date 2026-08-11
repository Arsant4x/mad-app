import { request } from '@playwright/test';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { deleteCompany, STATE_FILE } from './fixtures';

/** يحذف منشأة التشغيل عبر المسار الحقيقي (DELETE /companies/:id) — لا بـSQL:
 *  ما لا يُنظَّف عبر المسار الحقيقي لا يُثبت أن المسار الحقيقي ينظّف. */
export default async function globalTeardown(): Promise<void> {
  if (!existsSync(STATE_FILE)) return;
  const state = JSON.parse(readFileSync(STATE_FILE, 'utf8')) as { hasApi: boolean; companyId?: string };
  rmSync(STATE_FILE, { force: true });
  if (!state.hasApi || !state.companyId) return;

  const ctx = await request.newContext();
  try {
    await deleteCompany(ctx, state.companyId);
  } finally {
    await ctx.dispose();
  }
}
