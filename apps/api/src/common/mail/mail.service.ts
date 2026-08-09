import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

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
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
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
    await this.transporter.sendMail({ from: this.from, to, subject, text });
  }
}
