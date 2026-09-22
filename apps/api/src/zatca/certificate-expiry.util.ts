import { X509Certificate } from 'node:crypto';

/**
 * نهايةُ صلاحية شهادة الإنتاج — **تُقرأ من الشهادة نفسِها** (`ق-١٢٧٩` · ز/⑤A1).
 *
 * **العطل الذي تغلقه**: الشهادةُ تنتهي (سنةً عادةً)، و**أوّلُ علامةٍ اليوم رفضُ كلِّ فواتير
 * اليوم** — لا حقلَ ولا تنبيه (`zatca-onboarding.service.ts:454–462` يقرّ بذلك تعليقاً).
 *
 * **ولا يُخمَّن التاريخ**: يُقرأ من `notAfter` في `X.509` — ما تقوله الهيئةُ نفسُها في الشهادة
 * التي أصدرتها، لا سنةٌ تُضاف إلى تاريخ الإصدار.
 *
 * والشهادةُ تصل من الهيئة **مُرمَّزةً `base64`** (نصُّ `binarySecurityToken`)، وقد تكون داخلها
 * صيغةُ `PEM` كاملة أو جسمُ `DER` وحدَه — فالدالّةُ تقبل الشكلين ولا تفترض أحدَهما.
 */
export function certificateNotAfter(certificateBase64: string): Date | null {
  const raw = certificateBase64.trim();
  if (!raw) return null;
  const candidates: Buffer[] = [];
  // ① نصٌّ `PEM` مباشرةً (قد يصل هكذا من ملفٍّ أو من نسخٍ يدويّ).
  if (raw.includes('BEGIN CERTIFICATE')) candidates.push(Buffer.from(raw, 'utf8'));
  else {
    const body = Buffer.from(raw, 'base64');
    // ② `base64` لنصٍّ `PEM` — فكُّه يُظهر الترويسة.
    if (body.toString('utf8').includes('BEGIN CERTIFICATE')) candidates.push(body);
    // ③ `base64` لجسم `DER` — يُلفّ بترويسة `PEM` ليقرأه `X509Certificate`.
    //
    // 🔴 **والتقطيعُ بـ`match` لا بـ`replace`**: `replace(/(.{64})/g, '$1\n')` يُلحق سطراً جديداً
    // **بعد آخر مقطعٍ أيضاً** حين يكون الطولُ من مضاعفات ٦٤ — فيلتقي بـ`\n` الذي قبل `END`
    // فيصير **سطراً فارغاً وسط الجسد**، وقارئُ `PEM` يقطع عنده فيُردّ `wrong tag`.
    // قِيس (٢٥ شهادةً مولَّدة): **٤ سقوطٍ** — كلُّها بطولٍ `512`. عطلٌ يظهر في شهادةٍ من ستٍّ
    // تقريباً، أي أن المراقبةَ كانت ستصمت عن تاجرٍ بلا سببٍ ظاهر.
    const pemBody = (raw.replace(/\s+/g, '').match(/.{1,64}/g) ?? []).join('\n');
    candidates.push(Buffer.from(`-----BEGIN CERTIFICATE-----\n${pemBody}\n-----END CERTIFICATE-----\n`, 'utf8'));
  }
  for (const candidate of candidates) {
    try {
      const parsed = new X509Certificate(candidate).validTo;
      const at = new Date(parsed);
      if (!Number.isNaN(at.getTime())) return at;
    } catch {
      // الشكلُ التالي — وشهادةٌ لا تُقرأ بأيِّ شكلٍ تعود `null` ولا تُسقط المسار:
      // **مراقبةٌ لا تُعطّل الإصدار** (والغيابُ يُعلَن في الحالة، لا يُفترض «سليمة»).
    }
  }
  return null;
}

/** نافذةُ التنبيه — الهيئةُ تُجدّد قبل الانتهاء، وثلاثون يوماً ما أقرّه الدَّينُ المكتوب في الخدمة. */
export const CERT_EXPIRY_WARN_DAYS = 30;

/** كم يوماً بقي — بالأيام التقويمية، سالباً إن انتهت. */
export function daysUntil(notAfter: Date, now: Date): number {
  return Math.ceil((notAfter.getTime() - now.getTime()) / 86400000);
}
