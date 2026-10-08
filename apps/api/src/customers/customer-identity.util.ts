import { BadRequestException } from '@nestjs/common';
import { Customer, Prisma } from '@mad-app/db';
import { blindIndex, decryptField, encryptField } from '../common/crypto/field-cipher.util';
import { normalizeIdentifier } from '../common/identity/identifiers.util';
import { MSG } from '../common/i18n/messages';

/**
 * ⚖️ **المعرّفُ البديل للمشتري مشفَّرٌ في التطبيق** (توجيه ٢٨٦ — البندان ٨ و٤ · بنمط `ق-١٣٤٥` لهويّة الموظف).
 *
 * كان رقمُ المشتري (BR-KSA-14: هويّةٌ وطنية · إقامة · جواز · سجلٌّ تجاريّ …) يُحفظ نصّاً صريحاً في `customers.otherId`، فيصل
 * كلَّ نسخةٍ ومقلبٍ وتصديرٍ وكلَّ سطرٍ في سجلّ التدقيق كتبه إنشاءٌ أو تعديل. **وصار كهويّة الموظف**:
 *
 * - **النصُّ المشفَّر** (`otherIdCipher`) بصيغة `f1:` مربوطٌ بموضعه `companyId|customers.otherId|customerId` — فنسخُه إلى عميلٍ
 *   آخر أو منشأةٍ أخرى **يفشل فكُّه** بدل أن يُقرأ رقماً لغيره.
 * - **وبصمةُ البحث** (`otherIdIndex`) بمفتاحٍ منفصل، **مجالُها المنشأة** — الرقمُ نفسُه في منشأتين بصمتان مختلفتان.
 * - **المخطّطاتُ كلُّها بالشكل نفسِه** — الشخصيُّ منها والتجاريّ: أبسطُ، والتجاريُّ لا يخسر شيئاً (يُفكّ حيث يلزم).
 * - **والمخطّطُ صريح** (`otherIdScheme`) — رمزٌ من أحد عشر، لا رقم.
 *
 * **ولا يخرج النصُّ المشفَّرُ ولا البصمةُ في ردٍّ قطّ**: القائمةُ وردودُ الإنشاء والتعديل وكلُّ مستندٍ يحمل عميلَه تقول
 * `otherIdOnFile` وحدَها (أو لا تقول شيئاً)، **والتفصيلُ** (`GET /customers/:id` — نافذةُ التعديل) **ومستندُ الهيئة** يفكّان.
 *
 * ⚠️ **حدودٌ معلَنة**: ① المستندُ الموقَّع المحفوظ (`invoices.zatcaSignedXml`) يحمل الرقمَ صريحاً بحكم النظام — هو المستندُ نفسُه
 * كما قُبل، ولا يُمسّ. ② صفوفُ سجلّ التدقيق السابقة لهذا البناء قد تحمل الرقمَ في `details` — السجلُّ لا يُعدَّل (الملحقُ ١).
 * ③ البصمةُ مجالُها المنشأة لا الحقل: الرقمُ نفسُه هويّةً لموظّفٍ ومعرّفاً لعميلٍ في المنشأة نفسِها بصمتان متساويتان — ثمنُ البحث، معلَن.
 */

/** المخطّطاتُ الشخصية — تُطبَّع كهويّة الموظف (`normalizeIdentifier`): بلا فواصل وبحروفٍ كبيرة، وحدُّها ٣٢. */
const PERSONAL_SCHEMES: ReadonlySet<string> = new Set(['NAT', 'IQA', 'GCC', 'PAS']);

/** الموضعُ الذي يُربط به النصُّ المشفَّر — المنشأةُ والحقلُ والصفّ. */
export const customerOtherIdAad = (companyId: string, customerId: string) => `${companyId}|customers.otherId|${customerId}`;

/** البصمةُ على الصيغة المطبَّعة بحروفٍ كبيرة — فالبحثُ لا يفرّق بين حالتَي الحرف. */
export const customerOtherIdIndex = (value: string, companyId: string) => blindIndex(value.toUpperCase(), companyId);

/**
 * يُطبِّع الرقمَ بمخطّطه: الشخصيُّ بقاعدة هويّة الموظف، والتجاريُّ كما يُرسَل بعد قصّ الأطراف (الـ`DTO` يقبله حروفاً وأرقاماً
 * لاتينية وحدَها، والقاعدةُ كانت تحرسه بالقيد نفسِه). `null` للفارغ.
 */
export function normalizeOtherId(scheme: string, raw: string): string {
  const v = PERSONAL_SCHEMES.has(scheme) ? normalizeIdentifier(raw) : raw.trim();
  if (!v || !/^[A-Za-z0-9]+$/.test(v)) throw new BadRequestException(MSG.customer_other_id_invalid);
  return v;
}

/** ما يُكتب للمعرّف البديل: المخطّطُ صريحاً، والرقمُ مشفَّراً ببصمته — أو ثلاثتُها فارغة. */
export function customerOtherIdData(companyId: string, customerId: string, pair: { scheme: string; id: string } | null) {
  if (!pair) return { otherIdScheme: null, otherIdCipher: null, otherIdIndex: null };
  const v = normalizeOtherId(pair.scheme, pair.id);
  return {
    otherIdScheme: pair.scheme,
    otherIdCipher: encryptField(v, customerOtherIdAad(companyId, customerId)),
    otherIdIndex: customerOtherIdIndex(v, companyId),
  };
}

/** يفكّ الرقمَ لمستنده — `null` حين لا رقم. يرمي إن نُسخ النصُّ من موضعٍ آخر أو غاب مفتاحُه. */
export function decryptCustomerOtherId(companyId: string, row: { id: string; otherIdCipher: string | null }): string | null {
  return row.otherIdCipher ? decryptField(row.otherIdCipher, customerOtherIdAad(companyId, row.id)) : null;
}

/**
 * ⭐ **أعمدةُ العميل التي تخرج في الردود — قائمةُ سماحٍ لا قائمةُ منع**: كلُّ مستندٍ يحمل عميلَه (الفاتورة · العرض · بيعُ الكاشير)
 * يقرؤه بهذا الاختيار فلا يحمل النصَّ المشفَّرَ ولا البصمة. **وحارسٌ يشتقّ من المخطَّط** (`customer-identity.util.spec.ts`)
 * فعمودٌ جديدٌ على العميل يُسقط الحزمةَ حتى يُقرَّر: يخرج أم لا.
 */
export const CUSTOMER_PUBLIC_SELECT = {
  id: true,
  companyId: true,
  name: true,
  vatNumber: true,
  phone: true,
  creditLimit: true,
  kind: true,
  otherIdScheme: true,
  country: true,
  street: true,
  buildingNumber: true,
  district: true,
  city: true,
  postalCode: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  archived: true,
} as const satisfies Prisma.CustomerSelect;

/** ما لا يخرج في ردٍّ قطّ — النصُّ المشفَّرُ وبصمتُه. */
export const CUSTOMER_SECRET_FIELDS = ['otherIdCipher', 'otherIdIndex'] as const;

/** الصفُّ كما يخرج في كلِّ ردّ: بلا نصٍّ مشفَّرٍ ولا بصمة — وعلامةُ الوجود وحدَها. */
export function publicCustomer<T extends Pick<Customer, 'otherIdCipher' | 'otherIdIndex'>>(row: T): Omit<T, 'otherIdCipher' | 'otherIdIndex'> & { otherIdOnFile: boolean } {
  const { otherIdCipher, otherIdIndex: _index, ...rest } = row;
  return { ...rest, otherIdOnFile: otherIdCipher !== null };
}
