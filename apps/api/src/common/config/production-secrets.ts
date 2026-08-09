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
 */

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
  /** فحص إضافي خاص؛ يعيد نص الخطأ أو null. */
  extra?: (value: string) => string | null;
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
];

export class ProductionSecretsError extends Error {}

/**
 * يفحص أسرار الإنتاج ويرمي `ProductionSecretsError` بقائمة كاملة عند أي خلل.
 * لا يفعل شيئاً خارج `NODE_ENV=production`.
 */
export function assertProductionSecrets(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== 'production') return;

  const problems: string[] = [];

  for (const rule of REQUIRED) {
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
    const extra = rule.extra?.(value);
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
