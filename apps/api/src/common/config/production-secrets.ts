/**
 * Boot guard: production does not start on default or published values.
 *
 * The failure it prevents: the operator copies an example env file to .env.production,
 * misses a line or two, and the platform boots green with a session signing key whose text
 * is in the repository and an encryption key fixed in the code. No message, no warning, only
 * "API listening". A silent fault here is far worse than a refused boot.
 *
 * Design rules:
 * 1. Collect every problem, then throw once. Fixing one secret and finding the next on the
 *    next boot of a remote server is a miserable loop; the whole list comes at the first try.
 * 2. Never print a secret value. The message names the variable and the reason only, because
 *    container output is captured and kept.
 * 3. Production only. Development and tests run on convenient values; a guard that gets in the
 *    way every day gets switched off, and a switched off guard guards nothing.
 * 4. What guards an optional feature applies only when that feature is switched on: without
 *    SMTP_HOST there is no mail, so no sender and no limit are required; with it, both are.
 */

import { blindKeyProblem, keyringProblem } from '../crypto/field-cipher.util';
import { parseDsn } from '../error-tracking/error-event.util';
import { parseMailDailyLimit } from '../mail/mail-quota.util';
import { providerProblem } from '../../verification/providers';
import { isPublishedTestValue } from './published-test-values';

/** Known example and development values: seeing one in production means the file was copied and not filled. */
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
  /** Why it matters, shown in the refusal so the operator knows what it protects. */
  why: string;
  /** An extra check; returns the problem text or null. Gets the whole env for rules that read a second variable. */
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
    // The owner role bypasses row level security silently, and that is the second layer of tenant isolation.
    extra: (v) => (v.includes('://app_user:') ? null : 'يجب أن يتصل بدور app_user لا بالدور الأعلى (الأعلى يتجاوز RLS بصمت)'),
  },
  // Keys for the sensitive field encryption done in the application, outside the database. They are
  // parsed with the same function that throws on the first field (field-cipher.util), before boot
  // rather than at the first employee; the test key (one repeated byte) is refused here.
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

/** Domain of the sender address ("Name <no-reply@rikzapp.com>" or "no-reply@rikzapp.com"), or null without one. */
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
 * What is required once mail is switched on (SMTP_HOST set).
 *
 * A missing SMTP_HOST itself is not refused here. A boot guard that refuses to start without it
 * was decided and is not built yet: building it before the mail zone exists in the provider's
 * console would fail the first boot after it. It is switched on when the mail steps in DEPLOY.md
 * are done.
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
 * The error tracker, once set: an address that parses and is reached over https only, so an error
 * event never crosses the network in the clear and a broken DSN does not boot as if tracking worked.
 * Leaving it unset is allowed: the separate tracking server is a condition of operation.
 */
const WHEN_ERROR_TRACKING: SecretRule[] = [
  {
    name: 'ERROR_TRACKING_DSN',
    why: 'عنوانُ خادم تتبّع الأخطاء (GlitchTip) المستقلّ داخل المملكة — شرطُ تشغيلٍ لا يُضبط قبل وجوده',
    extra: (v) => (parseDsn(v) && v.trim().startsWith('https://') ? null : 'صيغةٌ غير صالحة — https://<المفتاح>@<الخادم>/<رقم المشروع>'),
  },
];

/**
 * The message and identity providers, once set: a registered adapter that is not a test one, since a
 * test adapter (sends nothing, approves without checking) must not boot in production. This is the
 * first barrier; the second is at every use (VerificationGateway). Leaving them unset is allowed: no
 * contract yet, and the route is refused by name when used.
 */
const WHEN_SMS: SecretRule[] = [
  { name: 'SMS_PROVIDER', why: 'مزوّدُ الرسائل الذي يحمل رمزَ التحقّق ورابطَ التوقيع إلى جوال العميل', extra: (v) => providerProblem('SMS', v) },
];
const WHEN_IDENTITY: SecretRule[] = [
  { name: 'IDENTITY_PROVIDER', why: 'مزوّدُ التحقّق من الهويّة الوطنية (نفاذ) لتوقيع النماذج', extra: (v) => providerProblem('IDENTITY', v) },
];
const WHEN_AUTHORITY: SecretRule[] = [
  { name: 'AUTHORITY_PROVIDER', why: 'مزوّدُ التحقّق من سند ممثّل الشخص الاعتباريّ (واثق · ناجز)', extra: (v) => providerProblem('AUTHORITY', v) },
];

/**
 * Every variable this guard reads, so boot-vars-reach-container.spec.ts can check it reaches the
 * container: docker-compose.prod.yml lists the api environment by name, and a variable the guard
 * needs that the compose file does not pass fails the boot even when set in .env.production.
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
    ...WHEN_AUTHORITY.map((r) => r.name),
  ];
}

/**
 * A value that must never reach production: an example placeholder, or a secret published in the
 * repository's test and example files. Returns the problem text, or null.
 */
export function knownValueProblem(value: string): string | null {
  const hit = KNOWN_PLACEHOLDERS.find((p) => value.toLowerCase().includes(p));
  if (hit) return `ما زال يحمل قيمة المثال («${hit}»)`;
  if (isPublishedTestValue(value)) return 'يحمل قيمةً منشورةً في ملفّات الاختبار والأمثلة في المستودع';
  return null;
}

export class ProductionSecretsError extends Error {}

/**
 * Checks the production secrets and throws ProductionSecretsError with the full list on any problem.
 * Does nothing outside NODE_ENV=production.
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
    ...((env.AUTHORITY_PROVIDER ?? '').trim() ? WHEN_AUTHORITY : []),
  ];

  for (const rule of rules) {
    const raw = env[rule.name];
    const value = (raw ?? '').trim();

    if (!value) {
      problems.push(`${rule.name} — غير مضبوط. ${rule.why}`);
      continue;
    }
    const known = knownValueProblem(value);
    if (known) {
      problems.push(`${rule.name} — ${known}. ${rule.why}`);
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
