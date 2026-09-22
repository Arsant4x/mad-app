import { Module } from '@nestjs/common';
import { BanksController } from './banks.controller';
import { BanksService } from './banks.service';
import { ReconciliationService } from './reconciliation.service';
import { CashDepositsService } from './cash-deposits.service';
import { NetworkSettlementsService } from './network-settlements.service';

@Module({
  controllers: [BanksController],
  providers: [BanksService, ReconciliationService, CashDepositsService, NetworkSettlementsService],
})
export class BanksModule {}
