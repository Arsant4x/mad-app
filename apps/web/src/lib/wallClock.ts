/**
 * ساعةُ الحائط عند الجهاز — نسخةُ المتصفّح من `apps/api/src/common/wall-clock.util.ts` (`ق-١٨٥`).
 *
 * القواعد نفسها حرفاً، والاختباران يثبّتان الطرفَين على القيم نفسها:
 * - انحرافُ الجهاز هو انحرافُ المملكة (`+180`) ⇒ محليٌّ **بلا لاحقة**.
 * - غيرُه ⇒ UTC **بلاحقة `Z`** — لا زعمَ محليٍّ لا نعرفه.
 *
 * وهما الصيغتان الوحيدتان في معيار تنفيذ XML للهيئة. تُستعمل هنا لطابع `QR`
 * الأوفلاين (الوسم ٣) كي يطابق حرفاً ما سيكتبه الخادم في الفاتورة الممتثلة
 * عند عودة الاتصال من اللحظة والانحراف نفسَيهما (`ق-١٨٨`).
 */

export const KSA_UTC_OFFSET_MIN = 180;

export interface WallClock {
  date: string;
  time: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

function shifted(instant: Date, offsetMin: number): { date: string; hms: string } {
  const t = new Date(instant.getTime() + offsetMin * 60_000);
  return {
    date: `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`,
    hms: `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`,
  };
}

export function wallClockOf(instant: Date, offsetMin: number): WallClock {
  if (offsetMin === KSA_UTC_OFFSET_MIN) {
    const { date, hms } = shifted(instant, offsetMin);
    return { date, time: hms };
  }
  const { date, hms } = shifted(instant, 0);
  return { date, time: `${hms}Z` };
}

/** الطابع الزمني لوسم `QR` الثالث — `IssueDate`T`IssueTime` حرفاً. */
export function qrTimestamp(clock: WallClock): string {
  return `${clock.date}T${clock.time}`;
}
