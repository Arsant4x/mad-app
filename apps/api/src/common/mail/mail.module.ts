import { Global, Module } from '@nestjs/common';
import { MailQuotaService } from './mail-quota.service';
import { MailService } from './mail.service';

/** Global: any module that needs to send an email (auth reset today, invoices
 * or reminders tomorrow) injects MailService without extra wiring.
 * `MailQuotaService` (⑬A1 · `ق-١٣٣٣`) عدّادُ الحدّ اليوميّ — داخليٌّ للوحدة، يستعمله `MailService` وحدَه. */
@Global()
@Module({
  providers: [MailService, MailQuotaService],
  exports: [MailService],
})
export class MailModule {}
