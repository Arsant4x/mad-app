import { PrismaClient } from '@prisma/client';

/**
 * تشخيص **بالتشغيل لا بالقراءة** — ماذا يحدث فعلاً لقراءةٍ خارج سياق
 * المستأجر على كل جدولٍ محميّ بـRLS؟
 *
 * ## لماذا لا يكفي قراءة السياسة
 *
 * نصّ السياسة يقول ما **كُتب**. وما يقع يعتمد على ثلاثة معاً: السياسة ·
 * و`FORCE` (بدونه يتجاوزها **مالك الجدول**) · ودور الاتصال (`app_user`
 * بـ`NOBYPASSRLS`). فالحكم من النصّ وحده استنتاجٌ لا قياس — وهو ما كلّفنا
 * ميزةً كاملة قبل ساعات.
 *
 * ## ما يقيسه
 *
 * لكل جدول: عدد صفوفه **بلا سياق** مقابل عدده **داخل سياق منشأة**. وثلاث
 * نتائج ممكنة، ولكلٍّ حكمٌ مختلف:
 *
 *   بلا سياق = 0  وداخله > 0   ⇒ **العزل يعمل** — والقراءة الخارجية عمياء.
 *                                 فكل خدمةٍ تقرأ هكذا **معطوبة صامتة**.
 *   بلا سياق = داخله > 0        ⇒ السياسة لا تمنع — تجاوزٌ **قائم**.
 *   كلاهما = 0                  ⇒ لا بيانات، والقياس **لا يحكم**.
 *
 * ⚠️ والحالة الثالثة تُعلَن ولا تُقرأ نجاحاً: «لم أرَ شيئاً» ليست «لا شيء
 * هناك» — وهي عين الالتباس الذي نقيسه.
 *
 * ## ولا يُصلح شيئاً
 *
 * تشخيصٌ فقط (أمر المالك 2026-08-13). والقرار في الأربعة قرارُه.
 */

const TABLES = [
  { table: 'audit_logs', service: 'audit.service.ts' },
  { table: 'account_deletion_requests', service: 'deletion-requests.service.ts' },
  { table: 'support_access_grants', service: 'support-access.service.ts' },
  { table: 'support_access_logs', service: 'support-access.service.ts' },
  // مرجعٌ للمقارنة: هذا هو الذي أثبت السير عطبه — فإن تصرّف كغيره، فالقياس
  // نفسه صحيح. وبدونه لا يُعرف هل «صفر» يعني عزلاً أم غياب بيانات.
  { table: 'business_activities', service: '(المرجع — أُصلح)' },
] as const;

describe('تشخيص حيّ: قراءة جدولٍ محميّ خارج سياق المستأجر', () => {
  let prisma: PrismaClient;
  let companyId = '';

  beforeAll(async () => {
    prisma = new PrismaClient();
    const c = await prisma.company.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } });
    if (!c) throw new Error('التشخيص يحتاج منشأةً واحدة على الأقل — تحقّق من البذرة');
    companyId = c.id;
  }, 60000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('⭐ يقيس الأربعة ويطبع الحكم لكلٍّ منها', async () => {
    // eslint-disable-next-line no-console
    console.log('\n  ═══ تشخيص RLS — بلا سياق مقابل داخل سياق ═══\n');
    const verdicts: Record<string, string> = {};

    for (const { table, service } of TABLES) {
      // ① بلا سياق: اتصالٌ نظيف، لا `app.company_id`.
      const outside = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "${table}"`);

      // ② داخل سياق منشأة — بنفس معاملة `TenantPrismaService`.
      const inside = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SELECT set_config('app.company_id', '${companyId}', true)`);
        return tx.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*)::bigint AS n FROM "${table}"`);
      });

      const out = Number(outside[0].n);
      const ins = Number(inside[0].n);

      const verdict =
        out === 0 && ins > 0
          ? '🔴 العزل يعمل — والقراءة الخارجية عمياء ⇒ الخدمة معطوبة صامتة'
          : out > 0 && out === ins
            ? '⚠️ لا تمنع — تجاوزٌ قائم (سياسة أوسع أو دورٌ يتجاوز)'
            : out > 0 && ins > 0
              ? `⚠️ الخارج ${out} والداخل ${ins} — تفاوتٌ يحتاج فحصاً`
              : '⚪ لا بيانات — القياس لا يحكم';

      verdicts[table] = verdict;
      // eslint-disable-next-line no-console
      console.log(`  ${table.padEnd(30)} خارج: ${String(out).padStart(4)}  داخل: ${String(ins).padStart(4)}  ${verdict}`);
      // eslint-disable-next-line no-console
      console.log(`  ${''.padEnd(30)} الخدمة: ${service}\n`);
    }

    // ⚠️ الحارس الوحيد: أن القياس **جرى**. والحكم قرارُ المالك لا قرار
    // اختبار — واختبارٌ يفرض نتيجةً هنا يحوّل تشخيصاً إلى رأي.
    expect(Object.keys(verdicts)).toHaveLength(TABLES.length);
  }, 120000);

  it('⭐ وحارسٌ للقياس نفسه: السياق يغيّر النتيجة فعلاً على جدولٍ معلوم', async () => {
    // لو لم يغيّر السياق شيئاً في أي جدول، فالقياس لا يقيس — إما أن الدور
    // يتجاوز RLS كلياً، أو أن `set_config` لم يصل. وحينها كل أحكام الاختبار
    // أعلاه بلا معنى، ويجب أن يُعرف ذلك لا أن يُقرأ «لا مشكلة».
    const outside = await prisma.$queryRawUnsafe<{ n: bigint }[]>('SELECT count(*)::bigint AS n FROM "customers"');
    const inside = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.company_id', '${companyId}', true)`);
      return tx.$queryRawUnsafe<{ n: bigint }[]>('SELECT count(*)::bigint AS n FROM "customers"');
    });
    // eslint-disable-next-line no-console
    console.log(`\n  مرجع العزل (customers): خارج ${Number(outside[0].n)} · داخل ${Number(inside[0].n)}\n`);
    expect(Number(outside[0].n)).toBe(0);
  }, 60000);
});
