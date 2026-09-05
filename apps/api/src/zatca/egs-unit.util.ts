import type { Prisma } from '@prisma/client';

/**
 * ⭐ **الوحدة الافتراضية (`EGS`) — الويب الإداري** (`ق-١٦٩` · `ق-١٧١`).
 *
 * ## لماذا تُنشأ عند الحاجة لا في الهجرة وحدها
 *
 * الهجرة عبّأت كل منشأةٍ **لها صفُّ شهادة يومَها**. ومنشأةٌ تبدأ ربطها بعد ذلك
 * تحتاج وحدتها عند أول خطوة — **لا شرطاً يُتذكَّر في مسارَين**. فالدالة واحدة
 * ويستدعيها الربطُ والإرسالُ كلاهما، وهي **عديمة الأثر عند التكرار**: الفهرس
 * الجزئي `egs_units_one_default_per_company` يمنع الثانية بالقيد لا بالفحص.
 *
 * ## والتسلسلي هو الذي في طلب الشهادة نفسه
 *
 * `1-mad-app|2-web|3-<companyId>` — الصيغة التي كتبها `generateCsr` منذ البداية.
 * **فالشهادة الصادرة تبقى صالحة بلا إعادة ربط**، لأن `SN` فيها هو هذا النصّ.
 * **ومصدرٌ واحد لهذه الصيغة**: مسار الربط يقرأها من هنا لا يكتبها ثانيةً —
 * وإلا افترق التسلسليّ في الشهادة عن التسلسليّ في الجدول **بصمت**.
 */
export const SOLUTION_NAME = 'mad-app';

/** تسلسليُّ الوحدة الافتراضية — **الصيغة نفسها التي في طلب الشهادة**. */
export function defaultUnitSerial(companyId: string): string {
  return `1-${SOLUTION_NAME}|2-web|3-${companyId}`;
}

/**
 * الوحدة الافتراضية لهذه المنشأة — تُقرأ إن وُجدت، وتُنشأ إن لم توجد.
 *
 * ⚠️ يُستدعى **داخل سياق المستأجر**: `egs_units` تحت `FORCE RLS`، وقراءةٌ خارج
 * السياق **تعيد صفر صفوفٍ بلا خطأ** (فخّ `ق-١٣٠`) فتُنشئ ثانيةً — ويردّها الفهرس
 * الجزئي بـ`P2002` بدل أن يمرّ التكرار.
 */
export async function ensureDefaultUnit(tx: Prisma.TransactionClient, companyId: string): Promise<{ id: string; serial: string }> {
  const existing = await tx.egsUnit.findFirst({ where: { companyId, kind: 'DEFAULT_WEB' }, select: { id: true, serial: true } });
  if (existing) return existing;
  return tx.egsUnit.create({
    // `companyId` صريح — مقبولٌ تحت امتداد المستأجر، ولازمٌ تحت عميل البذرة.
    data: { companyId, serial: defaultUnitSerial(companyId), kind: 'DEFAULT_WEB', label: 'الويب الإداري' } as unknown as Prisma.EgsUnitCreateInput,
    select: { id: true, serial: true },
  });
}
