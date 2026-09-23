import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailQuotaService } from './mail-quota.service';
import { mailQuotaCrossing, parseMailDailyLimit } from './mail-quota.util';

/**
 * Outbound email, behind plain SMTP env vars so it works with ANY provider the
 * owner signs up with (SendGrid, SES, Mailgun, a Saudi provider…) — no
 * per-vendor SDK to swap later:
 *
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * With no SMTP_HOST configured (local dev), the message is written to the
 * server log instead — the reset link still exists somewhere the developer can
 * grab it, and nothing silently pretends an email was sent.
 *
 * ⑬A1 (`ق-١٣٣٣`): **وكلُّ رسالةٍ تُعدّ في نافذة «آخر أربعٍ وعشرين ساعة» عند المزوّد** (`MailQuotaService`)،
 * والحدُّ مُعلَنٌ في `MAIL_DAILY_LIMIT` كما تعرضه حجرةُ الحدود في وحدة التحكّم — **فيُنذر السجلُّ عند ثمانين
 * بالمئة ليُطلب الرفعُ قبل أن يُبلغ**، ويُخطئ باسمٍ عند البلوغ. والإرسالُ يمضي في الحالين: المزوّدُ هو الحَكَم.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly from: string;
  /** الحدُّ اليوميّ المعلَن — `null` بلا إعلان (فالعدّادُ يعدّ ولا يُنذر، وحارسُ الإقلاع يمنعه في الإنتاج). */
  private readonly dailyLimit: number | null;

  constructor(
    private readonly config: ConfigService,
    private readonly quota: MailQuotaService,
  ) {
    const host = this.config.get<string>('SMTP_HOST');
    this.dailyLimit = parseMailDailyLimit(this.config.get<string>('MAIL_DAILY_LIMIT'));
    this.from = this.config.get<string>('SMTP_FROM', 'no-reply@mad-app.local');
    this.transporter = host
      ? nodemailer.createTransport({
          host,
          port: parseInt(this.config.get<string>('SMTP_PORT', '587'), 10),
          secure: this.config.get<string>('SMTP_PORT') === '465',
          auth: this.config.get<string>('SMTP_USER')
            ? { user: this.config.get<string>('SMTP_USER'), pass: this.config.get<string>('SMTP_PASS') }
            : undefined,
        })
      : null;
  }

  /** True when a real SMTP server is configured (production posture). */
  get configured(): boolean {
    return this.transporter !== null;
  }

  async send(to: string, subject: string, text: string): Promise<void> {
    if (!this.transporter) {
      // نصّ الرسالة يحمل **رمز استعادة كلمة المرور صالحاً**. طباعته مقبولة على
      // جهاز المطوّر (هي الطريقة الوحيدة لالتقاط الرابط بلا SMTP)، وكارثة على
      // خادم: سجلّات الحاوية تُلتقط وتُشحن وتُحفظ، فيصير كل رمز استعادة
      // مقروءاً لأي من يملك اطلاعاً على السجل — وSMTP غير مهيّأ هو الحالة
      // الافتراضية الموثَّقة في DEPLOY.md، لا حالة نادرة.
      if (process.env.NODE_ENV === 'production') {
        this.logger.error(`SMTP غير مهيّأ — لم تُرسَل رسالة إلى ${to} («${subject}»). اضبط SMTP_* وإلا فاستعادة كلمة المرور معطَّلة.`);
        return;
      }
      this.logger.warn(`SMTP not configured — email to ${to} logged instead:\n--- ${subject} ---\n${text}`);
      return;
    }
    await this.countTowardsDailyLimit();
    await this.transporter.sendMail({ from: this.from, to, subject, text });
  }

  /**
   * يعدّ الرسالةَ **قبل** تسليمها للمزوّد — فالمرفوضُ منه يُعدّ، والإنذارُ يقع مبكّراً لا متأخّراً — ويُنذر مرّةً
   * عند عبور العتبة. **ولا يحجب الإرسال إن تعذّر العدّ**: العدّادُ إنذارٌ لا بوّابة، ورسالةُ استعادة كلمة المرور
   * أهمُّ من عدّها؛ فيُخطئ السجلُّ باسمٍ ويمضي الإرسال.
   */
  private async countTowardsDailyLimit(): Promise<void> {
    try {
      const { before, after } = await this.quota.recordSend();
      const crossing = mailQuotaCrossing(before, after, this.dailyLimit);
      if (crossing === 'warn') {
        this.logger.warn(
          `البريدُ المُرسَل في آخر ٢٤ ساعة بلغ ${after} من حدّ المزوّد ${this.dailyLimit} (٨٠٪) — اطلب رفعَ الحدّ من وحدة التحكّم قبل أن يُبلغ (MAIL_DAILY_LIMIT · ق-١٣٣٣).`,
        );
      } else if (crossing === 'limit') {
        this.logger.error(
          `البريدُ المُرسَل في آخر ٢٤ ساعة بلغ حدَّ المزوّد (${this.dailyLimit}) — ما بعده يرفضه المزوّد حتى تنقضي النافذة أو يُرفع الحدّ (MAIL_DAILY_LIMIT · ق-١٣٣٣).`,
        );
      }
    } catch (err) {
      this.logger.error(`تعذّر عدُّ الرسالة في حدّ البريد اليوميّ — تُرسَل بلا عدّ: ${(err as Error).message}`);
    }
  }
}
