import { Module } from '@nestjs/common';
import { InvoicesModule } from '../invoices/invoices.module';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';

@Module({
  imports: [InvoicesModule],
  controllers: [PosController],
  providers: [PosService],
})
export class PosModule {}
