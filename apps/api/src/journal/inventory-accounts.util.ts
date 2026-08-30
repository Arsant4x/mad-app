import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { formatMessage, MSG } from '../common/i18n/messages';

/**
 * حسابا `م٥` — المخزون وضريبة المدخلات.
 *
 * ## لماذا يُنشآن عند الحاجة لا في الدليل وحده
 *
 * ⚠️ `resolveAccountIds` يعيد `null` **تخطّياً صامتاً** إذا نقص رمز. فإضافة
 * رمزين جديدين إلى الدليل الافتراضي وحده تعني أن **كل منشأة قائمة تتوقّف
 * مشترياتها عن الترحيل بلا رسالة** — دفترٌ يسكت بدل أن يشتكي.
 *
 * فيُضافان إلى الدليل **للمنشآت الجديدة**، ويُنشآن **عند أول استعمال**
 * للقائمة — نفس نمط حساب الأرصدة الافتتاحية (`3900`).
 *
 * ## ولماذا حسابا ضريبة لا واحد
 *
 * كان `2200` يحمل المدخلات والمخرجات معاً: الشراء يُمدِّنه والبيع يُدائنه.
 * **فرصيده يصير سالباً كلما زادت المشتريات** — مقيس على مجسّ حيّ: `-7500`.
 * وحسابٌ التزامٍ برصيدٍ سالب ليس التزاماً، والإقرار يُقرأ منه.
 *
 * فالمدخلات **أصل** (حقٌّ لدى الهيئة يُخصم) والمخرجات **التزام** (دَينٌ لها).
 */

export const INVENTORY_ACCOUNT_CODE = '1300';
export const INVENTORY_ACCOUNT_NAME = 'المخزون';

export const INPUT_VAT_ACCOUNT_CODE = '1250';
export const INPUT_VAT_ACCOUNT_NAME = 'ضريبة القيمة المضافة — مدخلات';

/** `2200` يبقى للمخرجات وحدها بعد هذه الموجة. */
export const OUTPUT_VAT_ACCOUNT_CODE = '2200';

type Tx = Prisma.TransactionClient;

async function getOrCreate(tx: Tx, companyId: string, code: string, name: string, type: string): Promise<string> {
  const existing = await tx.account.findFirst({ where: { companyId, code } });
  if (existing) {
    // ⚠️ رمزٌ قائم بنوعٍ مختلف **لا يُستعمل ولا يُصحَّح تلقائياً**: تصحيحه
    // يغيّر تصنيف حسابٍ يملكه المحاسب في قوائمه المالية بلا علمه.
    if (existing.type !== type) {
      throw new ConflictException(formatMessage(MSG.account_reserved_type_conflict, { code, type }));
    }
    return existing.id;
  }
  const created = await tx.account.create({
    // `companyId` صريح — مقبولٌ تحت امتداد المستأجر، ولازمٌ تحت عميل البذرة.
    data: { companyId, code, name, type } as unknown as Prisma.AccountCreateInput,
    select: { id: true },
  });
  return created.id;
}

export const getOrCreateInventoryAccount = (tx: Tx, companyId: string) =>
  getOrCreate(tx, companyId, INVENTORY_ACCOUNT_CODE, INVENTORY_ACCOUNT_NAME, 'asset');

export const getOrCreateInputVatAccount = (tx: Tx, companyId: string) =>
  getOrCreate(tx, companyId, INPUT_VAT_ACCOUNT_CODE, INPUT_VAT_ACCOUNT_NAME, 'asset');
