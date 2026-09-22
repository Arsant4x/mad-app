import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  // ④A1: فائضُ سند القبض يُصدر فاتورةَ دفعةٍ مقدَّمة (386) بالمسار الذي يُصدر الفواتير — لا مسارَ ثانٍ.
  imports: [InvoicesModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  // أعمار الذمم (4.6) والتسوية البنكية (7.4) ستقرآن من هنا لا من حقول مخزَّنة.
  exports: [PaymentsService],
})
export class PaymentsModule {}
