/**
 * ⭐ `ق-١٣٨٤` — **حارسٌ على مستوى الأنواع: أنواعُ الطلب لا تحمل ما يرفضه الخادم.**
 *
 * الخادمُ يعمل بـ`whitelist + forbidNonWhitelisted` — فحقلٌ لا يعرفه الـ`DTO` يُردّ `400`. وخمسةُ أنواعٍ هنا كانت تحمل حقولاً
 * يرفضها (المسح `26` §ج · الخطّة `shared-types-plan.md` ③)، اثنان منها **يُرسلانها فعلاً** (تعديلُ حسابٍ بنكيٍّ أو موظّفٍ له فرع).
 *
 * **كلُّ سطرٍ مُعلَّمٍ أدناه يجب أن يُرفض** — فإن عاد حقلٌ مرفوضٌ إلى نوعه، **صار السطرُ مقبولاً فسقط البناءُ** بـ`TS2578`
 * («Unused '@ts-expect-error' directive»). ويُبنى مع الواجهة (`tsc -b`) في السير الخفيف على كلِّ دفع.
 * ⚠️ **وحدُّه معلَن**: يحرس الخمسةَ المسمّاة وحدَها حتى يحلّ التوليدُ (الخطّة ③) محلَّ الكتابة باليد.
 */
import type { ActivityInput } from './activities';
import type { BankUpdateInput } from './banks';
import type { CompanyUpdateInput } from './companies';
import type { EmployeeUpdateInput } from './employees';
import type { UpdateInvoiceInput } from './invoices';

export const requestTypesRejectServerRejectedFields = [
  // @ts-expect-error — `CreateActivityDto` لا يعرف `disabled` (التعطيلُ تعديلٌ لا إنشاء)
  { name: 'نشاط', disabled: true } satisfies ActivityInput,
  // @ts-expect-error — `UpdateBankDto` لا يقبل `branchId`: الفرعُ يُحدَّد عند الإنشاء
  { name: 'حساب', branchId: 'br1' } satisfies BankUpdateInput,
  // @ts-expect-error — `UpdateEmployeeDto` لا يقبل `branchId`: الفرعُ يُحدَّد عند الإنشاء
  { fullName: 'موظّف', branchId: 'br1' } satisfies EmployeeUpdateInput,
  // @ts-expect-error — `UpdateCompanyDto` لا يقبل `subEnd` (`ق-١٣١٧`: الاشتراكُ مسارُ المالية وحدَه)
  { orgName: 'منشأة', subEnd: '2027-01-01' } satisfies CompanyUpdateInput,
  // @ts-expect-error — `UpdateInvoiceDto` لا يقبل `creditOverride` (ولا `issuedAt` · `issuedOffsetMin` · `prepaymentInvoiceIds`)
  { notes: 'ملاحظة', creditOverride: true } satisfies UpdateInvoiceInput,
];
