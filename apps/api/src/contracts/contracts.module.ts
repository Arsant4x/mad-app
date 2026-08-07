import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { ContractAttachmentsService } from './contract-attachments.service';
import { ClaimAttachmentsService } from './claim-attachments.service';
import { HandoverPhotosService } from './handover-photos.service';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';

@Module({
  imports: [FilesModule],
  controllers: [ContractsController],
  providers: [ContractsService, ContractAttachmentsService, ClaimAttachmentsService, HandoverPhotosService],
})
export class ContractsModule {}
