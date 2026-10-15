import { assertProductionSecrets, ProductionSecretsError } from './production-secrets';

/**
 * الحارس الذي يمنع «الإقلاع الأخضر بأسرار المثال».
 *
 * يُختبر بالسقوط لا بالنجاح: لكل سبب رفضٍ حالتُه، لأن حارساً يمرّ دائماً
 * أسوأ من غيابه — يمنح ثقة بلا تغطية.
 */
/** مفتاحٌ من ٣٢ بايتاً غيرُ متكرّر — كما يولّده `openssl rand -base64 32` لا كمفاتيح الاختبار (بايتٌ واحدٌ مكرَّر). */
const key32 = (seed: number) => Buffer.from(Array.from({ length: 32 }, (_, i) => (seed * 31 + i * 7) % 256)).toString('base64');

const VALID = {
  NODE_ENV: 'production',
  PII_ENCRYPTION_KEYS: `k2026a:${key32(1)}`,
  PII_ENCRYPTION_KEY_ID: 'k2026a',
  PII_BLIND_INDEX_KEY: `b2026a:${key32(2)}`,
  JWT_ACCESS_SECRET: 'a'.repeat(64),
  SECRETS_ENCRYPTION_KEY: 'b'.repeat(64),
  INTEGRATIONS_ENC_KEY: 'c'.repeat(64),
  S3_SECRET_KEY: 'd'.repeat(32),
  S3_PUBLIC_URL: 'https://files.mad-app.sa',
  WEB_ORIGIN: 'https://app.mad-app.sa',
  DATABASE_URL: 'postgresql://app_user:s3cret@postgres:5432/mad_app?schema=public',
  MFA_REQUIRED_FOR_PLATFORM_ADMIN: 'true',
} as NodeJS.ProcessEnv;

const withEnv = (over: Record<string, string | undefined>) => ({ ...VALID, ...over }) as NodeJS.ProcessEnv;

