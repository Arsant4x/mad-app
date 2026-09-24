import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ZatcaModule } from '../zatca/zatca.module';
import { PaymentsModule } from '../payments/payments.module';
import { PosCardVerificationsService } from './pos-card-verifications.service';
import { PosController } from './pos.controller';
import { PosPaymentAttemptsService } from './pos-payment-attempts.service';
import { PosService } from './pos.service';

@Module({
  // سندُ قبض بيع الكاشير يمرّ بوحدة الدفعات لا بمسارٍ ثانٍ (ق-٣١٦).
  imports: [InvoicesModule, IntegrationsModule, ZatcaModule, PaymentsModule],
  controllers: [PosController],
  // محاولةُ دفع البطاقة وكانسُها ورفعُ غير المطابَق (`ق-١٤٠١` · `ق-١٣٩٧`) — مهامٌّ مجدولة تُسجَّل مزوّداتٍ هنا.
  providers: [PosService, PosPaymentAttemptsService, PosCardVerificationsService],
})
export class PosModule {}
