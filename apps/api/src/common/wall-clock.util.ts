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

/**
 * **منطقةُ جداول المهامّ** (`ق-١٢٧٩` · ط — `domain-scan/24` C1).
 *
 * حاويةُ الخادم على `UTC`، وجداولُ `@Cron` بلا منطقةٍ تُقرأ بمنطقة العملية — فـ«الكنسُ يوميّ
 * `0 1`» كان يقع `04:00` بتوقيت الرياض، **والوثائقُ تسمّيه بالساعة**. والعطلُ توثيقيٌّ لا ماليّ
 * (كلُّها ليليةٌ في الحالتين)، **والعلاجُ أن يصدق النصّ**: يومُ المنشأة يومُ الرياض (`ق-١١٩٠`)،
 * فجداولُها بيومه.
 *
 * ⚠️ **ويُستثنى ما لا يعنيه اليوم**: الصندوقُ الصادر يعمل كلَّ دقيقة — المنطقةُ لا تغيّره.
 */
export const SCHEDULE_TIME_ZONE = 'Asia/Riyadh';

/** How far a time sent by a device may run ahead of the server clock, for a device clock that is a little fast. */
export const DEVICE_CLOCK_TOLERANCE_MIN = 5;

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
 * ⚖️ **يومُ الآن بإزاحةٍ معلَنة — لا بمنطقة العملية** (`ق-١١٩٠`).
 *
 * ## العطل الذي تعالجه
 *
 * كان يومُ الآن يُبنى في أربعةَ عشرَ موضعاً بـ`setHours(0, 0, 0, 0)` و`new Date(y, m, d)`
 * ودوالّ اليوم المحلّية — **فمنطقةُ العملية هي التي تقرّر متى تصير الفاتورةُ «متأخّرة»**:
 * على خادمٍ بتوقيت الرياض عند `21:00 UTC`، وعلى خادمٍ غربَ غرينتش بعد منتصف الليل بساعات.
 * **والحكمُ يقرؤه التاجر ويبني عليه** — فيُصلَح بالدالّة نفسِها التي تحسب يومَ الكاشير
 * (`localDateOf`)، والحارسُ `common/local-day.spec.ts` يُدين موضعاً جديداً لا يُعلن.
 *
 * ## القاعدة
 *
 * الثلاثُ تقرأ يومَ اللحظة **بالإزاحة المُمرَّرة**، وتُعيد حدودَه على هيئة `@db.Date` (منتصفُ
 * ليل `UTC` — الشكلُ الذي تُحلَّل إليه سلسلةُ `'2026-08-08'`) **فتُقارَن بالأعمدة المخزَّنة
 * مباشرةً** بلا أن تدخل منطقةُ العملية من الباب الخلفي.
 *
 * ⚠️ **حدٌّ معلَن**: بلا إزاحةٍ مُمرَّرة يُقرأ يومُ `UTC` (`offsetMin = 0`) — فتاجرُ الرياض يرى
 * فاتورتَه تتأخّر ثلاثَ ساعاتٍ بعد منتصف ليله. **والإزاحةُ من الجهاز** (كما `ringOffsetMin` في
 * الكاشير) **بابٌ لا يُفتح اليوم** (قرار المالك) — الافتراضيُّ هنا يُعلن الحدَّ ولا يخفيه.
 */
export function dayStartOf(instant: Date, offsetMin = 0): Date {
  return new Date(`${localDateOf(instant, offsetMin)}T00:00:00.000Z`);
}

/**
 * Offset of an IANA time zone from UTC at an instant, in minutes, read from the zone itself so the
 * answer follows the zone's own rules (daylight saving included) rather than the server's zone.
 */
export function zoneOffsetMin(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'));
  return Math.round((wall - (instant.getTime() - instant.getUTCMilliseconds())) / 60_000);
}

/** آخرُ لحظةٍ في يوم اللحظة المعلَن — لحدودِ «حتى تاريخ كذا» على أعمدةٍ تحمل وقتاً. */
export function dayEndOf(instant: Date, offsetMin = 0): Date {
  return new Date(`${localDateOf(instant, offsetMin)}T23:59:59.999Z`);
}

/** سنةُ يوم اللحظة المعلَن — لا `getFullYear()` بمنطقة العملية. */
export function localYearOf(instant: Date, offsetMin = 0): number {
  return Number(localDateOf(instant, offsetMin).slice(0, 4));
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
