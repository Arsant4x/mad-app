import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { WriteOffsService } from './write-offs.service';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, WriteOffsService],
})
export class InventoryModule {}
