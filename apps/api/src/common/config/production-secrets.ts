/**
 * حارس الإقلاع: **لا تُقلع بيانات افتراضية**.
 *
 * القصة التي يمنعها هذا الملف: ينسخ المشغّل `.env.production.example` إلى
 * `.env.production`، يفوته سطر أو سطران، فتُقلع المنصة **خضراء تماماً** —
 * بمفتاح توقيع جلسات منشورٍ نصّه في المستودع العام، وبمفتاح تشفير بيانات
 * بوابات الدفع مثبَّتٍ في الكود. لا رسالة، لا تحذير، فقط «API listening».
 * العطل الصامت هنا أخطر من رفض الإقلاع بمراحل.
 *
 * ثلاث قواعد في التصميم:
 *
 * ① **يجمع كل الأخطاء ثم يرمي مرة واحدة.** إصلاحُ سرٍّ ثم اكتشافُ التالي عند
 *    الإقلاع التالي دورةٌ بائسة على خادم بعيد — القائمة كاملة من أول محاولة.
 *
 * ② **لا يطبع قيمة سرٍّ قط.** الرسالة تسمّي المتغير وسبب الرفض فقط، لأن
 *    مخرجات الحاوية تُلتقط وتُحفظ.
 *
 * ③ **يسري في الإنتاج وحده.** التطوير والاختبار يعملان بقيم مريحة كما هي،
 *    وإلا تحوّل الحارس إلى عائق يومي فيُعطَّل — وحارسٌ معطَّل ليس حارساً.
 *
 * ④ **وما يحرس ميزةً تُفعَّل يسري حين تُفعَّل وحدَها** (⑬A1 · `ق-١٣٣٣`): بلا `SMTP_HOST` لا بريد، فلا
 *    مرسِلَ ولا حدَّ يُطلبان؛ **ومعه يُطلبان** — فالبريدُ لا يخرج من نطاقٍ افتراضيٍّ لا يُصادَق، ولا بحدٍّ لم يُعلَن.
 */

import { blindKeyProblem, keyringProblem } from '../crypto/field-cipher.util';
import { parseDsn } from '../error-tracking/error-event.util';
import { parseMailDailyLimit } from '../mail/mail-quota.util';
import { providerProblem } from '../../verification/providers';

/** قيم المثال والتطوير المعروفة — وجودها في الإنتاج يعني أن الملف نُسخ ولم يُملأ. */
const KNOWN_PLACEHOLDERS = [
  'change-me',
  'app_user_dev_password',
  'mad_app_dev_password',
  'dev-only-integrations-key-change-in-production',
  'example.com',
];

interface SecretRule {
  name: string;
  minLength?: number;
  /** لماذا يهمّ — يظهر في رسالة الرفض ليعرف المشغّل ما الذي يحميه. */
  why: string;
  /** فحص إضافي خاص؛ يعيد نص الخطأ أو null — والبيئةُ كاملةً لقاعدةٍ تقرأ متغيّراً ثانياً (حلقةُ المفاتيح ومعرّفُها). */
  extra?: (value: string, env: NodeJS.ProcessEnv) => string | null;
}

