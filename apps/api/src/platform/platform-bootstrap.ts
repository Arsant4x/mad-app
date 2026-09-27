import type { PrismaClient } from '@mad-app/db';
import * as argon2 from 'argon2';

/**
 * التمهيد **الأدنى** الذي تحتاجه منصة حيّة كي تعمل: قالبا الصلاحيات العامّان
 * وحساب مدير المنصة. لا شركات، لا عملاء، لا فواتير.
 *
 * كان هذا المنطق محشوراً داخل `prisma/seed.ts` بين الشركتين التجريبيتين،
 * فكانت الطريقة الوحيدة لإنشاء حساب المدير في الإنتاج هي تشغيل البذرة كاملة
 * ثم **حذف** ما لا يُراد — وهو ترتيب معكوس: البيانات التجريبية تُولد أولاً على
 * خادم حقيقي بحسابين دخولهما `DemoPass123!` مكتوبةً في المستودع، ثم يُطلب من
 * المشغّل تذكّر حذفها. هنا صار التمهيد مستقلاً يُستدعى وحده.
 *
 * عديم الأثر عند التكرار (`upsert` على مفاتيح ثابتة) — يُعاد تشغيله بأمان بعد
 * كل تحديث.
 */
export interface BootstrapResult {
  createdAdmin: boolean;
  adminUsername: string;
  templates: string[];
}

export async function bootstrapPlatform(prisma: PrismaClient, admin: { username: string; password: string }): Promise<BootstrapResult> {
  if (!admin.password) throw new Error('كلمة مرور مدير المنصة مطلوبة — لا قيمة افتراضية لها.');

  // 🔴 القوالبُ العامّة تُكتب **بمسنَد الإدارة** (`ق-٦٧٥` · المرحلة ③): `permission_templates`
  //    تحت `FORCE`، وسياستُها لا تقبل كتابةَ صفٍّ بلا منشأة إلا في معاملةٍ تحمل
  //    `app.platform_admin = 'true'` — والتمهيدُ فعلُ المنصّة نفسِها.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.platform_admin', 'true', true)`;

    // قالب المطوّر: صلاحية كل الشاشات، نظاميّ فلا يُحذف من الواجهة.
    await tx.permissionTemplate.upsert({
      where: { id: 'dev-template' },
      update: {},
      create: { id: 'dev-template', name: 'المطوّر', isSystem: true, isAllScreens: true },
    });

    // القالب العام الذي تركب عليه كل منشأة جديدة — مسار التسجيل الذاتي يبحث
    // عن قالب عام `isAllScreens` **غيرِ نظاميّ** (`isSystem: false` — ق-٦٤٤) وبدونه
    // يرفض التسجيل بـ register_unavailable. ⚠️ فقالبُ المطوّر أعلاه، وإن كان شاملاً،
    // **لا يركب عليه تاجر**: كان الترتيبُ وحدَه يفصل بينهما فركب ستٌّ من ستٍّ عليه.
    await tx.permissionTemplate.upsert({
      where: { id: 'full-access-template' },
      update: {},
      create: { id: 'full-access-template', name: 'المستخدم الأول (شامل)', isSystem: false, isAllScreens: true },
    });
  });

  const existing = await prisma.loginIdentity.findUnique({ where: { username: admin.username }, select: { id: true } });
  await prisma.loginIdentity.upsert({
    where: { username: admin.username },
    // لا يُعاد ضبط كلمة المرور على حساب قائم: إعادة التشغيل بعد التحديث
    // ستُرجع كلمة المرور إلى ما في ملف البيئة وتُبطل أي تدوير جرى بعده.
    update: {},
    create: {
      username: admin.username,
      passwordHash: await argon2.hash(admin.password),
      actorType: 'PLATFORM_ADMIN',
      platformAdmin: { create: { displayName: 'المطوّر' } },
    },
  });

  return {
    createdAdmin: !existing,
    adminUsername: admin.username,
    templates: ['dev-template', 'full-access-template'],
  };
}
