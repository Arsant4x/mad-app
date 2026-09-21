import { Module } from '@nestjs/common';
import { BanksController } from './banks.controller';
import { BanksService } from './banks.service';
import { ReconciliationService } from './reconciliation.service';
import { CashDepositsService } from './cash-deposits.service';

@Module({
  controllers: [BanksController],
  providers: [BanksService, ReconciliationService, CashDepositsService],
})
export class BanksModule {}
