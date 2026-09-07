// (سطرُ مجسٍّ مؤقّت — يمسّ شيفرةً على دفعةٍ لاحقة، ويُحذف مع فرع المجسّ.)
/**
 * ساعةُ الحائط عند الجهاز — **من الجهاز لا من الخادم ولا من منطقةٍ يُتّفق عليها** (`ق-١٨٥`).
 *
 * ## العطل الذي تعالجه
 *
 * `issueDate @db.Date` يحمل اليومَ وحده، فكان `IssueTime` في مستند الهيئة
 * **منتصف الليل دائماً**؛ وتاريخُ الكاشير كان يُشتقّ من **تاريخ UTC** — فبيعٌ
 * في الواحدة صباحاً بتوقيت الرياض يُؤرَّخ **أمس**. ومعيار الهيئة (معيار تنفيذ
 * XML v1.2): «الوقت **بلا معلومات منطقة** إن كان محلياً في المملكة، أو UTC
 * **بلاحقة `Z`**»؛ والتاريخ `YYYY-MM-DD` بلا منطقة. فما كنّا نُصدره — قيمةُ UTC
 * بصيغة المحلي — **يخالف النصّ لا العادة**.
 *
 * ## المصدر
 *
 * الجهاز يرسل **اللحظة** (`ringAt`، ISO بـ`Z`) **وانحرافَه عن UTC بالدقائق**
 * (`ringOffsetMin` = `-getTimezoneOffset()`). فيُحسب يومُ التاجر ووقتُه من
 * الجهاز نفسه — على القاعدة التي حسمت سنةَ رقم المستند (`document-year.util.ts`):
 * «المصدر الصحيح تاريخُ المستند نفسه، لا منطقةٌ يُتّفق عليها»؛ فضبطُ `TZ`
 * على الخادم يُصلح تاجراً ويكسر آخر.
 *
 * ## صيغتان تُجيزهما الهيئة — ولا ثالثة
 *
 * - انحرافُ الجهاز **هو انحرافُ المملكة** (`+180`): يُصدَر **محلياً بلا لاحقة** —
 *   يومُ التاجر ووقتُه كما يقرؤهما على الإيصال، والمستندُ والورقُ والدفترُ
 *   على يومٍ واحد (وهذا ما يهمّ عند حدّ الفترة الضريبية آخرَ الشهر).
 * - وإلا: **UTC بلاحقة `Z`** — لا نزعم محلياً لا نعرفه. التاريخُ عندها تاريخ UTC.
 *
 * ولا يُفترَض الانحرافُ حين يغيب: مستندٌ بلا لحظةٍ معلومة (ما قبل هذا الحقل، أو
 * فاتورةٌ مؤرَّخةٌ بيدٍ بلا وقت) يُصدَر بيومه المخزَّن **و`00:00:00`** — كما كان
 * يُصدَر، **بحدٍّ معلَن** لا بتخمين.
 */

/** انحراف المملكة عن UTC بالدقائق — لا توقيتٌ صيفي، فهو ثابت. */
export const KSA_UTC_OFFSET_MIN = 180;

export interface WallClock {
  /** `YYYY-MM-DD` كما تقرؤه الهيئة (`cbc:IssueDate`). */
  date: string;
  /** `HH:mm:ss` محلياً بلا لاحقة، أو `HH:mm:ssZ` إن كان UTC (`cbc:IssueTime`). */
  time: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** أجزاء لحظةٍ بعد إزاحتها بانحرافٍ معلوم — تُقرأ بدوالّ UTC كي لا تدخل منطقةُ العملية من الباب الخلفي. */
function shifted(instant: Date, offsetMin: number): { date: string; hms: string } {
  const t = new Date(instant.getTime() + offsetMin * 60_000);
  return {
    date: `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`,
    hms: `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}:${pad(t.getUTCSeconds())}`,
  };
}

/** يومُ الجهاز (`YYYY-MM-DD`) للحظةٍ بانحرافٍ معلوم — لتاريخ الفاتورة المخزَّن. */
export function localDateOf(instant: Date, offsetMin: number): string {
  return shifted(instant, offsetMin).date;
}

/**
 * ساعةُ الحائط التي تُكتب في مستند الهيئة و`QR`.
 *
 * - `offsetMin === KSA_UTC_OFFSET_MIN` → محليٌّ بلا لاحقة.
 * - غير ذلك → UTC بلاحقة `Z`.
 */
export function wallClockOf(instant: Date, offsetMin: number): WallClock {
  if (offsetMin === KSA_UTC_OFFSET_MIN) {
    const { date, hms } = shifted(instant, offsetMin);
    return { date, time: hms };
  }
  const { date, hms } = shifted(instant, 0);
  return { date, time: `${hms}Z` };
}

/**
 * ساعةُ الحائط لمستندٍ مخزَّن: من لحظته وانحرافه إن وُجدا، وإلا يومُه المخزَّن
 * (عمود `@db.Date` يُقرأ UTC حصراً — كما في `document-year.util.ts`) و`00:00:00`.
 */
export function issuedWallClock(doc: { issueDate: Date; issuedAt: Date | null; issuedOffsetMin: number | null }): WallClock {
  if (doc.issuedAt && doc.issuedOffsetMin !== null) return wallClockOf(doc.issuedAt, doc.issuedOffsetMin);
  return { date: doc.issueDate.toISOString().slice(0, 10), time: '00:00:00' };
}

/** الطابع الزمني لوسم `QR` الثالث — **نفس** يوم ووقت المستند، حرفاً بحرف (`YYYY-MM-DDTHH:mm:ss[Z]`). */
export function qrTimestamp(clock: WallClock): string {
  return `${clock.date}T${clock.time}`;
}
