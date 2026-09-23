import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MailQuotaService } from './mail-quota.service';
import { MailService } from './mail.service';

/**
 * ⑬A1 (`ق-١٣٣٣`) — **وصلُ عدّاد الحدّ بخدمة البريد**: كلُّ رسالةٍ تُعدّ قبل تسليمها للمزوّد، والسجلُّ يُنذر
 * مرّةً عند ثمانين بالمئة ويُخطئ باسمٍ عند البلوغ — **والإرسالُ يمضي في الحالين، ويمضي إن تعذّر العدّ**.
 *
 * والعدّادُ نفسُه يُثبته `mail-quota.live.spec.ts` حيّاً؛ وهذا يُثبت **أنّ الخدمة تناديه وتقرأ جوابه**.
 */
type Sent = { from: string; to: string; subject: string; text: string };

function build(env: Record<string, string>, recordSend: () => Promise<{ before: number; after: number }>) {
  const config = { get: (key: string, fallback?: string) => env[key] ?? fallback } as unknown as ConfigService;
  const quota = { recordSend: jest.fn(recordSend) } as unknown as MailQuotaService & { recordSend: jest.Mock };
  const service = new MailService(config, quota);
  const sent: Sent[] = [];
  // المزوّدُ مزيَّف: لا اتصالَ بخادم SMTP — يُسجَّل ما سُلِّم إليه.
  (service as unknown as { transporter: unknown }).transporter = env.SMTP_HOST
    ? { sendMail: jest.fn(async (m: Sent) => void sent.push(m)) }
    : null;
  return { service, quota, sent };
}

const MAIL = { SMTP_HOST: 'smtp.email.me-riyadh-1.oci.oraclecloud.com', SMTP_PORT: '465', SMTP_FROM: 'no-reply@rikzapp.com', MAIL_DAILY_LIMIT: '200' };

describe('⑬A1 — خدمةُ البريد تعدّ كلَّ رسالةٍ وتُنذر قبل الحدّ (ق-١٣٣٣)', () => {
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('① عبورُ ثمانين بالمئة ⟸ إنذارٌ يطلب الرفع — والرسالةُ تُسلَّم', async () => {
    const { service, quota, sent } = build(MAIL, async () => ({ before: 159, after: 160 }));
    await service.send('merchant@example.org', 'استعادة', 'نصّ');
    expect(quota.recordSend).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('اطلب رفعَ الحدّ'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('160 من حدّ المزوّد 200'));
    expect(error).not.toHaveBeenCalled();
  });

  it('② البلوغُ ⟸ خطأٌ مسمّى — والرسالةُ تُسلَّم (المزوّدُ هو الحَكَم)', async () => {
    const { service, sent } = build(MAIL, async () => ({ before: 199, after: 200 }));
    await service.send('merchant@example.org', 'استعادة', 'نصّ');
    expect(sent).toHaveLength(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('بلغ حدَّ المزوّد (200)'));
  });

  it('③ ما دون العتبة وما فوقها بلا عبور ⟸ صمت — فإنذارٌ مع كلِّ رسالةٍ ضجيجٌ يُتجاهَل', async () => {
    for (const pos of [{ before: 10, after: 11 }, { before: 170, after: 171 }]) {
      const { service } = build(MAIL, async () => pos);
      await service.send('merchant@example.org', 'استعادة', 'نصّ');
    }
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('⭐ ④ تعذُّرُ العدّ لا يحجب الإرسال — يُخطئ السجلُّ باسمٍ وتُسلَّم الرسالة', async () => {
    const { service, sent } = build(MAIL, async () => {
      throw new Error('connection refused');
    });
    await service.send('merchant@example.org', 'استعادة', 'نصّ');
    expect(sent).toHaveLength(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('تعذّر عدُّ الرسالة'));
  });

  it('⑤ بلا SMTP_HOST لا مزوّدَ فلا عدّ — التطويرُ يطبع الرسالةَ كما كان', async () => {
    const { service, quota } = build({}, async () => ({ before: 0, after: 1 }));
    await service.send('dev@example.org', 'استعادة', 'نصّ');
    expect(quota.recordSend).not.toHaveBeenCalled();
  });

  it('⑥ بلا حدٍّ معلَن يُعدّ ولا يُنذر — وحارسُ الإقلاع هو الذي يمنعه في الإنتاج', async () => {
    const { service, quota } = build({ ...MAIL, MAIL_DAILY_LIMIT: '' }, async () => ({ before: 159, after: 160 }));
    await service.send('merchant@example.org', 'استعادة', 'نصّ');
    expect(quota.recordSend).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });
});
