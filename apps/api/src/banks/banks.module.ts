import { Module } from '@nestjs/common';
import { BanksController } from './banks.controller';
import { BanksService } from './banks.service';
import { ReconciliationService } from './reconciliation.service';

@Module({
  controllers: [BanksController],
  providers: [BanksService, ReconciliationService],
})
export class BanksModule {}
