import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';

/** Global: any module that needs to send an email (auth reset today, invoices
 * or reminders tomorrow) injects MailService without extra wiring. */
@Global()
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
