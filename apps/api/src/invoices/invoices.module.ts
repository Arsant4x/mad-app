import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { PermissionsModule } from '../delegations/permissions.module';

@Module({
  // ⚖️ **إذنُ تجاوز حدّ الائتمان يُقرأ من `PermissionsService`** (`ق-٣٤٠`) —
  //    **وهو عينُ ما تقرؤه الواجهة**، فلا نسخةَ حسابٍ ثانية تفترق عنه.
  //    و`AuditModule` عامّة (`@Global`) فلا تُستورَد.
  imports: [PermissionsModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  // The POS rings sales as real invoices — same numbering, VAT and ledger
  // posting — so the cashier module builds on this service instead of forking it.
  exports: [InvoicesService],
})
export class InvoicesModule {}
