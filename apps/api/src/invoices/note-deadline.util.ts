/**
 * مهلة إصدار الإشعار — **خمسة عشر يوماً من نهاية شهر الواقعة**.
 *
 * المصدر: المادة ٥٤ من اللائحة التنفيذية لنظام ضريبة القيمة المضافة بعد تعديل
 * القرار ٠١-٠٦-٢٤ (دليل الهيئة، أبريل ٢٠٢٥ ص٤٢). والواقعة هي **قبول المورّد
 * للإعادة** لا كتابة المستند (م٤٠(١)(د) و٤٠(٣)).
 *
 * **والقرار: تنبيهٌ لا حجز** (المالك 2026-09-04). الإشعار **مستندٌ يوجبه النظام**،
 * فحجبُه بعد المهلة **يزيد المخالفة لا يمنعها** — والتاجر المتأخّر ما زال ملزَماً
 * بإصداره. فالمهلة تُقاس وتُعرَض ويُنبَّه عليها، ولا تمنع.
 *
 * والحساب كلّه **بتوقيت UTC**: تواريخ المستندات تصل مُحلَّلةً من `YYYY-MM-DD` وهي
 * UTC بالمواصفة، وقراءتها محليّاً تنقل الشهر عند الانزياح — وهو العطل الذي
 * أُصلح في `assertPeriodOpen` ولا يُعاد هنا.
 */

/** عدد الأيام بعد نهاية شهر الواقعة. */
export const NOTE_DEADLINE_DAYS = 15;

/** آخر يومٍ يجوز فيه إصدار الإشعار عن واقعةٍ في هذا التاريخ. */
export function noteDeadline(eventDate: Date): Date {
  // اليوم صفر من الشهر التالي = آخر يومٍ في شهر الواقعة، ثم تُضاف المهلة.
  const endOfMonth = Date.UTC(eventDate.getUTCFullYear(), eventDate.getUTCMonth() + 1, 0);
  return new Date(endOfMonth + NOTE_DEADLINE_DAYS * 86_400_000);
}

export type DeadlineStatus = 'LATE' | 'DUE_SOON' | 'OK';

export interface DeadlineView {
  eventDate: Date;
  deadline: Date;
  /** أيامٌ باقية إلى المهلة — سالبةٌ حين تُجاوَز. */
  daysLeft: number;
  status: DeadlineStatus;
}

/**
 * حالة المهلة لإشعارٍ صدر (أو سيصدر) في `issuedOn` عن واقعةٍ في `eventDate`.
 *
 * `DUE_SOON` نافذةٌ تُنبَّه قبل الانقضاء — **فما لا يُرى لا يُصدَر**.
 */
export function deadlineView(eventDate: Date, issuedOn: Date, soonDays = 5): DeadlineView {
  const deadline = noteDeadline(eventDate);
  const daysLeft = Math.floor((deadline.getTime() - issuedOn.getTime()) / 86_400_000);
  const status: DeadlineStatus = daysLeft < 0 ? 'LATE' : daysLeft <= soonDays ? 'DUE_SOON' : 'OK';
  return { eventDate, deadline, daysLeft, status };
}
