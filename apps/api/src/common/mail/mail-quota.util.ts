/**
 * ⑬A1 (`ق-١٣٣٣`) — **حدُّ البريد اليوميّ يُعلَن في موضعه، ويُطلب رفعُه قبل أن يُبلغ** (بنصّ المالك).
 *
 * ## الحدُّ نفسُه — مقروءاً من المزوّد لا مستذكَراً
 *
 * جدولُ حدود أوراكل («Email Delivery Limits»): `max-emails-day` = «**Emails sent in last 24 hours**» —
 * **Always Free `0`** · **Trial `200`** · Pay As You Go `50,000`؛ و«Limits can't be increased without SPF and
 * DKIM set up for each sending domain». ⇒ **فالرقمُ الملزِم ما تعرضه الحجرةُ نفسُها** في وحدة التحكّم،
 * ويُعلَن في `MAIL_DAILY_LIMIT` — **ولا يُكتب في الشيفرة رقمٌ لم يُقرأ منها**.
 *
 * ## والتنبيهُ قبل البلوغ
 *
 * **عند ثمانين بالمئة من الحدّ** — هامشٌ يكفي لطلب الرفع من المزوّد قبل أن يُرفض بريدٌ واحد. **ويُطلَق مرّةً عند
 * العبور** لا مع كلِّ رسالةٍ بعده (فإنذارٌ يتكرّر مع كلِّ رسالةٍ يُقرأ ضجيجاً). **وعند البلوغ خطأٌ مسمّى** — والإرسالُ
 * يمضي، **والمزوّدُ هو الحَكَم**: رفضٌ منّا قبله يكرّر حكمَه ويُضيف موضعَ عطلٍ ثانياً.
 */

/** نسبةُ الإنذار من الحدّ — «قبل أن يُبلغ» بهامشٍ يكفي لطلب الرفع. */
export const MAIL_QUOTA_WARN_RATIO = 0.8;

export type MailQuotaCrossing = 'warn' | 'limit' | null;

/**
 * **أيَّ عتبةٍ عبرت هذه الرسالة؟** — `before` مجموعُ النافذة قبلها و`after` بعدها.
 * تُعاد العتبةُ **حين تُعبَر لا حين يُقام فوقها**: من `79` إلى `80` إنذار، ومن `80` إلى `81` لا شيء.
 * وبلا حدٍّ معلَن (`null`) لا عتبةَ — فالعدّادُ يعدّ ولا يُنذر.
 */
export function mailQuotaCrossing(before: number, after: number, limit: number | null): MailQuotaCrossing {
  if (limit === null || limit <= 0) return null;
  if (before < limit && after >= limit) return 'limit';
  const warnAt = Math.ceil(limit * MAIL_QUOTA_WARN_RATIO);
  if (before < warnAt && after >= warnAt) return 'warn';
  return null;
}

/**
 * **`MAIL_DAILY_LIMIT` عدداً صحيحاً موجباً أو لا حدّ** — لا تخمينَ لقيمةٍ لم تُقرأ: `"200"` ⟵ `200`، وما عداه
 * (`""` · `"0"` · `"-5"` · `"1e3"` · `"200 رسالة"`) ⟵ `null`. **وحارسُ الإقلاع يقرؤها بالدالّة نفسِها**، فما يرفضه
 * الإقلاعُ هو بعينه ما لا يُنذر عنه العدّاد.
 */
export function parseMailDailyLimit(raw: string | undefined): number | null {
  const text = (raw ?? '').trim();
  if (!/^[0-9]+$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** أوّلُ الساعة بتوقيتٍ عالميّ — مفتاحُ الدلو. */
export function hourBucket(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), at.getUTCHours()));
}