const REQUIRED: SecretRule[] = [
  { name: 'JWT_ACCESS_SECRET', minLength: 32, why: 'يوقّع جلسات الدخول — تسريبه أو تخمينه يعني انتحال أي مستخدم' },
  { name: 'SECRETS_ENCRYPTION_KEY', minLength: 32, why: 'يفكّ شهادات ZATCA المخزَّنة' },
  {
    name: 'INTEGRATIONS_ENC_KEY',
    minLength: 32,
    why: 'يشفّر بيانات اعتماد بوابات الدفع للتجار — بديله في الكود مفتاح ثابت منشور، فغيابه يعني تشفيراً بلا سرّ',
  },
  { name: 'S3_SECRET_KEY', minLength: 8, why: 'كلمة مرور تخزين الملفات' },
  {
    name: 'S3_PUBLIC_URL',
    why: 'العنوان الذي يصل إليه **متصفح العميل** لتنزيل المرفقات؛ العنوان الداخلي (minio:9000) لا يُحلّ خارج شبكة Docker',
    extra: (v) => (/^https?:\/\//.test(v) ? null : 'يجب أن يبدأ بـ http:// أو https://'),
  },
  {
    name: 'WEB_ORIGIN',
    why: 'يحدّ CORS ويُبنى منه رابط استعادة كلمة المرور',
    extra: (v) => (v.startsWith('https://') ? null : 'يجب أن يكون https في الإنتاج'),
  },
  {
    name: 'DATABASE_URL',
    why: 'اتصال قاعدة البيانات',
    // الدور الأعلى يتجاوز RLS بصمت — وهي الطبقة الثانية من عزل المستأجرين.
    extra: (v) => (v.includes('://app_user:') ? null : 'يجب أن يتصل بدور app_user لا بالدور الأعلى (الأعلى يتجاوز RLS بصمت)'),
  },
  /**
   * ⚖️ `ق-١٣٤٥` (الحزمة م①) — **مفاتيحُ تشفير الحقول الحسّاسة في التطبيق**، خارج القاعدة. وتُفحص بالتحليل نفسِه الذي يرمي
   * عند أوّل حقل (`field-cipher.util`)، **قبل الإقلاع لا عند أوّل موظف**؛ ومفتاحُ الاختبار (بايتٌ واحدٌ مكرَّر) يُرفض هنا.
   */
  {
    name: 'PII_ENCRYPTION_KEYS',
    why: 'حلقةُ مفاتيح تشفير هويّة الموظف وحسابه ورقم تأميناته («معرّفٌ:مفتاح» مفصولةً بفواصل) — ضياعُها ضياعُ تلك الحقول، فتُحفظ نسختُها خارج الخادم',
    extra: (v, env) => keyringProblem(v, env.PII_ENCRYPTION_KEY_ID),
  },
  {
    name: 'PII_ENCRYPTION_KEY_ID',
    why: 'معرّفُ المفتاح النشيط في الحلقة — به يُكتب الجديد، وبمعرّفه في كلِّ قيمةٍ يُقرأ القديم',
  },
  {
    name: 'PII_BLIND_INDEX_KEY',
    why: 'مفتاحُ بصمة البحث برقم الهويّة («معرّفٌ:مفتاح») — منفصلٌ عن مفاتيح التشفير',
    extra: (v, env) => blindKeyProblem(v, env.PII_ENCRYPTION_KEYS),
  },
];

/** نطاقُ عنوان المرسِل — «اسمٌ <no-reply@rikzapp.com>» أو «no-reply@rikzapp.com» — أو `null` بلا عنوان. */
function senderDomain(from: string): string | null {
  const open = from.lastIndexOf('<');
  const close = from.lastIndexOf('>');
  const addr = open >= 0 && close > open ? from.slice(open + 1, close) : from;
  const at = addr.lastIndexOf('@');
  if (at < 1) return null;
  const domain = addr.slice(at + 1).trim().toLowerCase();
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) ? domain : null;
}

/**
 * ⑬A1 (`ق-١٣٣٣`) — **ما يُطلب حين يُفعَّل البريد** (`SMTP_HOST` مضبوط):
 *
 * ⚠️ **وغيابُ `SMTP_HOST` نفسِه لا يُرفض هنا** — وهو قرارُ `ق-١١٧` («حارسُ إقلاعٍ يمنع الإقلاع بلا
 *    `SMTP_HOST`») **ولم يُبنَ بعد**: بناؤه قبل أن يُنشئ المالكُ حجرةَ البريد في وحدة التحكّم يُسقط أوّلَ إقلاعٍ
 *    بعده. يُفعَّل بأمرٍ حين تكتمل خطواتُ `DEPLOY.md` (البريد).
 */
const WHEN_MAIL: SecretRule[] = [
  {
    name: 'SMTP_FROM',
    why: 'عنوانُ المرسِل، ونطاقُه هو الذي تُفحص سجلّاتُ مصادقته (SPF · DKIM · DMARC) — وبغيابه يُرسَل من no-reply@mad-app.local: نطاقٌ لا يُصادَق فيُصنَّف البريدُ مزعجاً',
    extra: (v) => {
      const domain = senderDomain(v);
      if (!domain) return 'بلا عنوانٍ صحيح (no-reply@النطاق)';
      if (domain.endsWith('.local')) return 'نطاقٌ محلّيّ لا يُصادَق';
      return null;
    },
  },
  {
    name: 'MAIL_DAILY_LIMIT',
    why: 'حدُّ المزوّد اليوميّ كما تعرضه حجرةُ الحدود في وحدة التحكّم (max-emails-day) — به يُنذر السجلُّ عند ٨٠٪ ليُطلب الرفعُ قبل أن يُبلغ، ولا يُكتب في الشيفرة رقمٌ لم يُقرأ منها',
    extra: (v) => (parseMailDailyLimit(v) === null ? 'يجب أن يكون عدداً صحيحاً موجباً بأرقامٍ لاتينية' : null),
  },
];

/**
 * ③ (`ق-١٣٣١`) — **متتبّعُ الأخطاء حين يُضبط**: عنوانٌ يُقرأ ويُرسَل إليه عبر `https` وحدَه — فحدثُ الخطأ لا يعبر
 * الشبكةَ مكشوفاً، و`DSN` مكسورٌ لا يُقلع كأن التتبّعَ يعمل وهو صامت. وغيابُه جائز: **الخادمُ المستقلّ شرطُ تشغيل**.
 */
