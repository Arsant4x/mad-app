/**
 * Backfill: يعطي كل منشأة قائمة ما ينقصها من دليل الحسابات الافتراضي.
 *
 * المنشآت التي وُلدت قبل هذا التغيير قد تكون بلا دليل أصلاً، أو بدليل ناقص
 * حساباً أُضيف لمسار ترحيل جديد. أثرهما واحد: `resolveAccountIds` يعيد `null`
 * والمستند يُحفظ **بلا قيد** بلا أي رسالة. هذا السكربت يسدّ النقص وحده.
 *
 * **ما لا يفعله — عمداً:**
 *   • لا ينشئ حساباً موجوداً (الفهرس الفريد companyId+code يحسم عبر
 *     skipDuplicates) — فلا تكرار مهما تكرّر التشغيل.
 *   • لا يلمس اسم حساب قائم ولا نوعه ولا رصيده. منشأة سمّت 1000 «الصندوق»
 *     تبقى كذلك: الدليل الافتراضي يحكم المولودَ الجديد لا القائم.
 *   • لا يحذف شيئاً ولا يرحّل قيداً — الأرصدة كما هي قبل وبعد.
 *
 * يدوي بقصد: لا يُستدعى من الإقلاع ولا من مهمة مجدولة. يُشغَّل، يقول ما فعل
 * لكل منشأة، وينتهي.
 *
 * Run from apps/api:  npx ts-node scripts/backfill-default-chart.ts
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PrismaClient } = require('@prisma/client');
import { createDefaultChart, DEFAULT_CHART } from '../src/accounts/default-chart';

const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true, orgName: true }, orderBy: { createdAt: 'asc' } });
  console.log(`فحص ${companies.length} منشأة مقابل دليل من ${DEFAULT_CHART.length} حساباً...`);

  let failures = 0;
  let totalCreated = 0;
  for (const company of companies) {
    try {
      // قبل/بعد من الاستعلام نفسه: العدّ المطبوع هو ما رأته قاعدة البيانات،
      // لا ما توقّعه السكربت.
      const created = await prisma.$transaction(async (tx) => {
        // نفس نمط seed.ts: العميل الخام بلا امتداد المستأجر، فتُضبط RLS
        // لكل معاملة يدوياً — وسياسة accounts تفحص الإدراج أيضاً.
        await tx.$executeRaw`SELECT set_config('app.company_id', ${company.id}, true)`;
        return createDefaultChart(tx, company.id);
      });

      totalCreated += created;
      if (created) {
        const codes = await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.company_id', ${company.id}, true)`;
          return tx.account.findMany({
            where: { companyId: company.id, code: { in: DEFAULT_CHART.map((a) => a.code) } },
            select: { code: true, name: true },
            orderBy: { code: 'asc' },
          });
        });
        console.log(`✔ ${company.orgName}: أُنشئ ${created} حساباً (الدليل الآن ${codes.length}/${DEFAULT_CHART.length})`);
      } else {
        console.log(`— ${company.orgName}: الدليل مكتمل، لم يُنشأ شيء`);
      }
    } catch (e) {
      failures += 1;
      console.error(`✘ ${company.orgName}: ${(e as Error).message}`);
    }
  }

  console.log(`الإجمالي: ${totalCreated} حساباً أُنشئ عبر ${companies.length} منشأة.`);
  if (failures) {
    console.error(`اكتمل مع ${failures} منشأة فاشلة — عالج السبب وأعد التشغيل (السكربت آمن للإعادة).`);
    process.exitCode = 1;
  } else {
    console.log('اكتمل بنجاح.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
