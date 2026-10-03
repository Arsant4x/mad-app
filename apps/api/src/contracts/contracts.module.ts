import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { FormsModule } from '../forms/forms.module';
import { ContractAttachmentsService } from './contract-attachments.service';
import { ClaimAttachmentsService } from './claim-attachments.service';
import { ContractFormsController } from './contract-forms.controller';
import { ContractFormsService } from './contract-forms.service';
import { HandoverPhotosService } from './handover-photos.service';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { RentAccrualService } from './rent-accrual.service';
import { RentRecognitionService } from './rent-recognition.service';

@Module({
  imports: [FilesModule, FormsModule],
  controllers: [ContractsController, ContractFormsController],
  providers: [ContractsService, ContractAttachmentsService, ClaimAttachmentsService, HandoverPhotosService, RentRecognitionService, RentAccrualService, ContractFormsService],
})
export class ContractsModule {}
