import { assertProductionSecrets, ProductionSecretsError } from './production-secrets';

/**
 * الحارس الذي يمنع «الإقلاع الأخضر بأسرار المثال».
 *
 * يُختبر بالسقوط لا بالنجاح: لكل سبب رفضٍ حالتُه، لأن حارساً يمرّ دائماً
 * أسوأ من غيابه — يمنح ثقة بلا تغطية.
 */
const VALID = {
  NODE_ENV: 'production',
  JWT_ACCESS_SECRET: 'a'.repeat(64),
  SECRETS_ENCRYPTION_KEY: 'b'.repeat(64),
  INTEGRATIONS_ENC_KEY: 'c'.repeat(64),
  S3_SECRET_KEY: 'd'.repeat(32),
  S3_PUBLIC_URL: 'https://files.mad-app.sa',
  WEB_ORIGIN: 'https://app.mad-app.sa',
  DATABASE_URL: 'postgresql://app_user:s3cret@postgres:5432/mad_app?schema=public',
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
