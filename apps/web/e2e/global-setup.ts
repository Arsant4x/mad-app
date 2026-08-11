import { request } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { apiReachable, registerCompany, STATE_FILE } from './fixtures';

/**
 * منشأة اختبار واحدة **لكل تشغيل** — لا لكل مجموعة.
 *
 * قرار المالك نصّه «تُسجَّل وتُحذف لكل تشغيل»، وأول تنفيذٍ له سجّل منشأةً لكل
 * `describe` ولكل عرض — ستّ تسجيلات — فاصطدم بحدّ معدّل التسجيل (5/دقيقة)
 * وسقط بـ`429 ThrottlerException`. والحدّ ليس عائقاً يُلتفّ عليه: هو حارسٌ
 * إنتاجيّ بنيناه عمداً، وإسقاطه في بيئة الاختبار يعني أننا لا نختبر ما نشحنه.
 *
 * فالإصلاح في العتاد لا في الحارس: تسجيلٌ واحد هنا، تتشاركه كل المجموعات
 * وكل العروض عبر ملف حالة، وحذفٌ واحد في التفكيك.
 */
export default async function globalSetup(): Promise<void> {
  const ctx = await request.newContext();
  try {
    if (!(await apiReachable(ctx))) {
      mkdirSync(dirname(STATE_FILE), { recursive: true });
      writeFileSync(STATE_FILE, JSON.stringify({ hasApi: false }));
      return;
    }
    const co = await registerCompany(ctx, 'e2e');
    mkdirSync(dirname(STATE_FILE), { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify({ hasApi: true, ...co }));
  } finally {
    await ctx.dispose();
  }
}