const WHEN_ERROR_TRACKING: SecretRule[] = [
  {
    name: 'ERROR_TRACKING_DSN',
    why: 'عنوانُ خادم تتبّع الأخطاء (GlitchTip) المستقلّ داخل المملكة — شرطُ تشغيلٍ لا يُضبط قبل وجوده',
    extra: (v) => (parseDsn(v) && v.trim().startsWith('https://') ? null : 'صيغةٌ غير صالحة — https://<المفتاح>@<الخادم>/<رقم المشروع>'),
  },
];

/**
 * ⚖️ توجيه ٢٨٧ ⑩ — **مزوّدا الرسائل والتحقّق من الهويّة حين يُضبطان**: محوّلٌ مسجَّلٌ غيرُ تجريبيّ، فالتجريبيُّ (يُرسل لا شيء، ويوافق بلا
 * تحقّق) لا يُقلع في الإنتاج — **الحاجزُ الأوّل**، والثاني عند كلِّ استعمال (`VerificationGateway`). **وغيابُهما جائز**: لم يُتعاقد بعد،
 * والمسارُ يُرفض باسمه حين يُستعمل؛ والتعاقدُ شرطُ تشغيل (القاعدة الدائمة ١٩).
 */
const WHEN_SMS: SecretRule[] = [
  { name: 'SMS_PROVIDER', why: 'مزوّدُ الرسائل الذي يحمل رمزَ التحقّق ورابطَ التوقيع إلى جوال العميل', extra: (v) => providerProblem('SMS', v) },
];
const WHEN_IDENTITY: SecretRule[] = [
  { name: 'IDENTITY_PROVIDER', why: 'مزوّدُ التحقّق من الهويّة الوطنية (نفاذ) لتوقيع النماذج', extra: (v) => providerProblem('IDENTITY', v) },
];

/**
 * **كلُّ متغيّرٍ يقرؤه هذا الحارس** — ليُفحص أنه **يبلغ الحاوية** (`boot-vars-reach-container.spec.ts`):
 * `docker-compose.prod.yml` يسرد بيئةَ `api` بالاسم، **فمتغيّرٌ يطلبه الحارسُ ولا يمرّره التركيبُ يُسقط الإقلاعَ
 * ولو ضُبط في `.env.production`** — والمشغِّلُ يرى «غير مضبوط» عن قيمةٍ كتبها بيده.
 */
export function bootGuardedVariables(): string[] {
  return [
    'NODE_ENV',
    'SMTP_HOST',
    ...REQUIRED.map((r) => r.name),
    ...WHEN_MAIL.map((r) => r.name),
    ...WHEN_ERROR_TRACKING.map((r) => r.name),
    ...WHEN_SMS.map((r) => r.name),
    ...WHEN_IDENTITY.map((r) => r.name),
  ];
}

export class ProductionSecretsError extends Error {}

/**
 * يفحص أسرار الإنتاج ويرمي `ProductionSecretsError` بقائمة كاملة عند أي خلل.
 * لا يفعل شيئاً خارج `NODE_ENV=production`.
 */
export function assertProductionSecrets(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== 'production') return;

  const problems: string[] = [];
  const rules = [
    ...REQUIRED,
    ...((env.SMTP_HOST ?? '').trim() ? WHEN_MAIL : []),
    ...((env.ERROR_TRACKING_DSN ?? '').trim() ? WHEN_ERROR_TRACKING : []),
    ...((env.SMS_PROVIDER ?? '').trim() ? WHEN_SMS : []),
    ...((env.IDENTITY_PROVIDER ?? '').trim() ? WHEN_IDENTITY : []),
  ];

  for (const rule of rules) {
    const raw = env[rule.name];
    const value = (raw ?? '').trim();

    if (!value) {
      problems.push(`${rule.name} — غير مضبوط. ${rule.why}`);
      continue;
    }
    const hit = KNOWN_PLACEHOLDERS.find((p) => value.toLowerCase().includes(p));
    if (hit) {
      problems.push(`${rule.name} — ما زال يحمل قيمة المثال («${hit}»). ${rule.why}`);
      continue;
    }
    if (rule.minLength && value.length < rule.minLength) {
      problems.push(`${rule.name} — أقصر من ${rule.minLength} محرفاً. ${rule.why}`);
      continue;
    }
    const extra = rule.extra?.(value, env);
    if (extra) problems.push(`${rule.name} — ${extra}. ${rule.why}`);
  }

  if (!problems.length) return;

  throw new ProductionSecretsError(
    [
      '',
      '════════════════════════════════════════════════════════════════',
      '  رُفض الإقلاع: أسرار الإنتاج ناقصة أو ما زالت على قيم المثال.',
      '════════════════════════════════════════════════════════════════',
      ...problems.map((p, i) => `  ${i + 1}. ${p}`),
      '',
      '  ولّد كل سرٍّ بـ:',
      `    node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`,
      '  ثم أعد التشغيل. (لم تُطبع أي قيمة أعلاه عمداً — سجلّ الحاوية يُحفظ.)',
      '════════════════════════════════════════════════════════════════',
      '',
    ].join('\n'),
  );
}
