import { ConflictException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
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

/**
 * **الرمزُ المحجوز كما هو قائمٌ — قراءةً بلا إنشاء** (`ق-١٤٩٠`): معرّفُه إن وُجد بنوعه، و`null` إن غاب، ورفضٌ مسمّى
 * إن وُجد بنوعٍ آخر. **وهي نفسُها ما يفحص به `getOrCreateAccount`** — فالفحصُ قبل ترقيم المستند لا يفترق عن رفض
 * التنفيذ بعده، ويُرفض المستندُ قبل أن يأخذ رقماً لا بعده.
 */
export async function existingReservedAccount(tx: Tx, companyId: string, code: string, type: string): Promise<string | null> {
  const existing = await tx.account.findFirst({ where: { companyId, code } });
  if (!existing) return null;
  // ⚠️ رمزٌ قائم بنوعٍ مختلف **لا يُستعمل ولا يُصحَّح تلقائياً**: تصحيحه
  // يغيّر تصنيف حسابٍ يملكه المحاسب في قوائمه المالية بلا علمه.
  if (existing.type !== type) {
    throw new ConflictException(formatMessage(MSG.account_reserved_type_conflict, { code, type }));
  }
  return existing.id;
}

/**
 * إنشاءٌ عند الحاجة برمزٍ محجوز — **مُصدَّرة كي لا يخترع كل ملفٍ نسخته**.
 *
 * (حساب التلف `5800` يستعملها في `writeoff-account.util.ts`. وتكرارُ المنطق
 * كان يعني أن فحص «رمزٌ قائم بنوعٍ مختلف» يُنسى في النسخة الثانية — وهو الفحص
 * الذي يمنعنا من تغيير تصنيف حسابٍ يملكه المحاسب بلا علمه.)
 */
export async function getOrCreateAccount(tx: Tx, companyId: string, code: string, name: string, type: string): Promise<string> {
  const existingId = await existingReservedAccount(tx, companyId, code, type);
  if (existingId) return existingId;
  const created = await tx.account.create({
    // `companyId` صريح — مقبولٌ تحت امتداد المستأجر، ولازمٌ تحت عميل البذرة.
    data: { companyId, code, name, type } as unknown as Prisma.AccountCreateInput,
    select: { id: true },
  });
  return created.id;
}

/** نوعُ حساب المخزون — مصدرٌ واحد للإنشاء عند الحاجة وللفحص قبل الترقيم. */
const INVENTORY_ACCOUNT_TYPE = 'asset';

export const getOrCreateInventoryAccount = (tx: Tx, companyId: string) =>
  getOrCreateAccount(tx, companyId, INVENTORY_ACCOUNT_CODE, INVENTORY_ACCOUNT_NAME, INVENTORY_ACCOUNT_TYPE);

/** (`ق-١٤٩٠`) قيدُ التكلفة وعكسُه يطلبان `1300` بنوعه — يُفحص قبل ترقيم المستند المخزنيّ، ولا يُنشأ هنا. */
export const assertInventoryAccountUsable = async (tx: Tx, companyId: string): Promise<void> => {
  await existingReservedAccount(tx, companyId, INVENTORY_ACCOUNT_CODE, INVENTORY_ACCOUNT_TYPE);
};

export const getOrCreateInputVatAccount = (tx: Tx, companyId: string) =>
  getOrCreateAccount(tx, companyId, INPUT_VAT_ACCOUNT_CODE, INPUT_VAT_ACCOUNT_NAME, 'asset');
