/**
 * تعبئة الافتراضيات للمنشآت القائمة — نشاطٌ وصفُّ عملة الأساس.
 *
 * نظير `backfill-default-chart.ts` وبنفس الضمانات:
 *   • **عديم الأثر عند التكرار**: يفحص الوجود قبل الإنشاء، فتشغيله مرتين
 *     لا يُنشئ شيئاً مرتين.
 *   • **لا يمسّ منشأةً مكتملة**: من تملك نشاطاً أو عملة تُترك كما هي —
 *     ولا يُدهس اسمٌ أو نوعٌ عدّله المستخدم.
 *   • **يطبع العدّ قبل وبعد**، فالنتيجة تُقرأ لا تُفترض.
 *
 * التشغيل:
 *   npx ts-node scripts/backfill-company-defaults.ts          # جافّ (لا كتابة)
 *   npx ts-node scripts/backfill-company-defaults.ts --apply  # تنفيذ
 */
import { PrismaClient } from '@mad-app/db';
import { createCompanyDefaults } from '../src/companies/company-defaults';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

/**
 * ⚠️ القراءة **داخل سياق المستأجر** لا خارجه.
 *
 * `business_activities` و`currencies` تحت عزل الصفوف (RLS): استعلامٌ بلا
 * `app.company_id` يعود فارغاً **دائماً** — لا لأن الصف غائب بل لأن السياسة
 * تحجبه.
 *
 * وأول صياغة لهذا السكربت وقعت فيها: أبلغت «205 ناقصة» ثم «أُنشئ 203» ثم
 * «ما زال ناقصاً 205». **التناقض هو ما كشفها** — عدٌّ يقرأ من خلف حجاب
 * فيرى الغياب حيث لا غياب. ولو كان الرقم متسقاً لمرّ الخطأ كاملاً.
 */
async function stateOf(companyId: string): Promise<{ activity: boolean; currency: boolean }> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;
    const [a, c] = await Promise.all([
      tx.businessActivity.findFirst({ where: { companyId }, select: { id: true } }),
      tx.currency.findFirst({ where: { companyId }, select: { id: true } }),
    ]);
    return { activity: Boolean(a), currency: Boolean(c) };
  });
}


async function main(): Promise<void> {
  const companies = await prisma.company.findMany({ select: { id: true, orgName: true } });

  // الحصر قبل أي كتابة — وهو نفسه «العدّ قبل».
  const before = { total: companies.length, missingActivity: 0, missingCurrency: 0, complete: 0 };
  const targets: { id: string; orgName: string; needsActivity: boolean; needsCurrency: boolean }[] = [];

  for (const c of companies) {
    const { activity, currency } = await stateOf(c.id);
    if (!activity) before.missingActivity++;
    if (!currency) before.missingCurrency++;
    if (activity && currency) before.complete++;
    else targets.push({ id: c.id, orgName: c.orgName, needsActivity: !activity, needsCurrency: !currency });
  }

  console.log('════════ قبل ════════');
  console.log(`  المنشآت:          ${before.total}`);
  console.log(`  بلا نشاط:         ${before.missingActivity}`);
  console.log(`  بلا صفّ عملة:      ${before.missingCurrency}`);
  console.log(`  مكتملة (لا تُمسّ): ${before.complete}`);

  if (!APPLY) {
    console.log(`\n(تشغيل جافّ — لا كتابة. ${targets.length} منشأة ستُعالَج مع --apply)`);
    return;
  }

  let activitiesCreated = 0;
  let currenciesCreated = 0;
  for (const t of targets) {
    // نفس نمط البذرة: سياق المستأجر مضبوط داخل المعاملة، فسياسات RLS تسمح
    // بالإدراج (WITH CHECK) على الجدولين.
    const res = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.company_id', ${t.id}, true)`;
      return createCompanyDefaults(tx, t.id);
    });
    if (res.activityCreated) activitiesCreated++;
    if (res.currencyCreated) currenciesCreated++;
  }

  // العدّ بعد يُقرأ من القاعدة من جديد — لا يُشتقّ من العدّادات أعلاه.
  // عدّادٌ يعدّ نفسه ليس تحققاً.
  let stillMissing = 0;
  for (const c of companies) {
    const { activity, currency } = await stateOf(c.id);
    if (!activity || !currency) stillMissing++;
  }

  console.log('\n════════ بعد ════════');
  console.log(`  أنشطة أُنشئت:      ${activitiesCreated}`);
  console.log(`  صفوف عملة أُنشئت:  ${currenciesCreated}`);
  console.log(`  ما زال ناقصاً:     ${stillMissing}   ${stillMissing === 0 ? '✅' : '⛔'}`);
  if (stillMissing !== 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
