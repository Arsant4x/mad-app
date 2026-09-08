import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ZatcaModule } from '../zatca/zatca.module';
import { PaymentsModule } from '../payments/payments.module';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';

@Module({
  // سندُ قبض بيع الكاشير يمرّ بوحدة الدفعات لا بمسارٍ ثانٍ (ق-٣١٦).
  imports: [InvoicesModule, IntegrationsModule, ZatcaModule, PaymentsModule],
  controllers: [PosController],
  providers: [PosService],
})
export class PosModule {}
