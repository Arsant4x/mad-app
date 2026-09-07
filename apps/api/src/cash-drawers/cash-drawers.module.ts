import { Module } from '@nestjs/common';
import { CashDrawersController } from './cash-drawers.controller';
import { CashDrawersService } from './cash-drawers.service';

@Module({
  controllers: [CashDrawersController],
  providers: [CashDrawersService],
  exports: [CashDrawersService],
})
export class CashDrawersModule {}
