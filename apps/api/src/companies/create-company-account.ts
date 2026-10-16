import { ConflictException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { createDefaultChart } from '../accounts/default-chart';
import { createCompanyDefaults } from './company-defaults';
import { createBirthFiscalYear } from '../fiscal/fiscal-calendar.util';
import { regionForNewCompany } from '../common/region/regions';
import { formatMessage, MSG } from '../common/i18n/messages';
import { assertPasswordPolicy } from '../common/password/password-policy';

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
 * What still differs between the two channels stays a parameter, not a branch in the code: the
 * permission template (self signup takes the broadest, the admin chooses). The subscription does not
 * differ: no channel sets subscription dates.
 *
 * ⚠️ وثلاث ضمانات لا تُكسَر — كلٌّ منها كان عطلاً قبل أن يصير قاعدة:
 *
 * ١. **معاملة واحدة.** منشأةٌ بلا دليل حسابات تُصدر مستنداتها بنجاح ولا يُرحَّل
 *    منها شيء (`resolveAccountIds` يتخطّى صامتاً عند نقص أي رمز). فالحالة
 *    الوسطى أسوأ من فشل الإنشاء — ولذلك لا تُولد أصلاً.
 * ٢. **`set_config` قبل الإدراج.** سياسة RLS على `accounts` تفحص الإدراج أيضاً
 *    (`WITH CHECK`)، والسياق لا يُضبط قبل هذه اللحظة لأن المعرّف يولد مع الصف.
 * 3. No subscription time at birth, and `subEnd` is never left empty. A company is born with its end
 *    equal to its start, frozen read only, until the platform's two person subscription decision
 *    activates it. An empty end would never freeze (`evaluateCompanyStatus` keeps the status as it is),
 *    which would make the company active forever.
 */
export interface CreateCompanyAccountInput {
  username: string;
  password: string;
  orgName: string;
  permissionTemplateId: string;
  /** The owner's e-mail, required on both channels: a password reset link is only ever sent there. */
  email: string;
  /**
   * 🔴 `ق-١٣٦٨` — **دولةُ المنشأة المعلَنة** (ISO 3166-1 alpha-2). والغيابُ يأخذ الإقليمَ **الوحيد** الذي تخدمه المنصّة — ويصير
   * الإعلانُ إلزامياً من تلقاء نفسه حين يُضاف ثانٍ (`regionForNewCompany`). ومنها تُكتب الحقولُ الأربعة صراحةً: لا افتراضَ في القاعدة.
   */
  country?: string | null;
  /**
   * هل القناة **عامّة بلا مصادقة**؟ يقرّر **رسالة تكرار اسم المستخدم** وحدها.
   *
   * لماذا وسيطٌ لا فرعٌ في الشيفرة: التمييز **في القناة لا في الفعل**. الفعل
   * واحد (اسمٌ مأخوذ)، والمسموح كشفه يختلف:
   *
   * · **لوحة المدير / لوحة التاجر** — فاعلٌ موثَّق يُدير حساباتٍ يملكها، فردٌّ
   *   صريح باسمه **مساعدة**: «اسم المستخدم "س" مستخدَم بالفعل».
   * · **`/auth/register`** — بوّابة مفتوحة، فالردّ الصريح يجعلها **أداة تعداد
   *   حسابات**: يُجرَّب اسمٌ ويُقرأ الجواب. لا فارق زمنٍ يُقاس ولا حدّ معدّل
   *   يُراوَغ — إجابةٌ مباشرة.
   *
   * ⚠️ **وظهر هذا التمييز في تعارض دمج، لا في تصميم**: نُقل الفحص إلى النواة
   * (البند ٠) بينما كان يُعدَّل في `register` (الموجة صفر). ولولا التعارض
   * لبقيت رسالةٌ واحدة للقناتين — وهو ما كان قبل اليوم.
   */
  publicChannel?: boolean;
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
  assertPasswordPolicy(input.password, { username: input.username, email: input.email });
  const clash = await prisma.loginIdentity.findUnique({ where: { username: input.username } });
  if (clash) {
    throw new ConflictException(
      input.publicChannel
        ? MSG.register_username_unavailable
        : formatMessage(MSG.username_taken, { username: input.username }),
    );
  }

  const born = new Date();
  // يُحلّ قبل المعاملة: إقليمٌ غيرُ مدعوم أو غيرُ معلَنٍ حين يلزم يُردّ `400` قبل أن يُكتب صفّ.
  const region = regionForNewCompany(input.country);

  return prisma.$transaction(async (tx) => {
    // منشأةُ الهويّة (`login_identities.companyId` — `ق-٦٦٦`) **تملؤها القاعدةُ** هنا:
    // مشغِّلُ `companies_identity_follows` يكتبها بعد إدراج صفّ المنشأة — فالهويّةُ
    // تُدرَج أولاً ولا معرّفَ لمنشأتها بعدُ، والمفتاحُ الأجنبيُّ لا يقبل معرّفاً لم يُدرَج.
    const created = await tx.loginIdentity.create({
      data: {
        username: input.username,
        passwordHash: await argon2.hash(input.password),
        actorType: 'COMPANY',
        company: {
          create: {
            orgName: input.orgName.trim(),
            email: input.email.trim(),
            permissionTemplateId: input.permissionTemplateId,
            // Born without a subscription: an end equal to the start, in the read only state the
            // status rules would give it on its first evaluation.
            subStart: born,
            subEnd: born,
            status: 'FROZEN',
            frozenAt: born,
            // ق-١٣٦٨ — الأربعةُ صراحةً من سجلّ الأقاليم؛ ولا افتراضَ في القاعدة يكتبها بدلاً منه.
            country: region.country,
            timeZone: region.timeZone,
            locale: region.locale,
            baseCurrency: region.baseCurrency,
          },
        },
      },
      include: { company: { select: { id: true } } },
    });

    const companyId = created.company!.id;
    await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
    await createDefaultChart(tx, companyId);
    await createCompanyDefaults(tx, companyId);
    // ⚖️ السنةُ المالية تولد مع المنشأة، ميلاديةً افتراضاً (توجيه ٢٧٥ · ق-١٥٨٤)، فلا يعمل القفلُ مفتوحاً من يومها الأوّل.
    await createBirthFiscalYear(tx, companyId);

    return { companyId, identityId: created.id };
  }, {
    /**
     * **ميلادُ المنشأة ليس مساراً ساخناً، وبرودتُه مقيسة** (2026-09-21): أوّلُ تسجيلٍ في عمليةٍ باردة — هويّةٌ ومنشأةٌ
     * ودليلُ ثمانيةَ عشرَ حساباً وافتراضاتٌ، كلُّ عبارةٍ تُترجَم أوّلَ مرّة — بلغ `5473` و`5907` و`6394 ms` على جهازٍ
     * مثقَل فسقط على المهلة الافتراضية `5 s` بـ`500` لأوّل مسجِّل. مهلةُ **معاملة المستأجر** (`5 s`) قرارٌ لا يُمسّ؛
     * وهذه معاملةُ الميلاد وحدَها، تُعطى ما يكفي البرودةَ ولا تُفتح للأبد.
     */
    timeout: 20_000,
  });
}
