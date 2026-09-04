import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { WriteOffAttachmentsService } from './write-off-attachments.service';
import { WriteOffsService } from './write-offs.service';

@Module({
  imports: [FilesModule],
  controllers: [InventoryController],
  providers: [InventoryService, WriteOffsService, WriteOffAttachmentsService],
})
export class InventoryModule {}
