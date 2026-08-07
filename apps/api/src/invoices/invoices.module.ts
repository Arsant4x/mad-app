import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  controllers: [InvoicesController],
  providers: [InvoicesService],
  // The POS rings sales as real invoices — same numbering, VAT and ledger
  // posting — so the cashier module builds on this service instead of forking it.
  exports: [InvoicesService],
})
export class InvoicesModule {}
