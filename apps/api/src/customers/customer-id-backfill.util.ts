import { Prisma } from '@mad-app/db';
import { encryptField } from '../common/crypto/field-cipher.util';
import { customerOtherIdAad, customerOtherIdIndex } from './customer-identity.util';

/**
 * ⚖️ **تشفيرُ المعرّف البديل القائم — ما لا تستطيعه هجرة** (توجيه ٢٨٦ · البند ٨).
 *
 * المفتاحُ خارج القاعدة، فالهجرةُ `20261008110000_customer_id_encrypted` تضيف الأعمدةَ ولا تشفّر؛ وهذه الدالّةُ تقرأ الصريحَ
 * (`customers.otherId` — عمودٌ لم يعد في المخطَّط فيُقرأ بـSQL خام) وتكتب النصَّ المشفَّرَ وبصمتَه **وتمحو الصريحَ في التحديث
 * نفسِه** — فلا لحظةَ يحمل فيها الصفُّ الاثنين، والقيدُ الانتقاليّ يمنع ذلك أصلاً.
 *
 * - **داخل سياق المنشأة** (`tx` ضُبط عليه `app.company_id`): الجدولُ تحت `FORCE`، وقراءةٌ خارج السياق تعود فارغةً بنجاح.
 * - **وبلا مرشِّح حذفٍ ناعم** (SQL خام): ما في السلّة يُشفَّر كالحيّ — السلّةُ ليست ملاذاً للصريح.
 * - **آمنةٌ للإعادة**: لا تجد صريحاً بعد أوّل تشغيل؛ والتحديثُ مشروطٌ بالقيمة المقروءة، فتعديلٌ متزامنٌ لا يُدهس.
 * - **القيمةُ كما خُزّنت** (قيدُ القاعدة حبسها حروفاً وأرقاماً) — والبصمةُ على صيغتها بحروفٍ كبيرة كما يكتبها الإنشاء.
 */
export async function encryptPlaintextCustomerIds(tx: Prisma.TransactionClient, companyId: string): Promise<{ found: number; encrypted: number }> {
  const rows = await tx.$queryRaw<{ id: string; otherId: string }[]>`
    SELECT "id", "otherId" FROM "customers" WHERE "companyId" = ${companyId} AND "otherId" IS NOT NULL`;
  let encrypted = 0;
  for (const r of rows) {
    const cipher = encryptField(r.otherId, customerOtherIdAad(companyId, r.id));
    const index = customerOtherIdIndex(r.otherId, companyId);
    encrypted += await tx.$executeRaw`
      UPDATE "customers" SET "otherIdCipher" = ${cipher}, "otherIdIndex" = ${index}, "otherId" = NULL
       WHERE "id" = ${r.id} AND "otherId" = ${r.otherId}`;
  }
  return { found: rows.length, encrypted };
}

/** أما زال العمودُ الصريح قائماً؟ — بعد الهجرة الثانية لا عمودَ، فلا شيءَ يُفعل. */
export async function plaintextOtherIdColumnExists(client: { $queryRaw: Prisma.TransactionClient['$queryRaw'] }): Promise<boolean> {
  const r = await client.$queryRaw<{ n: bigint }[]>`
    SELECT count(*)::bigint AS n FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'customers' AND column_name = 'otherId'`;
  return Number(r[0]?.n ?? 0) > 0;
}
