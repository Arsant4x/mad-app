import { Module } from '@nestjs/common';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';
import { PurchaseAttachmentsService } from './purchase-attachments.service';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [FilesModule],
  controllers: [PurchasesController],
  providers: [PurchasesService, PurchaseAttachmentsService],
})
export class PurchasesModule {}
