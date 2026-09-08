import { TenantPrismaService } from '../src/common/tenant/tenant-prisma.service';

/**
 * **«لم يتحرّك شيءٌ بين هاتين الوثيقتين» — تُقاس لا تُفترض** (`ق-٢٩٢`).
 *
 * كان أربعةُ توكيداتٍ تقول `b.icv === a.icv + 1`. **ودعواها**: «العدّادُ تقدّم
 * ولم يُدخل أحدٌ نفسَه بينهما». **وسطحُها**: فرقٌ عدديّ مطلق — **يسقط إن أخذ
 * أيُّ مُرسِلٍ آخر رقماً بينهما**، وهو ما فعله `OutboxDispatcherJob` كل دقيقة
 * حتى عُطِّل تحت الاختبار.
 *
 * ⚠️ **ولا تُقاس بالتسلسل المتّصل للوحدة كلِّها** — جرّبتُها فكانت فخّاً:
 * `zatca-phase2` **يجرّد `zatcaIcv` من فواتيره في `afterAll`**، فتبقى في
 * السلسلة **ثقوبٌ مشروعة** تُسقط أيَّ مجموعةٍ تلي. **فالدعوى محلّيةٌ فتُقاس
 * محلّياً**: لا وثيقةَ تحمل رقماً **بين** الرقمين.
 *
 * وهو **أقوى** من `+1` لا أضعف: يمسك من دسّ نفسَه بينهما **ويصمد أمام ثقبٍ
 * مشروعٍ في مكانٍ آخر من السلسلة**.
 */
export async function expectNothingBetweenIcv(
  tenantPrisma: TenantPrismaService,
  companyId: string,
  lower: number,
  upper: number,
): Promise<void> {
  expect(upper).toBeGreaterThan(lower);

  const between = await tenantPrisma.runInTenantContext(companyId, (tx) =>
    tx.invoice.findMany({
      where: { zatcaIcv: { gt: lower, lt: upper } },
      select: { id: true, no: true, zatcaIcv: true },
      orderBy: { zatcaIcv: 'asc' },
    }),
  );

  expect(between).toEqual([]);
}
