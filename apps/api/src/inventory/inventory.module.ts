import { Module } from '@nestjs/common';
import { PermissionsModule } from '../delegations/permissions.module';
import { FilesModule } from '../files/files.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { StockOpeningsService } from './stock-openings.service';
import { WriteOffAttachmentsService } from './write-off-attachments.service';
import { WriteOffsService } from './write-offs.service';

@Module({
  // A movement that reduces inventory value checks review through the same grants the screen reads.
  imports: [FilesModule, PermissionsModule],
  controllers: [InventoryController],
  providers: [InventoryService, WriteOffsService, WriteOffAttachmentsService, StockOpeningsService],
})
export class InventoryModule {}
