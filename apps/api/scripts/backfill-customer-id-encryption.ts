/**
 * Backfill (توجيه ٢٨٦ · البند ٨): يشفّر المعرّفَ البديل الصريح لكلِّ عميلٍ قائم، منشأةً منشأة، ويمحو الصريح.
 *
 * **لماذا سكربتٌ لا هجرة**: المفتاحُ خارج القاعدة (`PII_ENCRYPTION_KEYS` · `PII_BLIND_INDEX_KEY`)، فلا تستطيع هجرةٌ أن تكتب
 * نصّاً مشفَّراً. فالترتيبُ ثلاثُ خطوات (`DEPLOY.md §6` — مسارُ «ج»):
 *   ١) الهجرةُ `20261008110000_customer_id_encrypted` تضيف الأعمدةَ وتعدّ ما ينتظر (WARNING).
 *   ٢) هذا السكربت يشفّر ويمحو الصريح.
 *   ٣) الهجرةُ `20261008120000_customer_id_plaintext_dropped` تُسقط العمودَ — **وترفض إن بقي صريحٌ واحد**.
 *
 * **ما يفعله**: لكلِّ منشأةٍ معاملةٌ بسياقها (`app.company_id` — الجدولُ تحت `FORCE`)، يقرأ الصريحَ ويكتب النصَّ المشفَّرَ والبصمةَ
 * ويمحو الصريحَ في التحديث نفسِه، ثم يعدّ ما بقي **من القاعدة نفسِها** لا من توقّعه. **آمنٌ للإعادة**، ولا يفعل شيئاً بعد
 * أن يُسقط العمود. **ولا يطبع رقماً قطّ** — العددُ والمنشأةُ وحدَهما.
 *
 * التشغيل (من apps/api):   npx ts-node scripts/backfill-customer-id-encryption.ts
 * وفي الإنتاج (صورةُ التشغيل): node dist/scripts/backfill-customer-id-encryption.js
 */
import { PrismaClient } from '@mad-app/db';
import { encryptPlaintextCustomerIds, plaintextOtherIdColumnExists } from '../src/customers/customer-id-backfill.util';

const prisma = new PrismaClient();

async function main() {
  if (!(await plaintextOtherIdColumnExists(prisma))) {
    console.log('العمودُ الصريح customers.otherId غيرُ موجود (أُسقط بالهجرة الثانية) — لا شيءَ يُشفَّر.');
    return;
  }
  const companies = await prisma.company.findMany({ select: { id: true, orgName: true }, orderBy: { createdAt: 'asc' } });
  console.log(`فحص ${companies.length} منشأة …`);

  let failures = 0;
  let total = 0;
  let remainingTotal = 0;
  for (const company of companies) {
    try {
      const { found, encrypted, remaining } = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.company_id', ${company.id}, true)`;
        const done = await encryptPlaintextCustomerIds(tx, company.id);
        const left = await tx.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM "customers" WHERE "companyId" = ${company.id} AND "otherId" IS NOT NULL`;
        return { ...done, remaining: Number(left[0]?.n ?? 0) };
      });
      total += encrypted;
      remainingTotal += remaining;
      if (found) console.log(`✔ ${company.orgName}: وُجد ${found} · شُفّر ${encrypted} · بقي صريحاً ${remaining}`);
    } catch (e) {
      failures += 1;
      console.error(`✘ ${company.orgName}: ${(e as Error).message}`);
    }
  }

  console.log(`الإجمالي: شُفّر ${total} معرّفاً عبر ${companies.length} منشأة · بقي صريحاً ${remainingTotal}.`);
  if (failures || remainingTotal) {
    console.error(`لم يكتمل: ${failures} منشأة فاشلة · ${remainingTotal} صريحاً باقياً — عالج السبب وأعد التشغيل (آمنٌ للإعادة). والهجرةُ الثانية ترفض حتى يصير صفراً.`);
    process.exitCode = 1;
  } else {
    console.log('اكتمل: لا صريحَ باقياً — الهجرةُ الثانية تمرّ.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