describe('حارس أسرار الإنتاج', () => {
  it('يمرّ حين تكتمل الأسرار', () => {
    expect(() => assertProductionSecrets(VALID)).not.toThrow();
  });

  it('لا يسري خارج الإنتاج — التطوير يعمل بقيم مريحة', () => {
    expect(() => assertProductionSecrets({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).not.toThrow();
    expect(() => assertProductionSecrets({ NODE_ENV: 'test' } as NodeJS.ProcessEnv)).not.toThrow();
  });

  it.each([
    ['JWT_ACCESS_SECRET', undefined],
    ['SECRETS_ENCRYPTION_KEY', undefined],
    ['INTEGRATIONS_ENC_KEY', undefined],
    ['S3_PUBLIC_URL', undefined],
    ['DATABASE_URL', undefined],
  ])('يرفض غياب %s', (name) => {
    expect(() => assertProductionSecrets(withEnv({ [name]: undefined }))).toThrow(ProductionSecretsError);
  });

  describe('⚖️ مفاتيحُ تشفير الحقول الحسّاسة (ق-١٣٤٥)', () => {
    it.each(['PII_ENCRYPTION_KEYS', 'PII_ENCRYPTION_KEY_ID', 'PII_BLIND_INDEX_KEY'])('يرفض غياب %s', (name) => {
      expect(() => assertProductionSecrets(withEnv({ [name]: undefined }))).toThrow(new RegExp(name));
    });

    it('يرفض مفتاحاً ليس ٣٢ بايتاً — ومفتاحَ الاختبار (بايتٌ واحدٌ مكرَّر)', () => {
      expect(() => assertProductionSecrets(withEnv({ PII_ENCRYPTION_KEYS: `k2026a:${Buffer.alloc(16, 9).toString('base64')}` }))).toThrow(/٣٢ بايتاً/);
      expect(() => assertProductionSecrets(withEnv({ PII_ENCRYPTION_KEYS: `k2026a:${Buffer.alloc(32, 0x11).toString('base64')}` }))).toThrow(/بايتٌ واحدٌ مكرَّر/);
    });

    it('يرفض معرّفاً نشيطاً ليس في الحلقة', () => {
      expect(() => assertProductionSecrets(withEnv({ PII_ENCRYPTION_KEY_ID: 'k2025z' }))).toThrow(/ليس في الحلقة/);
    });

    it('يرفض مفتاحَ بصمةٍ هو مفتاحُ تشفيرٍ نفسُه — «بمفتاحٍ منفصل»', () => {
      expect(() => assertProductionSecrets(withEnv({ PII_BLIND_INDEX_KEY: `b2026a:${key32(1)}` }))).toThrow(/بمفتاحٍ منفصل/);
    });

    it('ولا يطبع مفتاحاً في رسالته — المعرّفُ وحدَه', () => {
      // التوكيدُ داخل الالتقاط — فحالةٌ لا ترمي لا تمرّ صامتة.
      expect.assertions(1);
      try {
        assertProductionSecrets(withEnv({ PII_ENCRYPTION_KEY_ID: 'k2025z' }));
      } catch (e) {
        expect(String((e as Error).message)).not.toContain(key32(1));
      }
    });
  });

  it('يرفض قيمة المثال change-me ولو كانت طويلة', () => {
    const t = () => assertProductionSecrets(withEnv({ JWT_ACCESS_SECRET: 'change-me-access-secret-min-32-chars-padding' }));
    expect(t).toThrow(ProductionSecretsError);
    expect(t).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('يرفض كلمات مرور التطوير المعروفة', () => {
    expect(() => assertProductionSecrets(withEnv({ DATABASE_URL: 'postgresql://app_user:app_user_dev_password@postgres:5432/mad_app' }))).toThrow(
      ProductionSecretsError,
    );
  });

  it('يرفض الاتصال بدور غير app_user — الدور الأعلى يتجاوز RLS بصمت', () => {
    expect(() => assertProductionSecrets(withEnv({ DATABASE_URL: 'postgresql://postgres:realpass@postgres:5432/mad_app' }))).toThrow(/app_user/);
  });

  it('يرفض WEB_ORIGIN بلا https', () => {
    expect(() => assertProductionSecrets(withEnv({ WEB_ORIGIN: 'http://app.mad-app.sa' }))).toThrow(/https/);
  });

  it('يرفض S3_PUBLIC_URL بلا مخطّط — العنوان الداخلي minio:9000 لا يُحلّ في المتصفح', () => {
    expect(() => assertProductionSecrets(withEnv({ S3_PUBLIC_URL: 'minio:9000' }))).toThrow(/S3_PUBLIC_URL/);
  });

  it('يرفض مفتاحاً أقصر من الحد', () => {
    expect(() => assertProductionSecrets(withEnv({ INTEGRATIONS_ENC_KEY: 'short' }))).toThrow(/INTEGRATIONS_ENC_KEY/);
  });

  it('يجمع كل الأخطاء في رسالة واحدة — لا دورة إصلاحٍ لكل سرّ على خادم بعيد', () => {
    try {
      assertProductionSecrets(withEnv({ JWT_ACCESS_SECRET: undefined, INTEGRATIONS_ENC_KEY: undefined, S3_PUBLIC_URL: undefined }));
      throw new Error('كان يجب أن يرمي');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('JWT_ACCESS_SECRET');
      expect(msg).toContain('INTEGRATIONS_ENC_KEY');
      expect(msg).toContain('S3_PUBLIC_URL');
      expect(msg).toMatch(/1\..*\n.*2\..*\n.*3\./s);
    }
  });

  it('لا يطبع قيمة سرٍّ قط — سجلّ الحاوية يُحفظ', () => {
    const leaky = 'change-me-but-this-value-must-never-appear-in-output';
    try {
      assertProductionSecrets(withEnv({ JWT_ACCESS_SECRET: leaky }));
    } catch (e) {
      expect((e as Error).message).not.toContain(leaky);
      expect((e as Error).message).toContain('JWT_ACCESS_SECRET');
    }
  });
});

/**
 * ⑬A1 (`ق-١٣٣٣`) — **ما يُطلب حين يُفعَّل البريد**: مرسِلٌ من نطاقٍ يُصادَق، وحدٌّ يوميٌّ معلَن.
 * وبلا `SMTP_HOST` لا يُطلبان — فالحارسُ على تفعيل الميزة لا على كلِّ إقلاع.
 */
describe('⑬A1 — البريدُ المفعَّل يُطلب له مرسِلٌ وحدٌّ معلَن (ق-١٣٣٣)', () => {
  const MAIL = { SMTP_HOST: 'smtp.email.me-riyadh-1.oci.oraclecloud.com', SMTP_FROM: '"ركز" <no-reply@rikzapp.com>', MAIL_DAILY_LIMIT: '200' };
  const reasons = (over: Record<string, string | undefined>): string => {
    try {
      assertProductionSecrets(withEnv(over));
      return '';
    } catch (e) {
      return (e as Error).message;
    }
  };

  it('① بلا SMTP_HOST لا يُطلب مرسِلٌ ولا حدّ — والإقلاعُ القائمُ بلا بريدٍ لا يسقط', () => {
    expect(reasons({ SMTP_FROM: undefined, MAIL_DAILY_LIMIT: undefined })).toBe('');
  });

  it('② معه ومع الاثنين صحيحَين ⟸ يمرّ', () => {
    expect(reasons(MAIL)).toBe('');
    expect(reasons({ ...MAIL, SMTP_FROM: 'no-reply@rikzapp.com', MAIL_DAILY_LIMIT: '50000' })).toBe('');
  });

  it('③ الحدُّ غائباً أو ليس عدداً صحيحاً موجباً ⟸ يُرفض ويسمّي مصدرَه في وحدة التحكّم', () => {
    for (const bad of [undefined, '0', 'مئة', '١٠٠', '100.5']) {
      const msg = reasons({ ...MAIL, MAIL_DAILY_LIMIT: bad });
      expect(msg).toContain('MAIL_DAILY_LIMIT');
      expect(msg).toContain('max-emails-day');
    }
  });

  it('⭐ ④ المرسِلُ غائباً أو من نطاقٍ لا يُصادَق ⟸ يُرفض — فالافتراضيُّ mad-app.local لا يخرج بريداً', () => {
    expect(reasons({ ...MAIL, SMTP_FROM: undefined })).toContain('SMTP_FROM — غير مضبوط');
    expect(reasons({ ...MAIL, SMTP_FROM: 'no-reply@mad-app.local' })).toContain('نطاقٌ محلّيّ لا يُصادَق');
    expect(reasons({ ...MAIL, SMTP_FROM: 'ركز' })).toContain('بلا عنوانٍ صحيح');
    // وقيمةُ المثال تُمسك كسائر الأسرار.
    expect(reasons({ ...MAIL, SMTP_FROM: 'no-reply@example.com' })).toContain('SMTP_FROM — ما زال يحمل قيمة المثال');
  });

  it('⑤ ويُجمعان مع غيرهما في رسالةٍ واحدة — لا دورةَ إصلاحٍ لكلِّ متغيّر', () => {
    const msg = reasons({ ...MAIL, SMTP_FROM: undefined, MAIL_DAILY_LIMIT: undefined, JWT_ACCESS_SECRET: undefined });
    expect(msg).toContain('JWT_ACCESS_SECRET');
    expect(msg).toContain('SMTP_FROM');
    expect(msg).toContain('MAIL_DAILY_LIMIT');
  });
});

/**
 * ③ (`ق-١٣٣١`) — **متتبّعُ الأخطاء حين يُضبط**: عنوانٌ صالحٌ عبر `https` — وغيابُه جائزٌ لأن خادمَه شرطُ تشغيل.
 */
describe('③ — عنوانُ متتبّع الأخطاء يُقبل صالحاً عبر https أو لا يُضبط (ق-١٣٣١)', () => {
  const reasons = (over: Record<string, string | undefined>): string => {
    try {
      assertProductionSecrets(withEnv(over));
      return '';
    } catch (e) {
      return (e as Error).message;
    }
  };

  it('① غائباً لا يُطلب — فلا يسقط إقلاعٌ قبل وجود الخادم المستقلّ', () => {
    expect(reasons({ ERROR_TRACKING_DSN: undefined })).toBe('');
  });

  it('② صالحاً عبر https ⟸ يمرّ', () => {
    expect(reasons({ ERROR_TRACKING_DSN: 'https://k3y@errors.rikzapp.com/3' })).toBe('');
  });

  it('③ عبر http أو بلا مفتاحٍ أو بلا رقم مشروع ⟸ يُرفض — ولا يُقلع كأن التتبّعَ يعمل وهو صامت', () => {
    for (const bad of ['http://k3y@errors.rikzapp.com/3', 'http://k3y@127.0.0.1:9000/3', 'https://errors.rikzapp.com/3', 'https://k3y@errors.rikzapp.com/x']) {
      expect(reasons({ ERROR_TRACKING_DSN: bad })).toContain('ERROR_TRACKING_DSN — صيغةٌ غير صالحة');
    }
  });
});

describe('second factor required for platform accounts in production', () => {
  it('boots when MFA_REQUIRED_FOR_PLATFORM_ADMIN is true', () => {
    expect(() => assertProductionSecrets(withEnv({ MFA_REQUIRED_FOR_PLATFORM_ADMIN: 'true' }))).not.toThrow();
  });

  it.each([[undefined], ['false'], [''], ['yes']])('refuses to boot when MFA_REQUIRED_FOR_PLATFORM_ADMIN is %p', (value) => {
    expect(() => assertProductionSecrets(withEnv({ MFA_REQUIRED_FOR_PLATFORM_ADMIN: value }))).toThrow(/MFA_REQUIRED_FOR_PLATFORM_ADMIN/);
  });
});
