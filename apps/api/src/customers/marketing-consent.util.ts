/**
 * **بوّابةُ الإرسال التسويقيّ — موضعٌ واحد يقرّر** (`ق-١٣٠٣` · ك/⑰A1).
 *
 * ## النصُّ الذي تُنفِذه
 *
 * **النظام م٢٥** — لا تُستعمل وسائلُ الاتصال الشخصية لإرسال موادَّ دعائيةٍ أو توعوية إلا
 * **بموافقة المتلقّي المستهدف**، ومع **آليةٍ واضحة** تُمكّنه من إيقافها. **وم٥/٢** — له
 * الرجوعُ **في أيّ وقت**. **واللائحةُ م٢٨** — لكلِّ قناةٍ خيارُها، والإثباتُ يُحفظ، والتوقّفُ
 * **فورَ الطلب وبلا مقابل**.
 *
 * ## ولماذا دالّةٌ واحدة لا فحصٌ عند كلّ مُرسِل
 *
 * **قرارُ «أيجوز أن أرسل؟» لا يُعاد كتابتُه**: مُرسِلٌ يقارن الحقولَ بيده يخطئ في حالةٍ
 * واحدة — رجوعٌ بعد موافقة، أو قناةٌ غيرُ التي وافق عليها — **والخطأ رسالةٌ خرجت ولا
 * تُستردّ**. وحارسٌ نصّيّ يمنع أيَّ مقارنةٍ خارج هذا الملفّ.
 *
 * ## ⚠️ وحدٌّ معلَنٌ لا يُتجاوَز صمتاً — بوّابةٌ على بابٍ لا يُطرَق بعد (`§8.7`/الوجه ١٤)
 *
 * **لا مسارَ إرسالٍ تسويقيّ في المنتج اليوم** (مقيس: `NotificationsService` داخل المنصّة
 * وحدَها بنصّ توثيقه، و`MailService` له **مستدعٍ واحد** هو استعادةُ كلمة المرور). فهذه
 * البوّابةُ **تُبنى قبل البابِ عمداً** — «الموافقةُ تسبق أوّلَ رسالة» — **ولا يُدّعى أنها
 * تحرس إرسالاً قائماً**. ويبقى على أوّل قناةٍ تُبنى: **اسمُ المرسِل في الرسالة** ·
 * **رابطُ الإيقاف فيها** · **التوقّفُ فور الطلب** · **وبلا مقابل** (م٢٨/٣).
 *
 * ## ⚠️ و«التعاملُ المسبق» لا يُستنبَط من وجود صفّ (م٢٨/١)
 *
 * اللائحةُ تشترط الموافقةَ **«في حال عدم وجود تعاملٍ مسبق»** — أي أن للتعامل المسبق
 * حكماً آخر. **ولا يُقرأ وجودُ بطاقةِ عميلٍ تعاملاً مسبقاً**: البطاقةُ تُنشأ بالكتابة لا
 * بالبيع، **واستنباطُ حكمٍ نظاميّ من وجود صفٍّ هو `§8.7`/الوجه العاشر بعينه** — آليّةٌ
 * تقرأ الاسمَ لا المعنى. فالبوّابةُ تعرف **الموافقةَ وحدَها**، والتعاملُ المسبق **بندٌ
 * معلَن** يُبنى بإعلانٍ صريح من التاجر حين تُبنى القناة، لا بتخمينٍ اليوم.
 */

/** القنواتُ الشخصية التي تحتاج موافقةً — **كتالوجٌ واحد** تُقاس عليه البوّابةُ وقيدُ القاعدة. */
export const MARKETING_CHANNELS = ['SMS', 'EMAIL', 'WHATSAPP'] as const;
export type MarketingChannel = (typeof MARKETING_CHANNELS)[number];

/**
 * **كيف وصلت الموافقة** — والإثباتُ يحتاج «أين قالها» لا «أنه قالها» (م٢٨/٢: توثيقٌ
 * بوسيلةٍ للتحقّق مستقبلاً). قائمةٌ مقيَّدة لا نصٌّ حرّ: نصٌّ حرٌّ يُكتب «موافق» فلا يُثبت شيئاً.
 */
export const CONSENT_SOURCES = ['IN_PERSON', 'PHONE', 'WEB_FORM', 'WRITTEN', 'IMPORTED'] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

export function isMarketingChannel(value: string): value is MarketingChannel {
  return (MARKETING_CHANNELS as readonly string[]).includes(value);
}

export function isConsentSource(value: string): value is ConsentSource {
  return (CONSENT_SOURCES as readonly string[]).includes(value);
}

/** الحدُّ الأدنى مما تحتاجه البوّابة من الصفّ — فلا تتعلّق بنموذج Prisma. */
export interface ConsentEvent {
  channel: string;
  granted: boolean;
  at: Date;
  createdAt: Date;
}

export type MarketingVerdict =
  | { allowed: true; since: Date }
  | { allowed: false; reason: 'NEVER_GRANTED' | 'WITHDRAWN'; at?: Date };

/**
 * **آخرُ واقعةٍ في القناة هي الحكم** — بـ`at` ثم `createdAt` عند التساوي.
 *
 * ⚠️ **والتساوي يقع فعلاً**: تاجرٌ يسجّل الموافقةَ والرجوعَ في اليوم نفسِه بلا وقت، فيتساوى
 * `at`؛ **والفاصلُ حينئذٍ ترتيبُ التسجيل** — وهو الأقربُ إلى ما وقع.
 */
export function latestEvent(events: readonly ConsentEvent[], channel: string): ConsentEvent | null {
  let best: ConsentEvent | null = null;
  for (const e of events) {
    if (e.channel !== channel) continue;
    if (!best) {
      best = e;
      continue;
    }
    const byAt = e.at.getTime() - best.at.getTime();
    if (byAt > 0 || (byAt === 0 && e.createdAt.getTime() >= best.createdAt.getTime())) best = e;
  }
  return best;
}

/**
 * 🔴 **الجوابُ الوحيد على «أيجوز أن أرسل؟»** — ولا يُعاد حسابُه في مكانٍ آخر.
 *
 * **ولا واقعةَ = لا** (`NEVER_GRANTED`): الصمتُ ليس موافقة، وهو نصُّ م٢٥.
 */
export function mayReceiveMarketing(events: readonly ConsentEvent[], channel: MarketingChannel): MarketingVerdict {
  const last = latestEvent(events, channel);
  if (!last) return { allowed: false, reason: 'NEVER_GRANTED' };
  return last.granted ? { allowed: true, since: last.at } : { allowed: false, reason: 'WITHDRAWN', at: last.at };
}

/** حالةُ العميل في **كلِّ** قناةٍ من الكتالوج — فقناةٌ لم تُذكر تظهر «لا» صراحةً لا فراغاً. */
export function marketingState(events: readonly ConsentEvent[]): Record<MarketingChannel, MarketingVerdict> {
  const out = {} as Record<MarketingChannel, MarketingVerdict>;
  for (const channel of MARKETING_CHANNELS) out[channel] = mayReceiveMarketing(events, channel);
  return out;
}
