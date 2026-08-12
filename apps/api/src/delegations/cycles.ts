import { BadRequestException } from '@nestjs/common';
import { MSG } from '../common/i18n/messages';

/**
 * منع الدورات في شجرة التفويض.
 *
 * **الخطر:** «أ» يفوّض «ب»، و«ب» يفوّض «أ». فحساب التقاطع — وهو يمشي على
 * السلسلة من الجذر إلى الورقة — يدخل حلقةً لا تنتهي. النتيجة ليست صلاحيةً
 * خاطئة بل **تعليق الطلب**، وهو أسوأ: لا رسالة ولا سجل، فقط انتظار.
 *
 * **والرفض بنصٍّ عربي واضح لا بانهيار:** المفوِّض يرى سبب المنع فيُصلح
 * الإسناد. وانهيارٌ صامت يترك العطل يتكرّر بلا تفسير.
 *
 * ⚠️ ويشمل **الدورة غير المباشرة**: أ→ب→ج→أ. فحصُ الطرفين وحدهما
 * (`grantor !== grantee`) يمرّ عليها — وهو الفخّ الذي يُوقَع فيه عادةً.
 */

/** حافة تفويض قائمة: من ⇒ إلى. */
export interface Edge {
  grantorId: string;
  granteeId: string;
}

/**
 * هل يخلق تفويضٌ جديد دورة؟
 *
 * يمشي من `granteeId` صعوداً في الحواف القائمة: إن وصل إلى `grantorId`
 * فالحلقة تُغلق. والمشي **على الحواف الفعّالة وحدها** — الحافة المسحوبة
 * لا تُقيّد شيئاً.
 */
export function wouldCreateCycle(edges: readonly Edge[], grantorId: string, granteeId: string): boolean {
  // الدورة الذاتية: أ يفوّض نفسه.
  if (grantorId === granteeId) return true;

  const out = new Map<string, string[]>();
  for (const e of edges) {
    const list = out.get(e.grantorId);
    if (list) list.push(e.granteeId);
    else out.set(e.grantorId, [e.granteeId]);
  }

  // من `grantee` إلى أين يصل؟ إن بلغ `grantor` أغلقت الحافة الجديدة الحلقة.
  const seen = new Set<string>([granteeId]);
  const stack = [granteeId];
  while (stack.length) {
    const node = stack.pop()!;
    for (const next of out.get(node) ?? []) {
      if (next === grantorId) return true;
      if (!seen.has(next)) {
        seen.add(next);
        stack.push(next);
      }
    }
  }
  return false;
}

/** يرفض بنصّ عربي مفهوم — لا استثناء تقني ولا تعليق. */
export function assertNoCycle(edges: readonly Edge[], grantorId: string, granteeId: string): void {
  if (wouldCreateCycle(edges, grantorId, granteeId)) {
    throw new BadRequestException(MSG.delegation_cycle_rejected);
  }
}
