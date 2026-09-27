import { ConflictException } from '@nestjs/common';
import { Prisma } from '@mad-app/db';
import { MSG } from '../common/i18n/messages';

/**
 * **`§6.12` واقعةً** (`ق-١٠٢٠` · `ق-١٠٢٩`/①): الحذفُ الناعم يُخفي العميلَ عن فحوصات التطبيق —
 * الامتدادُ يحقن `deletedAt: null` في كلِّ قراءةٍ لا تسمّيه (`tenant-scope.extension.ts`) —
 * بينما الفهرسُ الفريد `(companyId, name)` يراه. فكان الاسمُ المطابقُ لعميلٍ في السلة يمرّ من
 * الفحص ويسقط في القاعدة بـ`P2002` خامٍ (`500`) من بابين: إنشاءُ العميل، وإنشاءُ العقد باسم
 * مستأجره.
 *
 * هذا الفحصُ يقرأ السلةَ **صراحةً** (`deletedAt: { not: null }` — القيمةُ الصريحة تمرّ من
 * الامتداد كما يقرأ `trash.service.ts`) ويردّ `409` مسمّىً يدلّ على المخرج: الاستعادةُ من السلة
 * أو اسمٌ آخر. **ويُستدعى بعد فحص الأحياء لا قبله** — فالحيُّ المطابق له رسالتُه.
 */
export async function assertCustomerNotInTrash(tx: Prisma.TransactionClient, name?: string, vatNumber?: string, excludeId?: string): Promise<void> {
  if (!name && !vatNumber) return;
  const or: Prisma.CustomerWhereInput[] = [];
  if (name) or.push({ name });
  if (vatNumber) or.push({ vatNumber });
  const trashed = await tx.customer.findFirst({
    where: { OR: or, deletedAt: { not: null }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true },
  });
  if (trashed) throw new ConflictException(MSG.customer_in_trash);
}
