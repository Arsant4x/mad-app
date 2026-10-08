import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { assertProductionSecrets, bootGuardedVariables, ProductionSecretsError } from '../common/config/production-secrets';
import { MSG } from '../common/i18n/messages';
import {
  IDENTITY_PROVIDER_FACTORIES,
  MockIdentityProvider,
  MockSmsChannel,
  providerProblem,
  SMS_CHANNEL_FACTORIES,
  TEST_ONLY_IDENTITY_PROVIDERS,
  TEST_ONLY_SMS_PROVIDERS,
} from './providers';
import { VerificationGateway } from './verification-gateway.service';

/**
 * ⚖️ توجيه ٢٨٧ ⑩ و⑫ — **المزوّدُ التجريبيّ ممنوعٌ في الإنتاج عند الإقلاع وعند كلِّ استعمال، وغيابُ المزوّد يُرفض باسمه، والرمزُ لا يُطبع**.
 *
 * مزوّدُ رسائلَ تجريبيٌّ في الإنتاج يجعل الرابطَ والرمزَ لا يصلان أحداً والمسارَ «يعمل»، ومزوّدُ هويّةٍ تجريبيٌّ يوافق بلا تحقّق — وهو
 * صنفُ الجهاز التجريبيّ بعينه (`mock-provider-guard.spec.ts`). فالحاجزان معاً، والرفضُ بالرمي.
 */
describe('مزوّدا الرسائل والهويّة — الحاجزان والغياب', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('كلُّ محوّلٍ مسجَّلٍ مصنَّفٌ — والتجريبيُّ وحدَه في السجلّ اليوم (لم يُتعاقد مع مزوّد)', () => {
    for (const name of Object.keys(SMS_CHANNEL_FACTORIES)) expect(TEST_ONLY_SMS_PROVIDERS.has(name) || providerProblem('SMS', name) === null).toBe(true);
    for (const name of Object.keys(IDENTITY_PROVIDER_FACTORIES)) expect(TEST_ONLY_IDENTITY_PROVIDERS.has(name) || providerProblem('IDENTITY', name) === null).toBe(true);
    expect(Object.keys(SMS_CHANNEL_FACTORIES)).toEqual(['MOCK']);
    expect(Object.keys(IDENTITY_PROVIDER_FACTORIES)).toEqual(['MOCK']);
  });

  it('الإقلاعُ في الإنتاج يرفض التجريبيَّ والمجهول ويقبل الغياب', () => {
    const base = { ...saved, NODE_ENV: 'production' };
    const problemsOf = (env: NodeJS.ProcessEnv) => {
      try {
        assertProductionSecrets(env);
        return '';
      } catch (e) {
        expect(e).toBeInstanceOf(ProductionSecretsError);
        return (e as Error).message;
      }
    };
    expect(problemsOf({ ...base, SMS_PROVIDER: 'mock' })).toContain('SMS_PROVIDER');
    expect(problemsOf({ ...base, IDENTITY_PROVIDER: 'MOCK' })).toContain('IDENTITY_PROVIDER');
    expect(problemsOf({ ...base, SMS_PROVIDER: 'NOSUCH' })).toContain('SMS_PROVIDER');
    const without = problemsOf({ ...base, SMS_PROVIDER: '', IDENTITY_PROVIDER: '' });
    expect(without).not.toContain('SMS_PROVIDER');
    expect(without).not.toContain('IDENTITY_PROVIDER');
    expect(bootGuardedVariables()).toEqual(expect.arrayContaining(['SMS_PROVIDER', 'IDENTITY_PROVIDER']));
  });

  it('الاستعمالُ في الإنتاج يرفض التجريبيَّ برميٍ مسمّى — ولو أقلع الخادمُ بغير الحارس', async () => {
    process.env.NODE_ENV = 'production';
    process.env.SMS_PROVIDER = 'MOCK';
    process.env.IDENTITY_PROVIDER = 'MOCK';
    const gateway = new VerificationGateway();
    expect(() => gateway.sms()).toThrow(MSG.sms_test_provider_in_production);
    expect(() => gateway.identity()).toThrow(MSG.identity_test_provider_in_production);
    // والمحوّلُ نفسُه يرفض إن بلغه طريقٌ آخر: الحاجزُ في الإرسال لا في الاختيار وحدَه.
    await expect(new MockSmsChannel().send({ to: '+966555123442', text: 'x' })).rejects.toThrow(ServiceUnavailableException);
    await expect(new MockIdentityProvider().start({ nationalId: '1000000008' })).rejects.toThrow(ServiceUnavailableException);
  });

  it('بلا مزوّدٍ مضبوط ⟵ رفضٌ باسمه، ولا نزولَ إلى التجريبيّ', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.SMS_PROVIDER;
    delete process.env.IDENTITY_PROVIDER;
    const gateway = new VerificationGateway();
    expect(() => gateway.sms()).toThrow(MSG.sms_provider_missing);
    expect(() => gateway.identity()).toThrow(MSG.identity_provider_missing);
  });

  it('خارجَ الإنتاج: التجريبيُّ يحفظ ما أرسل، ولا يكتب نصَّ الرسالة في السجلّ (الرمزُ لا يُطبع)', async () => {
    process.env.NODE_ENV = 'test';
    process.env.SMS_PROVIDER = 'MOCK';
    const lines: string[] = [];
    const spy = jest.spyOn(Logger.prototype, 'log').mockImplementation((m: unknown) => void lines.push(String(m)));
    try {
      const gateway = new VerificationGateway();
      const channel = gateway.sms() as MockSmsChannel;
      expect(gateway.sms()).toBe(channel);
      await channel.send({ to: '+966555123442', text: 'رمزُ التحقّق 482913' });
      expect(channel.lastTo('+966555123442')?.text).toContain('482913');
      expect(lines.length).toBeGreaterThan(0);
      expect(lines.join('\n')).not.toContain('482913');
    } finally {
      spy.mockRestore();
    }
  });

  it('مزوّدُ الهويّة التجريبيّ: حكمٌ مضبوطٌ يغلب القبول، والمرفوضُ بلا رقم هويّة', async () => {
    process.env.NODE_ENV = 'test';
    const p = new MockIdentityProvider();
    const a = await p.start({ nationalId: '1000000008' });
    expect(await p.status(a.transactionId)).toEqual({ decision: 'APPROVED', nationalId: '1000000008' });
    const b = await p.start({ nationalId: '1000000016' });
    p.decide(b.transactionId, 'REJECTED');
    expect(await p.status(b.transactionId)).toEqual({ decision: 'REJECTED', nationalId: null });
    expect((await p.status('no-such')).decision).toBe('EXPIRED');
  });
});
