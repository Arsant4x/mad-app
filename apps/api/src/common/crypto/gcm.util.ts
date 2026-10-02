import { createDecipheriv, type DecipherGCM } from 'node:crypto';

/**
 * ⚖️ **فكُّ `AES-256-GCM` بوسمٍ كامل — مدخلٌ واحد** (توجيه ٢٧٥ · `ق-١٥٨٦`، بحكم صاحب المشروع).
 *
 * `createDecipheriv` بلا `authTagLength` يقبل وسماً من أربعة بايتاتٍ فأكثر ويتحقّق بما وصله وحدَه، فقيمةٌ قُصّ وسمُها تُفكّ كما هي
 * ومن يزوّر نصّاً يكفيه أن يصيب اثنين وثلاثين بتّاً. وكلُّ ما نكتبه وسمُه ستّةَ عشرَ بايتاً، فما سواه يُرفض باسمه قبل الفكّ، والطولُ
 * معلَنٌ للمكتبة أيضاً فلا يعتمد الرفضُ على فحصٍ واحد. **وكلُّ فكٍّ في الخادم يمرّ من هنا** (`gcm-tag-length.spec.ts` يُسقط
 * الحزمةَ على `createDecipheriv` خارج هذا الملف).
 */
export const GCM_TAG_BYTES = 16;

export function gcmDecipher(key: Buffer, iv: Buffer, tag: Buffer): DecipherGCM {
  if (tag.length !== GCM_TAG_BYTES) {
    throw new Error(`وسمُ التحقّق ${tag.length} بايتاً والمطلوبُ ${GCM_TAG_BYTES}: قيمةٌ مقصوصةٌ أو معبوثٌ بها`);
  }
  const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: GCM_TAG_BYTES });
  decipher.setAuthTag(tag);
  return decipher;
}
