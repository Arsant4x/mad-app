import { BadRequestException } from '@nestjs/common';
import { MSG } from '../common/i18n/messages';

/**
 * منع الدورات في شجرة التفويض — **رفضٌ بنصّ عربي، لا انهيار**.
 *
 * أ يفوّض ب، وب يفوّض ج، ثم ج يفوّض أ ⇒ حلقة. وحسابُ التقاطع عليها يدور
 * بلا نهاية (أو ينفد المكدّس) — أي أن الطلب **ينهار** بدل أن يُرفض.
 *
 * فالمنع يقع **قبل الكتابة**: يُسأل هل المفوَّض إليه سلفٌ للمفوِّض؟ فإن كان،
 * رُفض التفويض برسالةٍ تشرح السبب.
 */

/** حافة تفويض فعّالة: من ← إلى. المسحوبة لا تُحسب — لأنها لا تورّث. */
export interface Edge {
  grantorId: string;
  granteeId: string;
}

/**
 * هل يخلق تفويضُ `grantor → grantee` دورةً في الحواف القائمة؟
 *
 * يمشي صعوداً من المفوِّض عبر من فوّضوه: إن بلغ المفوَّضَ إليه فالحلقة
 * تُغلق. ويحرس نفسه من دورةٍ **قائمة سلفاً** في البيانات (`seen`) فلا يدور
 * هو أيضاً — حارسٌ ينهار على المدخل الذي يحرس منه ليس حارساً.
 */
export function wouldCreateCycle(edges: readonly Edge[], grantorId: string, granteeId: string): boolean {
  if (grantorId === granteeId) return true; // تفويضٌ للنفس: أقصر دورة

  const parents = new Map<string, string[]>();
  for (const e of edges) {
    const list = parents.get(e.granteeId) ?? [];
    list.push(e.grantorId);
    parents.set(e.granteeId, list);
  }

  const seen = new Set<string>();
  const stack = [grantorId];
  while (stack.length) {
    const node = stack.pop()!;
    if (node === granteeId) return true;
    if (seen.has(node)) continue;
    seen.add(node);
    for (const p of parents.get(node) ?? []) stack.push(p);
  }
  return false;
}

/** يرفض بنصٍّ عربي مترجَم بدل أن يدع الحساب ينهار. */
export function assertNoCycle(edges: readonly Edge[], grantorId: string, granteeId: string): void {
  if (wouldCreateCycle(edges, grantorId, granteeId)) {
    throw new BadRequestException(MSG.delegation_cycle_rejected);
  }
}
