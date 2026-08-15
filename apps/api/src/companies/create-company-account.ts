import { ConflictException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { createDefaultChart } from '../accounts/default-chart';
import { createCompanyDefaults } from './company-defaults';
import { formatMessage, MSG } from '../common/i18n/messages';

/**
 * إنشاء حساب منشأة — **النواة الوحيدة**.
 *
 * لماذا وُجدت: كان لإنشاء المنشأة جسمان متطابقان — `AuthService.register`
 * (تسجيل ذاتي) و`CompaniesService.create` (لوحة مدير المنصة) — بنفس الترتيب
 * ونفس الاستدعاءات، **وتعليقاهما العربيان منسوخان بالحرف**. وقرار المالك
 * (2026-08-14): القنوات الأخرى — مدير المنصة · وسيط · مندوب — **أدوارٌ على نموذجٍ
 * واحد لا مسارات موازية**. فأي إضافة للتسجيل (نشاط · باقة · نوع الكيان) كانت
 * تُكتب مرتين أو **تُنسى في أحدهما** — وهذا بالضبط ما يمنعه وجود نواة واحدة.
 *
 * وما بقي مختلفاً بين القناتين بقي **وسيطاً** لا فرعاً في الشيفرة:
 * قالب الصلاحيات (الذاتي يأخذ الأوسع · المدير يختار) · وتواريخ الاشتراك.
 *
 * ⚠️ وثلاث ضمانات لا تُكسَر — كلٌّ منها كان عطلاً قبل أن يصير قاعدة:
 *
 * ١. **معاملة واحدة.** منشأةٌ بلا دليل حسابات تُصدر مستنداتها بنجاح ولا يُرحَّل
 *    منها شيء (`resolveAccountIds` يتخطّى صامتاً عند نقص أي رمز). فالحالة
 *    الوسطى أسوأ من فشل الإنشاء — ولذلك لا تُولد أصلاً.
 * ٢. **`set_config` قبل الإدراج.** سياسة RLS على `accounts` تفحص الإدراج أيضاً
 *    (`WITH CHECK`)، والسياق لا يُضبط قبل هذه اللحظة لأن المعرّف يولد مع الصف.
 * ٣. **`subEnd` لا يُترك فارغاً.** `evaluateCompanyStatus` يعيد الحالة كما هي حين
 *    يغيب، فمنشأةٌ بلا تاريخ نهاية **لا تتجمّد أبداً** — أي قناةٌ خارج دورة
 *    الحياة كلها. فالنواة تسقط على مدة التجربة عند الغياب بدل أن تُنتج ذلك الصفّ.
 */
export interface CreateCompanyAccountInput {
  username: string;
  password: string;
  orgName: string;
  permissionTemplateId: string;
  /** بريد المنشأة — اختياري اليوم. سيصير إلزامياً في مسار التسجيل الذاتي (بند ⑪). */
  email?: string | null;
  /** بداية الاشتراك. الغياب = الآن. */
  subStart?: Date;
  /** نهاية الاشتراك. **الغياب = الآن + `trialDays`** — انظر الضمانة ٣. */
  subEnd?: Date;
  /** مدة التجربة بالأيام — تُقرأ من البيئة لدى المستدعي لا هنا (قرار تجاري بلا نشر). */
  trialDays: number;
}

/**
 * يُنشئ هوية الدخول والمنشأة ودليل الحسابات والافتراضات في معاملة واحدة.
 * يعيد معرّف المنشأة وحده — فمن احتاج الصفّ بشكلٍ آخر يقرؤه بعد الالتزام
 * بالـ`include` الذي يخصّه. (تجنُّب `include` عامّ هنا مقصود: النواة تبقى
 * بتوقيعٍ واحد لا يتفرّع بحسب حاجة كل مستدعٍ.)
 */
export async function createCompanyAccount(
  prisma: PrismaService,
  input: CreateCompanyAccountInput,
): Promise<{ companyId: string; identityId: string }> {
  const clash = await prisma.loginIdentity.findUnique({ where: { username: input.username } });
  if (clash) throw new ConflictException(formatMessage(MSG.username_taken, { username: input.username }));

  const subStart = input.subStart ?? new Date();
  const subEnd = input.subEnd ?? addDays(subStart, input.trialDays);

  return prisma.$transaction(async (tx) => {
    const created = await tx.loginIdentity.create({
      data: {
        username: input.username,
        passwordHash: await argon2.hash(input.password),
        actorType: 'COMPANY',
        company: {
          create: {
            orgName: input.orgName.trim(),
            email: input.email?.trim() || null,
            permissionTemplateId: input.permissionTemplateId,
            subStart,
            subEnd,
          },
        },
      },
      include: { company: { select: { id: true } } },
    });

    const companyId = created.company!.id;
    await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
    await createDefaultChart(tx, companyId);
    await createCompanyDefaults(tx, companyId);

    return { companyId, identityId: created.id };
  });
}

function addDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}
