/**
 * تمهيد الإنتاج — البديل الوحيد المشروع لـ`prisma db seed` على خادم حيّ.
 *
 * ينشئ قالبَي الصلاحيات العامّين وحساب مدير المنصة، **ولا شيء غيرهما**:
 * لا شركات تجريبية، ولا حسابات بكلمات مرور مكتوبة في المستودع.
 *
 * ولماذا سكربت مستقلّ لا `db seed`؟ لأن `prisma db seed` يشغّل `ts-node
 * prisma/seed.ts`، وصورة الإنتاج لا تحمل `ts-node` ولا `apps/api/src` أصلاً —
 * فالخطوة الموثّقة سابقاً كانت تفشل من أول سطر. هذا الملف يُترجم مع البناء
 * إلى `dist/scripts/`، فيُشغَّل داخل الحاوية بـnode مباشرة:
 *
 *   docker compose -f docker-compose.prod.yml exec api \
 *     node dist/scripts/bootstrap-production.js
 *
 * عديم الأثر عند التكرار: أعد تشغيله بعد كل تحديث بلا قلق.
 */
import { PrismaClient } from '@mad-app/db';
import { bootstrapPlatform } from '../src/platform/platform-bootstrap';

const prisma = new PrismaClient();

async function main() {
  const username = process.env.PLATFORM_ADMIN_USERNAME ?? process.env.DEV_SEED_PLATFORM_ADMIN_USERNAME;
  const password = process.env.PLATFORM_ADMIN_PASSWORD ?? process.env.DEV_SEED_PLATFORM_ADMIN_PASSWORD;

  if (!username || !password) {
    console.error('✘ PLATFORM_ADMIN_USERNAME و PLATFORM_ADMIN_PASSWORD مطلوبان — لا قيم افتراضية لهما.');
    process.exitCode = 1;
    return;
  }

  const result = await bootstrapPlatform(prisma, { username, password });

  console.log(`✔ قوالب الصلاحيات: ${result.templates.join(' · ')}`);
  if (result.createdAdmin) {
    console.log(`✔ أُنشئ حساب مدير المنصة: ${result.adminUsername}`);
  } else {
    console.log(`— حساب مدير المنصة موجود مسبقاً (${result.adminUsername}) — لم تُمسّ كلمة مروره.`);
  }

  const companies = await prisma.company.count();
  console.log(`الحالة: ${companies} منشأة في القاعدة.`);
  if (companies === 0) console.log('القاعدة نظيفة — لا بيانات تجريبية. سجّل أول منشأة من الواجهة أو من لوحة المدير.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
