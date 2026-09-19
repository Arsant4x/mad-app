import { Module } from '@nestjs/common';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';
import { PurchaseAttachmentsService } from './purchase-attachments.service';
import { SupplierPaymentsController } from './supplier-payments.controller';
import { SupplierPaymentsService } from './supplier-payments.service';
import { SupplierNotesService } from './supplier-notes.service';
import { GoodsReceiptsService } from './goods-receipts.service';
import { LandedCostsService } from './landed-costs.service';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [FilesModule],
  controllers: [PurchasesController, SupplierPaymentsController],
  providers: [PurchasesService, PurchaseAttachmentsService, SupplierPaymentsService, SupplierNotesService, GoodsReceiptsService, LandedCostsService],
})
export class PurchasesModule {}
