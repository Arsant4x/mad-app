import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { QuoteConversionController, QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';

@Module({
  // التحويل يمرّ بخدمة الفواتير نفسها — لا مسار فوترة موازٍ (قاعدة 11).
  imports: [InvoicesModule],
  controllers: [QuotesController, QuoteConversionController],
  providers: [QuotesService],
})
export class QuotesModule {}
