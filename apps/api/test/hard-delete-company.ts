import { PrismaService } from '../src/prisma/prisma.service';

/**
 * تنظيفُ اختبارٍ — **لا مسارَ منتج**: الحذفُ الصلبُ عبر هويّة الدخول (المسلكُ نفسُه الذي
 * كان خلف `DELETE /companies/:id`)، وقد حُذف مسارُ المنصّة المباشر (`ق-٥٤٨`) فلم يبقَ إلا
 * مسارُ الطلب. والمنشأةُ التي ترفض القاعدةُ حذفَها (مهامّ · تفويض — `ق-١١٠`) تبقى بصمت.
 */
export async function hardDeleteCompanyForTest(prisma: PrismaService, companyId: string): Promise<void> {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { loginIdentityId: true } });
  if (!company) return;
  try {
    await prisma.loginIdentity.delete({ where: { id: company.loginIdentityId } });
  } catch {
    // Restrict — سجلٌّ لا يُحذف بحال يشير إليها؛ تبقى كما تبقى منشآتُ tasks.e2e.
  }
}
