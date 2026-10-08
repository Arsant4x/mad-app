import { blindIndex, decryptField, encryptField } from '../common/crypto/field-cipher.util';
import { normalizeIdentifier } from '../common/identity/identifiers.util';

/**
 * ⚖️ **رقمُ هويّة المستأجر على العقد — تشفيرٌ يُفكّ** (حكمُ صاحب المشروع على السؤال ٩٤٨، الخيار «ب» · توجيه ٢٨٦ البند ٤).
 *
 * الخياراتُ كانت ثلاثة (`docs/archive/scratch/review-284/measure-28.md`): (أ) بصمةٌ لا تُفكّ كـ`ق-٩٣` · (ب) تشفيرٌ يُفكّ بمفتاح
 * المنصّة وبصمةٌ مجالُها المنشأة كهويّة الموظف (`ق-١٣٤٥`) · (ج) لا حقل. **والحكمُ (ب)** — فالشكلُ شكلُ الموظف بعينه:
 * نصٌّ مشفَّرٌ `f1:` مربوطٌ بموضعه `companyId|contracts.tenantId|contractId`، وبصمةُ `b1:` للبحث داخل المنشأة.
 *
 * **ولا يخرج إلا في التفصيل** (`GET /contracts/:id`): القائمةُ وكلُّ ردٍّ يحمل العقدَ تقول `tenantIdOnFile` وحدَها.
 * **حدٌّ معلَن**: التجديدُ يُعيد تشفيرَ الرقم لصفّ العقد الجديد (الموضعُ يحمل معرّفَ العقد، فالنصُّ لا يُنسخ).
 */

export const contractTenantIdAad = (companyId: string, contractId: string) => `${companyId}|contracts.tenantId|${contractId}`;

/** ما يُكتب: `undefined` لا يمسّ، والفارغُ يمحو، وغيرُه يُطبَّع ثم يُشفَّر ببصمته. */
export function contractTenantIdData(companyId: string, contractId: string, raw: string | null | undefined) {
  if (raw === undefined) return {};
  const v = normalizeIdentifier(raw);
  return v
    ? { tenantIdCipher: encryptField(v, contractTenantIdAad(companyId, contractId)), tenantIdIndex: blindIndex(v, companyId) }
    : { tenantIdCipher: null, tenantIdIndex: null };
}

/** يفكّ الرقمَ لتفصيل العقد — `null` حين لا رقم. */
export function decryptContractTenantId(companyId: string, row: { id: string; tenantIdCipher: string | null }): string | null {
  return row.tenantIdCipher ? decryptField(row.tenantIdCipher, contractTenantIdAad(companyId, row.id)) : null;
}

/** العقدُ كما يخرج في كلِّ ردّ: بلا نصٍّ مشفَّرٍ ولا بصمة — وعلامةُ الوجود وحدَها. */
export function publicContract<T extends { tenantIdCipher: string | null; tenantIdIndex: string | null }>(row: T): Omit<T, 'tenantIdCipher' | 'tenantIdIndex'> & { tenantIdOnFile: boolean } {
  const { tenantIdCipher, tenantIdIndex: _index, ...rest } = row;
  return { ...rest, tenantIdOnFile: tenantIdCipher !== null };
}
