import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService],
  // أعمار الذمم (4.6) والتسوية البنكية (7.4) ستقرآن من هنا لا من حقول مخزَّنة.
  exports: [PaymentsService],
})
export class PaymentsModule {}
